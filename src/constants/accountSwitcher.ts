/**
 * 多账号切换：账号快照只保存身份类 Cookie，不保存 buvid3/buvid4/_uuid 等设备指纹。
 * 设备标识随浏览器保持稳定，既能降低触发风控的概率，也避免把设备信息写进账号列表。
 */
export const ACCOUNT_AUTH_COOKIE_NAMES = [
  'SESSDATA',
  'bili_jct',
  'DedeUserID',
  'DedeUserID__ckMd5',
  'sid',
  'bili_ticket',
  'bili_ticket_expires',
] as const

export const ACCOUNT_COOKIE_DOMAIN = 'bilibili.com'
export const BILIBILI_LOGIN_URL = 'https://passport.bilibili.com/login'

/** 账号快照与登录会话都放在独立本地键，不进入 settings，避免被云同步/导出。 */
export const ACCOUNT_PROFILES_STORAGE_KEY = 'biliAccountProfiles:v1'
export const ACCOUNT_LOGIN_SESSION_STORAGE_KEY = 'biliAccountLoginSession:v1'

export const ACCOUNT_LOGIN_TIMEOUT_MS = 5 * 60_000

export const ACCOUNT_SWITCHER_MESSAGE = {
  LIST: 'ACCOUNT_SWITCHER_LIST',
  SWITCH: 'ACCOUNT_SWITCHER_SWITCH',
  LOGIN_START: 'ACCOUNT_SWITCHER_LOGIN_START',
  LOGIN_POLL: 'ACCOUNT_SWITCHER_LOGIN_POLL',
  LOGIN_CANCEL: 'ACCOUNT_SWITCHER_LOGIN_CANCEL',
  ADD_BY_COOKIE: 'ACCOUNT_SWITCHER_ADD_BY_COOKIE',
  RENAME: 'ACCOUNT_SWITCHER_RENAME',
  REMOVE: 'ACCOUNT_SWITCHER_REMOVE',
} as const

export type AccountSwitcherErrorCode
  = | 'UNAVAILABLE'
    | 'NOT_FOUND'
    | 'EXPIRED'
    | 'LOGIN_IN_PROGRESS'
    | 'NOT_LOGGED_IN'
    | 'INVALID_INPUT'
    | 'COOKIE_INVALID'
    | 'SWITCH_FAILED'
    | 'LOGIN_TIMEOUT'

/** 错误码到 i18n key 的映射，账号浮层与账号面板共用。 */
export const ACCOUNT_SWITCHER_ERROR_MESSAGE_KEYS: Record<AccountSwitcherErrorCode, string> = {
  UNAVAILABLE: 'topbar.account_switcher.error_unavailable',
  NOT_FOUND: 'topbar.account_switcher.error_not_found',
  EXPIRED: 'topbar.account_switcher.error_expired',
  LOGIN_IN_PROGRESS: 'topbar.account_switcher.error_login_in_progress',
  NOT_LOGGED_IN: 'topbar.account_switcher.error_not_logged_in',
  INVALID_INPUT: 'topbar.account_switcher.error_invalid_input',
  COOKIE_INVALID: 'topbar.account_switcher.error_cookie_invalid',
  SWITCH_FAILED: 'topbar.account_switcher.error_switch_failed',
  LOGIN_TIMEOUT: 'topbar.account_switcher.error_login_timeout',
}

export interface AccountSummary {
  id: string
  mid: number
  uname: string
  face: string
  alias?: string
  savedAt: number
  lastUsedAt?: number
  /** SESSDATA 已过期或缺失，需要重新登录 */
  expired: boolean
  isCurrent: boolean
}

export interface AccountSwitcherFailure { ok: false, code: AccountSwitcherErrorCode }

export type AccountListResult
  = | { ok: true, accounts: AccountSummary[], loginPending: boolean }
    | AccountSwitcherFailure

export type AccountSwitchResult
  = | { ok: true, accountId: string, mid: number, unchanged?: boolean }
    | AccountSwitcherFailure

export type AccountLoginStartResult
  = | { ok: true }
    | AccountSwitcherFailure

export type AccountLoginPollResult
  = | { ok: true, status: 'pending' }
    | { ok: true, status: 'done', accountId?: string, mid?: number, switched: boolean }
    | AccountSwitcherFailure

export type AccountMutationResult
  = | { ok: true }
    | AccountSwitcherFailure

export interface AccountSwitchPayload {
  id: string
}

export interface AccountLoginStartPayload {
  /** 登录成功后是否直接切到新账号，默认 true */
  switchAfterLogin?: boolean
}

export interface AccountAddByCookiePayload {
  cookieString: string
}

export interface AccountRenamePayload {
  id: string
  alias: string
}
