import browser from 'webextension-polyfill'

import type {
  AccountAddByCookiePayload,
  AccountListResult,
  AccountLoginPollResult,
  AccountLoginStartPayload,
  AccountLoginStartResult,
  AccountMutationResult,
  AccountRenamePayload,
  AccountSummary,
  AccountSwitcherErrorCode,
  AccountSwitchResult,
} from '~/constants/accountSwitcher'
import {
  ACCOUNT_AUTH_COOKIE_NAMES,
  ACCOUNT_COOKIE_DOMAIN,
  ACCOUNT_LOGIN_SESSION_STORAGE_KEY,
  ACCOUNT_LOGIN_TIMEOUT_MS,
  ACCOUNT_PROFILES_STORAGE_KEY,
  BILIBILI_LOGIN_URL,
} from '~/constants/accountSwitcher'

import { clearWbiKeys } from './wbiSign'

type AccountCookieSameSite = 'no_restriction' | 'lax' | 'strict' | 'unspecified'

interface AccountCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite?: AccountCookieSameSite
  expirationDate?: number
}

interface AccountProfile {
  id: string
  mid: number
  uname: string
  face: string
  alias?: string
  cookies: AccountCookie[]
  savedAt: number
  lastUsedAt?: number
}

interface LoginSession {
  tabId?: number
  callerTabId?: number
  baselineSessdata?: string
  restore: AccountCookie[] | null
  switchAfterLogin: boolean
  startedAt: number
}

interface NavData {
  mid: number
  uname: string
  face: string
}

interface NavResponse {
  code: number
  data?: Partial<NavData>
}

const AUTH_COOKIE_NAME_SET = new Set<string>(ACCOUNT_AUTH_COOKIE_NAMES)

// 手动粘贴的 Cookie 只有 SESSDATA 是 HttpOnly，其余需要被页面脚本读取。
const MANUAL_HTTP_ONLY_COOKIES = new Set(['SESSDATA'])
const MANUAL_COOKIE_LIFETIME_SECONDS = 180 * 24 * 60 * 60

// 所有“读-改-写”串行执行，避免多标签页同时切换时 Cookie 交错。
let mutationQueue: Promise<unknown> = Promise.resolve()
let loginPollRunning = false

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = mutationQueue.then(task, task)
  mutationQueue = next.then(() => undefined, () => undefined)
  return next
}

function failure(code: AccountSwitcherErrorCode) {
  return { ok: false as const, code }
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function buildCookieUrl(domain: string, path: string): string {
  const host = domain.replace(/^\./, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `https://${host}${normalizedPath}`
}

function readMid(cookies: AccountCookie[]): number | undefined {
  const value = cookies.find(cookie => cookie.name === 'DedeUserID')?.value
  const mid = Number(value)
  return Number.isFinite(mid) && mid > 0 ? mid : undefined
}

async function readProfiles(): Promise<AccountProfile[]> {
  const stored = await browser.storage.local.get(ACCOUNT_PROFILES_STORAGE_KEY)
  const value = stored[ACCOUNT_PROFILES_STORAGE_KEY]
  if (!Array.isArray(value))
    return []

  return value.filter((item): item is AccountProfile => {
    if (!item || typeof item !== 'object')
      return false
    const profile = item as Partial<AccountProfile>
    return typeof profile.id === 'string'
      && typeof profile.mid === 'number'
      && Array.isArray(profile.cookies)
  })
}

async function writeProfiles(profiles: AccountProfile[]): Promise<void> {
  await browser.storage.local.set({ [ACCOUNT_PROFILES_STORAGE_KEY]: profiles })
}

async function readLoginSession(): Promise<LoginSession | null> {
  const stored = await browser.storage.local.get(ACCOUNT_LOGIN_SESSION_STORAGE_KEY)
  const value = stored[ACCOUNT_LOGIN_SESSION_STORAGE_KEY]
  if (!value || typeof value !== 'object')
    return null
  return value as LoginSession
}

async function writeLoginSession(session: LoginSession): Promise<void> {
  await browser.storage.local.set({ [ACCOUNT_LOGIN_SESSION_STORAGE_KEY]: session })
}

async function clearLoginSession(): Promise<void> {
  await browser.storage.local.remove(ACCOUNT_LOGIN_SESSION_STORAGE_KEY)
}

function hasUsableLogin(cookies: AccountCookie[]): boolean {
  return readMid(cookies) !== undefined
    && cookies.some(cookie => cookie.name === 'SESSDATA' && Boolean(cookie.value))
}

async function loginSessionTabExists(session: LoginSession): Promise<boolean> {
  if (session.tabId === undefined)
    return true
  try {
    await browser.tabs.get(session.tabId)
    return true
  }
  catch {
    return false
  }
}

/**
 * 会话只会由轮询、取消或关闭登录页收尾；任何一步被打断（内容脚本重载、
 * 发起页关闭、后台短暂不可用）都会把它留在 storage 里，导致此后一直
 * 返回 LOGIN_IN_PROGRESS。这里在每次使用前先判断是否已经失效并自愈。
 */
async function getLoginSessionForUse(): Promise<LoginSession | null> {
  const session = await readLoginSession()
  if (!session)
    return null

  const expired = Date.now() - session.startedAt > ACCOUNT_LOGIN_TIMEOUT_MS
  const tabGone = !(await loginSessionTabExists(session))

  if (!expired && !tabGone)
    return session

  try {
    const current = await captureAuthCookies()
    const currentMid = readMid(current)
    const restoreMid = readMid(session.restore ?? [])
    const completed = currentMid !== undefined
      && hasUsableLogin(current)
      && currentMid !== restoreMid

    if (completed && session.switchAfterLogin) {
      const nav = await fetchNav()
      await persistProfile(createProfile(currentMid, nav.code === 0 ? nav.data : undefined, current))
      await finishLoginSession(session, true, false)
    }
    else {
      // 未完成登录，或完成了但只要求“添加不切换”：保存新账号后恢复原账号。
      await finishLoginSession(session, false, false)
    }
  }
  catch {
    // 收尾失败也必须移除会话，否则会永久卡在 LOGIN_IN_PROGRESS。
    await clearLoginSession().catch(() => {})
  }

  return null
}

async function getBilibiliAuthCookies(): Promise<browser.Cookies.Cookie[]> {
  const cookies = await browser.cookies.getAll({ domain: ACCOUNT_COOKIE_DOMAIN })
  return cookies.filter(cookie => AUTH_COOKIE_NAME_SET.has(cookie.name))
}

async function captureAuthCookies(): Promise<AccountCookie[]> {
  const cookies = await getBilibiliAuthCookies()
  return cookies
    .filter(cookie => Boolean(cookie.value))
    .map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite as AccountCookieSameSite,
      expirationDate: cookie.expirationDate,
    }))
}

async function removeCookies(cookies: browser.Cookies.Cookie[], label: string): Promise<void> {
  const failures: string[] = []
  await Promise.all(cookies.map(async (cookie) => {
    try {
      await browser.cookies.remove({
        url: buildCookieUrl(cookie.domain, cookie.path),
        name: cookie.name,
      })
    }
    catch (error) {
      failures.push(`${cookie.name}@${cookie.domain}${cookie.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))

  if (failures.length)
    console.warn(`[BewlyCat] ${label}: ${failures.length} cookie(s) failed to remove`, failures)
}

async function clearAuthCookies(): Promise<void> {
  await removeCookies(await getBilibiliAuthCookies(), 'clearAuthCookies')
}

function toSetDetails(cookie: AccountCookie): browser.Cookies.SetDetailsType {
  const details: browser.Cookies.SetDetailsType = {
    // url 是必填项，Chrome 用它推断协议与默认域；
    // domain 同时传入以保留 .bilibili.com 的通配子域形式。
    url: buildCookieUrl(cookie.domain, cookie.path),
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    // 扩展的登录态判断（document.cookie）依赖 DedeUserID 可被脚本读取。
    httpOnly: cookie.name === 'DedeUserID' ? false : cookie.httpOnly,
  } as browser.Cookies.SetDetailsType
  // Chrome 的 SetDetailsType 不接受 'unspecified'，省略即表示不设置 SameSite。
  // SameSite=None 必须搭配 Secure，否则 Chrome 会拒绝写入，这种情况直接省略。
  if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
    if (cookie.sameSite !== 'no_restriction' || cookie.secure)
      details.sameSite = cookie.sameSite
  }
  if (cookie.expirationDate !== undefined)
    details.expirationDate = cookie.expirationDate
  return details
}

/**
 * 逐条写入 Cookie。Chrome 的参数校验错误是同步抛出的，
 * `Promise.allSettled(map(...))` 拦不住，必须用 async 包一层。
 */
async function writeCookies(cookies: AccountCookie[], label: string): Promise<number> {
  const failures: string[] = []
  await Promise.all(cookies.map(async (cookie) => {
    try {
      await browser.cookies.set(toSetDetails(cookie))
    }
    catch (error) {
      failures.push(`${cookie.name}@${cookie.domain}${cookie.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))

  if (failures.length)
    console.warn(`[BewlyCat] ${label}: ${failures.length} cookie(s) failed to write`, failures)

  return failures.length
}

/**
 * 写入一组身份 Cookie，并删除不属于这组的身份 Cookie。
 *
 * 全程不清空：先同名覆盖，再清理多余项。切换期间 Cookie 罐里始终有一组
 * 可用身份，避免其它标签页在清空窗口里请求 nav 拿到 -101 而被判为退出登录。
 */
async function applyAuthCookies(cookies: AccountCookie[]): Promise<void> {
  const nowSeconds = Date.now() / 1000
  const wanted = cookies.filter(cookie =>
    cookie.expirationDate === undefined || cookie.expirationDate > nowSeconds,
  )

  await writeCookies(wanted, 'applyAuthCookies')

  const wantedKeys = new Set(wanted.map(cookie => cookieKey(cookie.name, cookie.domain, cookie.path)))
  const current = await getBilibiliAuthCookies()
  await removeCookies(
    current.filter(cookie => !wantedKeys.has(cookieKey(cookie.name, cookie.domain, cookie.path))),
    'applyAuthCookies',
  )
}

function cookieKey(name: string, domain: string, path: string): string {
  return `${name}|${domain}|${path}`
}

function maskSessdata(value: string | undefined): string {
  if (!value)
    return '(none)'
  return `${value.slice(0, 6)}…(${value.length})`
}

/**
 * 读回 Cookie 罐确认会话已落到目标账号。
 *
 * 只比对 DedeUserID 与 SESSDATA 是否存在：B 站会例行轮换 SESSDATA，
 * 字符串完全相等的判定会产生假失败；服务端身份以随后的 nav 为准。
 * 这里按键名在整组 bilibili Cookie 中查找，避免 url/domain 作用域造成的假阴性。
 */
async function verifyAuthCookies(profile: AccountProfile): Promise<boolean> {
  const targetDedeUserId = profile.cookies.find(cookie => cookie.name === 'DedeUserID')?.value
  if (!targetDedeUserId)
    return false

  const cookies = await getBilibiliAuthCookies()
  const sessdata = cookies.find(cookie => cookie.name === 'SESSDATA')?.value
  const dedeUserId = cookies.find(cookie => cookie.name === 'DedeUserID')?.value

  const ok = Boolean(sessdata) && dedeUserId === targetDedeUserId

  if (!ok) {
    console.warn('[BewlyCat] Account cookie verification mismatch:', {
      expected: { mid: profile.mid, dedeUserId: targetDedeUserId },
      actual: { dedeUserId, sessdata: maskSessdata(sessdata) },
    })
  }

  return ok
}

/** 切换失败时尽量把原账号写回去；即使收尾本身出错也不再清空 Cookie 罐。 */
async function restoreAuthCookies(previous: AccountCookie[]): Promise<void> {
  if (!previous.length)
    return
  try {
    await applyAuthCookies(previous)
  }
  catch (error) {
    console.warn('[BewlyCat] restoreAuthCookies failed, retrying individual writes:', error)
    await writeCookies(previous, 'restoreAuthCookies')
  }
}

async function getSessdata(): Promise<string | undefined> {
  const cookie = await browser.cookies.get({ url: 'https://www.bilibili.com/', name: 'SESSDATA' })
  return cookie?.value || undefined
}

async function fetchNav(): Promise<NavResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      method: 'GET',
      credentials: 'include',
      headers: { Referer: 'https://www.bilibili.com/' },
      signal: controller.signal,
    })
    return await response.json() as NavResponse
  }
  catch {
    return { code: -1 }
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * APP 授权是单份 token，属于切换前的账号；切号后只清本地缓存，不吊销旧账号的 token。
 * 写入时必须用 JSON 字符串，与 useStorageLocal 的对象序列化保持一致。
 */
async function resetAppAuthStorage(): Promise<void> {
  await browser.storage.local.set({
    appAuthTokens: JSON.stringify({
      appKey: '',
      accessToken: '',
      refreshToken: '',
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      mid: null,
      lastUpdatedAt: null,
    }),
    accessKey: '',
  })
}

function createProfile(mid: number, user: Partial<NavData> | undefined, cookies: AccountCookie[]): AccountProfile {
  return {
    id: '',
    mid,
    uname: user?.uname ?? '',
    face: user?.face ?? '',
    cookies,
    savedAt: Date.now(),
  }
}

function areCookiesEqual(left: AccountCookie[], right: AccountCookie[]): boolean {
  if (left.length !== right.length)
    return false
  return left.every((cookie) => {
    const other = right.find(item => item.name === cookie.name)
    return other?.value === cookie.value && other.expirationDate === cookie.expirationDate
  })
}

async function persistProfile(profile: AccountProfile): Promise<AccountProfile> {
  const profiles = await readProfiles()
  const index = profiles.findIndex(item => item.mid === profile.mid)

  if (index === -1) {
    const created: AccountProfile = { ...profile, id: createId() }
    profiles.push(created)
    await writeProfiles(profiles)
    return created
  }

  const existing = profiles[index]
  const updated: AccountProfile = {
    ...existing,
    uname: profile.uname || existing.uname,
    face: profile.face || existing.face,
    cookies: profile.cookies,
    savedAt: profile.savedAt,
  }
  profiles[index] = updated
  await writeProfiles(profiles)
  return updated
}

async function syncCurrentProfileUnlocked(): Promise<AccountProfile | null> {
  const cookies = await captureAuthCookies()
  const mid = readMid(cookies)
  if (mid === undefined)
    return null

  const profiles = await readProfiles()
  const existing = profiles.find(profile => profile.mid === mid)
  const missingProfileInfo = !existing || !existing.uname || !existing.face
  if (existing && !missingProfileInfo && areCookiesEqual(existing.cookies, cookies))
    return existing

  const nav = await fetchNav()
  // nav 可能顺带轮换 SESSDATA，保存时以请求后的 Cookie 为准。
  const latestCookies = nav.code === 0 ? await captureAuthCookies() : cookies
  return persistProfile(createProfile(mid, nav.code === 0 ? nav.data : undefined, latestCookies))
}

function isProfileExpired(profile: AccountProfile): boolean {
  const sessdata = profile.cookies.find(cookie => cookie.name === 'SESSDATA')
  if (!sessdata?.value)
    return true
  return sessdata.expirationDate !== undefined && sessdata.expirationDate <= Date.now() / 1000
}

function toSummary(profile: AccountProfile, currentMid: number | undefined): AccountSummary {
  return {
    id: profile.id,
    mid: profile.mid,
    uname: profile.uname,
    face: profile.face,
    alias: profile.alias,
    savedAt: profile.savedAt,
    lastUsedAt: profile.lastUsedAt,
    expired: isProfileExpired(profile),
    isCurrent: currentMid === profile.mid,
  }
}

async function markLastUsed(id: string): Promise<void> {
  const profiles = await readProfiles()
  const index = profiles.findIndex(profile => profile.id === id)
  if (index === -1)
    return
  profiles[index] = { ...profiles[index], lastUsedAt: Date.now() }
  await writeProfiles(profiles)
}

export async function listAccounts(callerTabId?: number): Promise<AccountListResult> {
  try {
    // 自愈与快照写入串行执行，避免与并发切换交错。
    const session = await enqueue(async () => {
      await getLoginSessionForUse()
      await syncCurrentProfileUnlocked()
      return readLoginSession()
    })

    const [profiles, cookies] = await Promise.all([
      readProfiles(),
      captureAuthCookies(),
    ])
    const currentMid = readMid(cookies)
    const accounts = profiles
      .map(profile => toSummary(profile, currentMid))
      .sort((left, right) => {
        if (left.isCurrent !== right.isCurrent)
          return left.isCurrent ? -1 : 1
        return (right.lastUsedAt ?? right.savedAt) - (left.lastUsedAt ?? left.savedAt)
      })

    // 发起页已不在时由其它标签页兜底推进一次轮询，避免会话无人收尾。
    if (session && session.callerTabId !== callerTabId)
      void pollAccountLogin()

    return { ok: true, accounts, loginPending: session !== null }
  }
  catch {
    return failure('UNAVAILABLE')
  }
}

export async function switchAccount(accountId: string): Promise<AccountSwitchResult> {
  return enqueue(async () => {
    try {
      if (await getLoginSessionForUse())
        return failure('LOGIN_IN_PROGRESS')

      // 先把当前账号的最新 Cookie（SESSDATA 会轮换）写回快照，再切换。
      await syncCurrentProfileUnlocked()

      const profiles = await readProfiles()
      const target = profiles.find(profile => profile.id === accountId)
      if (!target)
        return failure('NOT_FOUND')
      if (isProfileExpired(target))
        return failure('EXPIRED')

      const currentCookies = await captureAuthCookies()
      const currentMid = readMid(currentCookies)

      if (currentMid === target.mid) {
        await markLastUsed(target.id)
        return { ok: true, accountId: target.id, mid: target.mid, unchanged: true }
      }

      try {
        await applyAuthCookies(target.cookies)

        // 先确认 Cookie 罐里的值确实是目标账号（写入是否生效），
        // 再用 nav 确认这组凭据在服务端仍然有效。
        if (!(await verifyAuthCookies(target)))
          throw new Error('Account cookies were not applied')

        const nav = await fetchNav()
        if (nav.code !== 0 || nav.data?.mid !== target.mid) {
          console.warn('[BewlyCat] nav verification failed:', {
            code: nav.code,
            actualMid: nav.data?.mid,
            expectedMid: target.mid,
          })
          throw new Error('Account switch verification failed')
        }
      }
      catch (error) {
        // 校验失败时回滚到切换前状态，避免停在“静默未登录”。
        console.warn('[BewlyCat] Account switch failed, restoring previous account:', error)
        await restoreAuthCookies(currentCookies)
        return failure('SWITCH_FAILED')
      }

      // Cookie 罐已切到目标账号并经服务端校验通过；后续簿记失败不应让一次成功的切换
      // 被报成“服务不可用”——这些只是 lastUsedAt、WBI 缓存与 APP 授权本地态。
      try {
        await markLastUsed(target.id)
        clearWbiKeys()
        await resetAppAuthStorage()

        // 校验请求可能让 B 站轮换了 SESSDATA，顺手把目标账号的快照更新为最新值。
        await syncCurrentProfileUnlocked().catch(() => {})
      }
      catch (bookkeepingError) {
        console.warn('[BewlyCat] switchAccount post-switch bookkeeping failed (switch still succeeded):', bookkeepingError)
      }

      // 由内容脚本在拿到结果后自行 reload，避免刷新先于响应到达。
      return { ok: true, accountId: target.id, mid: target.mid }
    }
    catch (e) {
      console.error('[BewlyCat] switchAccount unexpected error:', e)
      return failure('UNAVAILABLE')
    }
  })
}

export async function startAccountLogin(payload?: AccountLoginStartPayload, callerTabId?: number): Promise<AccountLoginStartResult> {
  return enqueue(async () => {
    try {
      if (await getLoginSessionForUse())
        return failure('LOGIN_IN_PROGRESS')

      const restore = await captureAuthCookies()
      const currentMid = readMid(restore)
      if (currentMid !== undefined) {
        const nav = await fetchNav()
        await persistProfile(createProfile(currentMid, nav.code === 0 ? nav.data : undefined, restore))
      }

      const baselineSessdata = restore.find(cookie => cookie.name === 'SESSDATA')?.value
      let tab: browser.Tabs.Tab | undefined

      try {
        tab = await browser.tabs.create({ url: BILIBILI_LOGIN_URL, active: true })
        await clearAuthCookies()
        await writeLoginSession({
          tabId: tab.id,
          callerTabId,
          baselineSessdata,
          restore: restore.length > 0 ? restore : null,
          switchAfterLogin: payload?.switchAfterLogin !== false,
          startedAt: Date.now(),
        })
      }
      catch {
        // 清 Cookie 后一旦写会话失败，必须把原账号还原，否则会停在未登录状态。
        if (restore.length)
          await restoreAuthCookies(restore)
        if (tab?.id !== undefined)
          await browser.tabs.remove(tab.id).catch(() => {})
        return failure('UNAVAILABLE')
      }

      return { ok: true }
    }
    catch {
      return failure('UNAVAILABLE')
    }
  })
}

export async function pollAccountLogin(): Promise<AccountLoginPollResult> {
  if (loginPollRunning)
    return { ok: true, status: 'pending' }

  loginPollRunning = true
  try {
    // 超时、登录页已关闭或会话已被其它路径收尾时返回 null。
    // 此时登录态可能已被还原，通知调用页刷新以重新读取账号。
    const session = await enqueue(() => getLoginSessionForUse())
    if (!session)
      return failure('LOGIN_TIMEOUT')

    const sessdata = await getSessdata()
    if (!sessdata || sessdata === session.baselineSessdata)
      return { ok: true, status: 'pending' }

    // 扫码确认后 DedeUserID / bili_jct 会稍晚于 SESSDATA 落盘。
    await delay(600)

    const nav = await fetchNav()
    if (nav.code !== 0 || !nav.data?.mid)
      return { ok: true, status: 'pending' }

    const mid = nav.data.mid
    const navData = nav.data

    // 捕获、保存与结束会话放在同一串行任务里，避免与取消操作交错。
    const profile = await enqueue(async () => {
      const currentSession = await readLoginSession()
      if (!currentSession)
        return null

      const cookies = await captureAuthCookies()
      const saved = await persistProfile(createProfile(mid, navData, cookies))
      await finishLoginSession(currentSession, currentSession.switchAfterLogin)
      return saved
    })

    if (!profile)
      return failure('NOT_FOUND')

    return {
      ok: true,
      status: 'done',
      accountId: profile.id,
      mid: profile.mid,
      switched: session.switchAfterLogin,
    }
  }
  catch {
    return failure('UNAVAILABLE')
  }
  finally {
    loginPollRunning = false
  }
}

export async function cancelAccountLogin(): Promise<AccountMutationResult> {
  return enqueue(async () => {
    try {
      const session = await readLoginSession()
      if (!session)
        return { ok: true }
      await finishLoginSession(session, false)
      return { ok: true }
    }
    catch {
      return failure('UNAVAILABLE')
    }
  })
}

async function finishLoginSession(session: LoginSession, keepNewAccount: boolean, closeTab = true): Promise<void> {
  if (keepNewAccount) {
    clearWbiKeys()
    await resetAppAuthStorage()
  }
  else {
    // 取消/超时/自愈都要先判断登录是否其实已经完成：已完成时先保存该账号，
    // 再恢复原账号，避免把用户刚扫码成功的会话直接丢掉。
    const current = await captureAuthCookies()
    const currentMid = readMid(current)
    const restoreMid = readMid(session.restore ?? [])

    if (currentMid !== undefined && hasUsableLogin(current) && currentMid !== restoreMid) {
      const nav = await fetchNav()
      await persistProfile(createProfile(currentMid, nav.code === 0 ? nav.data : undefined, current))
      if (session.restore?.length)
        await applyAuthCookies(session.restore)
    }
    else if (session.restore?.length) {
      await applyAuthCookies(session.restore)
    }
  }

  await clearLoginSession()

  if (closeTab && session.tabId !== undefined) {
    await browser.tabs.remove(session.tabId).catch(() => {
      // 用户可能已经手动关闭登录页。
    })
  }
}

function parseCookieString(input: string): Map<string, string> {
  const result = new Map<string, string>()

  for (const part of input.split(/;\s*|\r?\n+/)) {
    const trimmed = part.trim()
    if (!trimmed)
      continue

    const separator = trimmed.indexOf('=')
    if (separator <= 0)
      continue

    const name = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()
    if (!name || !value || !AUTH_COOKIE_NAME_SET.has(name))
      continue

    result.set(name, value)
  }

  return result
}

function buildManualCookies(pairs: Map<string, string>): AccountCookie[] {
  const expirationDate = Math.floor(Date.now() / 1000) + MANUAL_COOKIE_LIFETIME_SECONDS

  return Array.from(pairs, ([name, value]) => ({
    name,
    value,
    domain: '.bilibili.com',
    path: '/',
    secure: true,
    httpOnly: MANUAL_HTTP_ONLY_COOKIES.has(name),
    expirationDate,
  }))
}

export async function addAccountByCookie(payload: AccountAddByCookiePayload): Promise<AccountMutationResult> {
  return enqueue(async () => {
    try {
      if (await getLoginSessionForUse())
        return failure('LOGIN_IN_PROGRESS')

      const pairs = parseCookieString(payload.cookieString)
      if (!pairs.has('SESSDATA') || !pairs.has('DedeUserID'))
        return failure('INVALID_INPUT')

      const backup = await captureAuthCookies()

      try {
        const manual = buildManualCookies(pairs)
        await applyAuthCookies(manual)

        const manualProfile = createProfile(Number(pairs.get('DedeUserID')), undefined, manual)
        if (!(await verifyAuthCookies(manualProfile)))
          throw new Error('Cookie write verification failed')

        const nav = await fetchNav()
        if (nav.code !== 0 || !nav.data?.mid)
          throw new Error('Cookie verification failed')

        // 以实际落盘的 Cookie 为准，B 站可能补齐 sid 等字段。
        const cookies = await captureAuthCookies()
        await persistProfile(createProfile(nav.data.mid, nav.data, cookies))
      }
      catch {
        await restoreAuthCookies(backup)
        return failure('COOKIE_INVALID')
      }

      clearWbiKeys()
      await resetAppAuthStorage()
      return { ok: true }
    }
    catch {
      return failure('UNAVAILABLE')
    }
  })
}

export async function renameAccount(payload: AccountRenamePayload): Promise<AccountMutationResult> {
  return enqueue(async () => {
    try {
      const profiles = await readProfiles()
      const index = profiles.findIndex(profile => profile.id === payload.id)
      if (index === -1)
        return failure('NOT_FOUND')

      const alias = payload.alias.trim().slice(0, 32)
      profiles[index] = { ...profiles[index], alias: alias || undefined }
      await writeProfiles(profiles)
      return { ok: true }
    }
    catch {
      return failure('UNAVAILABLE')
    }
  })
}

export async function removeAccount(id: string): Promise<AccountMutationResult> {
  return enqueue(async () => {
    try {
      const profiles = await readProfiles()
      const next = profiles.filter(profile => profile.id !== id)
      if (next.length === profiles.length)
        return failure('NOT_FOUND')
      await writeProfiles(next)
      return { ok: true }
    }
    catch {
      return failure('UNAVAILABLE')
    }
  })
}

/**
 * 用户手动关闭登录页（或发起登录的页面）时按“取消添加”处理，恢复登录前的账号。
 */
export function setupAccountSwitcher(): void {
  // 后台重启后先处理超时或登录页已不存在的残留会话。
  void enqueue(() => getLoginSessionForUse()).catch(() => {})

  browser.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const session = await readLoginSession()
      // 发起登录的页面关闭不影响登录页继续完成，只有登录页本身关闭才收尾。
      if (!session || session.tabId !== tabId)
        return

      await enqueue(async () => {
        // 登录页被关闭：若登录其实已经完成，按成功收尾（保留新账号或恢复原账号），
        // 否则按取消处理。
        const current = await captureAuthCookies()
        const currentMid = readMid(current)
        const restoreMid = readMid(session.restore ?? [])
        const completed = currentMid !== undefined
          && hasUsableLogin(current)
          && currentMid !== restoreMid

        if (completed && session.switchAfterLogin) {
          const nav = await fetchNav()
          await persistProfile(createProfile(currentMid, nav.code === 0 ? nav.data : undefined, current))
          return finishLoginSession(session, true, false)
        }

        return finishLoginSession(session, false, false)
      })
    })()
  })
}
