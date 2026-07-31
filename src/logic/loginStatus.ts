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
