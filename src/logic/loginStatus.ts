export enum LoginStatus {
  LoggedIn = 'logged-in',
  LoggedOut = 'logged-out',
  TransientError = 'transient-error',
}

export type LoginCheckResult<T>
  = | { status: LoginStatus.LoggedIn, data: T }
    | { status: LoginStatus.LoggedOut }
    | { status: LoginStatus.TransientError }

export type NavChecker<T> = () => Promise<{ code: number, data?: T }>

/**
 * 从 Cookie 字符串解析 DedeUserID（登录用户的 mid）。
 *
 * DedeUserID 非 HttpOnly，且「存在且不为 0」是 B 站多个接口的登录鉴权
 * 依据；登出/会话过期时它随 SESSDATA 一起被清空（见 bilibili-API-collect
 * docs/login/exit.md），因此可作为登录态的本地事实源，无需网络请求。
 */
export function parseDedeUserID(cookieString: string): number | undefined {
  const match = cookieString.match(/(?:^|;\s*)DedeUserID=(\d+)/)
  if (!match)
    return undefined

  const mid = Number(match[1])
  return mid > 0 ? mid : undefined
}

/**
 * 将一次登录态检查（nav 接口）分类为状态动作。
 *
 * 只有 code -101 才是真实登出；风控（HTML 页面、-412）、限流（-509）、
 * 网络错误等瞬态失败统一归为 transient-error，调用方不得据此切换登录态，
 * 否则刷新时的一次风控窗口会把已登录用户误判为未登录（见 issue #921）。
 */
export async function checkLoginStatus<T>(check: NavChecker<T>): Promise<LoginCheckResult<T>> {
  try {
    const res = await check()

    if (res?.code === 0)
      return { status: LoginStatus.LoggedIn, data: res.data as T }

    if (res?.code === -101)
      return { status: LoginStatus.LoggedOut }

    return { status: LoginStatus.TransientError }
  }
  catch {
    return { status: LoginStatus.TransientError }
  }
}
