import browser from 'webextension-polyfill'

import { buildPlayViewUniteHeaders, buildPlayViewUniteRequest, parsePlayViewUniteReply, PLAY_VIEW_UNITE_URL } from '~/utils/bilibiliGrpc'
import { onMessage } from '~/utils/messaging'
import { parseMp4SegmentInfo } from '~/utils/mp4SegmentBase'
import type { FetchTrialQualityRequest, TrialQualityResult, TrialStream, WebDashVideoEntry } from '~/utils/trialQualityProtocol'
import { getStreamDeadline, isTrialQualityPageUrl, isTrialRecord, isTrialStreamUrl, isTrialVipQualityEnabled, isWebDashVideoEntry, normalizeTrialQualityPageRequest, TRIAL_QUALITY_FETCH_STREAMS_MESSAGE, TRIAL_STREAM_DEADLINE_MARGIN_SECONDS } from '~/utils/trialQualityProtocol'

import { ensureTrialStreamHeaderRule } from '../trialQualityHeaders'

const pending = new Map<string, Promise<TrialQualityResult>>()
let buvidPromise: Promise<string> | undefined
let authRevision = 0

function failure(reason: string): TrialQualityResult {
  return { ok: false, entries: [], deadline: null, reason }
}

function getBuvid(): Promise<string> {
  buvidPromise ??= browser.storage.local.get('trialQualityBuvid').then(async (stored) => {
    if (typeof stored.trialQualityBuvid === 'string' && /^XY[A-F0-9]{35}$/.test(stored.trialQualityBuvid))
      return stored.trialQualityBuvid
    const bytes = crypto.getRandomValues(new Uint8Array(18))
    const buvid = `XY${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 35)}`
    await browser.storage.local.set({ trialQualityBuvid: buvid })
    return buvid
  }).catch((error) => {
    buvidPromise = undefined
    throw error
  })
  return buvidPromise
}

/** Range 被忽略时也仅保留前缀，避免整段视频进入内存。 */
async function readBoundedBody(response: Response, limit: number, prefixOnly = false): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body)
    throw new Error('empty-body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break
      if (length + value.length > limit && !prefixOnly)
        throw new Error('response-too-large')
      const part = value.subarray(0, limit - length)
      chunks.push(part)
      length += part.length
      if (length === limit && prefixOnly)
        break
    }
  }
  finally {
    await reader.cancel().catch(() => {})
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

async function convertStream(stream: TrialStream, signal: AbortSignal): Promise<WebDashVideoEntry | null> {
  const candidates = stream.urls.filter(isTrialStreamUrl)
    .filter((url) => {
      const deadline = getStreamDeadline(url)
      return deadline === null || deadline > Date.now() / 1000 + TRIAL_STREAM_DEADLINE_MARGIN_SECONDS
    })
    .sort((a, b) => Number(new URL(a).hostname.includes('.mcdn.')) - Number(new URL(b).hostname.includes('.mcdn.')))
    .slice(0, 4)
  for (const baseUrl of candidates) {
    if (signal.aborted)
      break
    try {
      const response = await fetch(baseUrl, {
        headers: { range: 'bytes=0-65535' },
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal,
      })
      if ((response.status !== 206 && response.status !== 200)
        || (response.status === 206 && !/^bytes 0-\d+\/\d+$/.test(response.headers.get('content-range') || ''))) {
        await response.body?.cancel()
        continue
      }
      const segment = parseMp4SegmentInfo(await readBoundedBody(response, 65536, true))
      if (!segment)
        continue
      const backupUrl = candidates.filter(url => url !== baseUrl)
      const entry: WebDashVideoEntry = {
        id: stream.quality,
        baseUrl,
        base_url: baseUrl,
        backupUrl,
        backup_url: backupUrl,
        bandwidth: stream.bandwidth,
        mimeType: 'video/mp4',
        mime_type: 'video/mp4',
        codecs: segment.codecs,
        width: stream.width,
        height: stream.height,
        frameRate: stream.frameRate,
        frame_rate: stream.frameRate,
        sar: '1:1',
        startWithSap: 1,
        start_with_sap: 1,
        SegmentBase: { Initialization: segment.initialization, indexRange: segment.indexRange },
        segment_base: { initialization: segment.initialization, index_range: segment.indexRange },
        codecid: stream.codecid,
        __bewlyTrial: true,
      }
      return isWebDashVideoEntry(entry) ? entry : null
    }
    catch {
      // 只尝试官方提供的备用地址，不记录包含账号与签名的完整 URL。
    }
  }
  console.warn('[BewlyCat] 会员画质试用分片头不可用', stream.quality)
  return null
}

async function fetchStreams(request: FetchTrialQualityRequest): Promise<TrialQualityResult> {
  if (!await ensureTrialStreamHeaderRule())
    return failure('header-rule-unavailable')
  const buvid = await getBuvid()
  const signal = AbortSignal.timeout(5500)
  const response = await fetch(PLAY_VIEW_UNITE_URL, {
    method: 'POST',
    headers: buildPlayViewUniteHeaders(request.accessKey, buvid),
    body: buildPlayViewUniteRequest(request),
    credentials: 'omit',
    redirect: 'error',
    signal,
  })
  const grpcStatus = response.headers.get('grpc-status')
  if (!response.ok || (grpcStatus !== null && grpcStatus !== '0')) {
    await response.body?.cancel()
    return failure('grpc-rejected')
  }
  const reply = parsePlayViewUniteReply(await readBoundedBody(response, 1024 * 1024))
  const streams = reply.streams.filter(stream => stream.needVip && stream.codecid === 7 && stream.urls.length).slice(0, 8)
  const entries = (await Promise.all(streams.map(stream => convertStream(stream, signal))))
    .filter((entry): entry is WebDashVideoEntry => entry !== null)
  const deadlines = entries.flatMap(entry => [entry.baseUrl, ...entry.backupUrl])
    .map(getStreamDeadline)
    .filter((value): value is number => value !== null)
  return { ok: true, entries, deadline: deadlines.length ? Math.min(...deadlines) : null }
}

async function handleFetchStreams(value: unknown, sender?: browser.Runtime.MessageSender): Promise<TrialQualityResult> {
  if (sender?.id !== browser.runtime.id || !sender.tab || !sender.url || !isTrialQualityPageUrl(sender.url))
    return failure('invalid-sender')
  if (!isTrialRecord(value))
    return failure('invalid-request')
  const ids = normalizeTrialQualityPageRequest({ ...value, requestId: 1 })
  if (!ids || typeof value.accessKey !== 'string' || !/^[0-9a-f]{32}$/i.test(value.accessKey))
    return failure('invalid-request')
  const revision = authRevision
  const stored = await browser.storage.local.get(['settings', 'appAuthTokens'])
  if (!isTrialVipQualityEnabled(stored.settings))
    return failure('disabled')
  let auth: unknown
  try {
    auth = typeof stored.appAuthTokens === 'string' ? JSON.parse(stored.appAuthTokens) : stored.appAuthTokens
  }
  catch {
    return failure('no-app-token')
  }
  if (!isTrialRecord(auth) || auth.accessToken !== value.accessKey
    || (typeof auth.accessTokenExpiresAt === 'number' && auth.accessTokenExpiresAt <= Date.now())) {
    return failure('app-token-changed')
  }
  if (revision !== authRevision)
    return failure('state-changed')
  const key = `${sender.tab.id}:${sender.frameId}:${revision}:${ids.cid}`
  const existing = pending.get(key)
  if (existing)
    return existing
  if (pending.size >= 8)
    return failure('busy')
  const request: FetchTrialQualityRequest = { accessKey: value.accessKey, cid: ids.cid, aid: ids.aid, bvid: ids.bvid }
  const task = fetchStreams(request).then(result => revision === authRevision ? result : failure('state-changed')).catch(() => {
    console.warn('[BewlyCat] 会员画质试用请求失败，保留原画质')
    return failure('request-failed')
  }).finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}

export function setupTrialQualityMsgListeners() {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.appAuthTokens
      || (changes.settings && isTrialVipQualityEnabled(changes.settings.oldValue) !== isTrialVipQualityEnabled(changes.settings.newValue)))) {
      authRevision++
    }
  })
  onMessage(TRIAL_QUALITY_FETCH_STREAMS_MESSAGE, async (value, sender) => {
    try {
      return await handleFetchStreams(value, sender)
    }
    catch {
      return failure('background-error')
    }
  })
}
