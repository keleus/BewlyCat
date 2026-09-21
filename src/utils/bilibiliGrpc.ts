import type { TrialStream } from './trialQualityProtocol'

export const PLAY_VIEW_UNITE_URL = 'https://grpc.biliapi.net/bilibili.app.playerunite.v1.Player/PlayViewUnite'
const BILI_APP_BUILD = 8440300
const SPMID = 'main.ugc-video-detail.0.0'

type PbField = [number, 'v', number | bigint | boolean | undefined] | [number, 's', string | undefined] | [number, 'm' | 'b', Uint8Array | undefined]
export interface PbItem { f: number, w: number, v: bigint | Uint8Array }

function varintBytes(value: number | bigint): number[] {
  let remaining = BigInt(value)
  if (remaining < BigInt(0) || remaining > BigInt('18446744073709551615'))
    throw new Error('protobuf 整数超出 uint64 范围')
  const bytes: number[] = []
  do {
    const byte = Number(remaining & BigInt(127))
    remaining >>= BigInt(7)
    bytes.push(remaining ? byte | 128 : byte)
  } while (remaining)
  return bytes
}

export function encodeProtobuf(fields: PbField[]): Uint8Array<ArrayBuffer> {
  const bytes: number[] = []
  for (const [field, kind, value] of fields) {
    if (!Number.isInteger(field) || field < 1 || field > 0x1FFFFFFF)
      throw new Error('protobuf 字段编号无效')
    if (value === undefined)
      continue
    if (kind === 'v') {
      if (!value)
        continue
      bytes.push(...varintBytes(field * 8), ...varintBytes(value === true ? 1 : value))
    }
    else {
      const data = typeof value === 'string' ? new TextEncoder().encode(value) : value
      bytes.push(...varintBytes(field * 8 + 2), ...varintBytes(data.length))
      for (const byte of data)
        bytes.push(byte)
    }
  }
  return new Uint8Array(bytes)
}

export function decodeProtobuf(buffer: Uint8Array): PbItem[] {
  let offset = 0
  const take = (length: number) => {
    if (!Number.isSafeInteger(length) || length < 0 || length > buffer.length - offset)
      throw new Error('protobuf 字段被截断')
    const bytes = buffer.subarray(offset, offset + length)
    offset += length
    return bytes
  }
  const readVarint = () => {
    let value = BigInt(0)
    for (let index = 0; index < 10; index++) {
      const byte = take(1)[0]
      if (index === 9 && byte > 1)
        throw new Error('protobuf varint 溢出')
      value |= BigInt(byte & 127) << BigInt(index * 7)
      if (!(byte & 128))
        return value
    }
    throw new Error('protobuf varint 未终止')
  }
  const items: PbItem[] = []
  while (offset < buffer.length) {
    const key = readVarint()
    const f = Number(key >> BigInt(3))
    const w = Number(key & BigInt(7))
    if (f < 1 || f > 0x1FFFFFFF)
      throw new Error('protobuf 字段编号无效')
    if (w === 0)
      items.push({ f, w, v: readVarint() })
    else if (w === 1 || w === 5)
      items.push({ f, w, v: take(w === 1 ? 8 : 4) })
    else if (w === 2)
      items.push({ f, w, v: take(Number(readVarint())) })
    else
      throw new Error('protobuf wire type 不支持')
  }
  return items
}

export function grpcFrame(message: Uint8Array): Uint8Array<ArrayBuffer> {
  const framed = new Uint8Array(message.length + 5)
  new DataView(framed.buffer).setUint32(1, message.length)
  framed.set(message, 5)
  return framed
}

export function grpcUnframe(body: Uint8Array): Uint8Array {
  if (body.length < 5 || body[0] !== 0)
    throw new Error('gRPC 空响应或不支持的压缩帧')
  const length = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(1)
  if (length === 0 || length !== body.length - 5)
    throw new Error('gRPC 帧长度无效')
  return body.subarray(5)
}

export interface PlayViewUniteRequestOptions {
  aid?: number
  bvid?: string
  cid: number
}

export function buildPlayViewUniteRequest(options: PlayViewUniteRequestOptions): Uint8Array<ArrayBuffer> {
  const vod = encodeProtobuf([
    [1, 'v', options.aid],
    [2, 'v', options.cid],
    [3, 'v', 120],
    [5, 'v', 4048],
    [7, 'v', 2],
    [8, 'v', true],
    [9, 'v', 1],
    [11, 'v', true],
  ])
  return grpcFrame(encodeProtobuf([[1, 'm', vod], [2, 's', SPMID], [3, 's', SPMID], [5, 's', options.bvid]]))
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes)
    text += String.fromCharCode(byte)
  return btoa(text)
}

export function buildPlayViewUniteHeaders(accessKey: string, buvid: string): Record<string, string> {
  const metadata = encodeProtobuf([
    [1, 's', accessKey],
    [2, 's', 'android'],
    [3, 's', 'phone'],
    [4, 'v', BILI_APP_BUILD],
    [5, 's', 'master'],
    [6, 's', buvid],
    [7, 's', 'android'],
  ])
  return {
    'content-type': 'application/grpc',
    'grpc-encoding': 'identity',
    'grpc-accept-encoding': 'identity',
    'x-bili-metadata-bin': toBase64(metadata),
    // 服务端仅在 WIFI 下提供试用流。
    'x-bili-network-bin': toBase64(encodeProtobuf([[1, 'v', 1]])),
  }
}

function numberField(items: PbItem[], field: number): number {
  const value = items.find(item => item.f === field && item.w === 0)?.v
  if (typeof value !== 'bigint')
    return 0
  const number = Number(value)
  if (!Number.isSafeInteger(number))
    throw new Error('protobuf 数值超出安全整数范围')
  return number
}

function bytesField(items: PbItem[], field: number): Uint8Array | undefined {
  const value = items.find(item => item.f === field && item.w === 2)?.v
  return value instanceof Uint8Array ? value : undefined
}

function stringField(items: PbItem[], field: number): string {
  return new TextDecoder().decode(bytesField(items, field))
}

function messages(items: PbItem[], field: number): PbItem[][] {
  return items.filter(item => item.f === field && item.w === 2 && item.v instanceof Uint8Array)
    .map(item => decodeProtobuf(item.v as Uint8Array))
}

function urls(items: PbItem[], base: number, backup: number): string[] {
  const values = [stringField(items, base), ...items.filter(item => item.f === backup && item.w === 2)
    .map(item => new TextDecoder().decode(item.v as Uint8Array))]
  return [...new Set(values.filter(Boolean))]
}

export interface PlayViewUniteResult {
  quality: number
  streams: TrialStream[]
  trial: { trialAble: boolean, remainingTimes: number, timeLength: number } | null
}

export function parsePlayViewUniteReply(body: Uint8Array): PlayViewUniteResult {
  const top = decodeProtobuf(grpcUnframe(body))
  const vod = messages(top, 1)[0]
  if (!vod)
    throw new Error('gRPC 响应没有 vod_info')
  const streams: TrialStream[] = []
  for (const stream of messages(vod, 5)) {
    const info = messages(stream, 1)[0]
    const dash = messages(stream, 2)[0]
    if (!info || !dash || bytesField(dash, 12)?.length)
      continue
    streams.push({
      quality: numberField(info, 1),
      format: stringField(info, 2),
      description: stringField(info, 11) || stringField(info, 3),
      needVip: numberField(info, 6) === 1,
      vipFree: numberField(info, 14) === 1,
      codecid: numberField(dash, 4),
      width: numberField(dash, 10),
      height: numberField(dash, 11),
      bandwidth: numberField(dash, 3),
      frameRate: stringField(dash, 9),
      size: numberField(dash, 6),
      audioId: numberField(dash, 7),
      urls: urls(dash, 1, 2),
    })
  }
  const trial = messages(top, 7)[0]
  return {
    quality: numberField(vod, 1),
    streams,
    trial: trial ? { trialAble: numberField(trial, 1) === 1, remainingTimes: numberField(trial, 2), timeLength: numberField(trial, 4) } : null,
  }
}
