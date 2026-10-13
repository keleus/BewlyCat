import md5 from 'md5'

/**
 * 为请求参数进行 APP 签名
 * https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/APP.html#typescript-javascript
 */
type Params = Record<string, any>

export function appSign(params: Params, appkey: string, appsec: string): string {
  params.appkey = appkey
  const searchParams = new URLSearchParams(params)
  searchParams.sort()
  return md5(searchParams.toString() + appsec)
}

// 与 PiliPlus 一致使用 HD 版 APPKEY 扫码授权与签名请求。
// access token 只能配合签发它的 APPKEY 签名使用。
// https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/APPKey.html#appkey
export const HDAppKey = {
  appkey: 'dfca71928277209b',
  appsec: 'b5475a8825547a4fc26c7d518eaaa02e',
  mobiApp: 'android_hd',
}

type AppSignParamValue = string | number | boolean | null | undefined

/**
 * 为 APP 接口生成带签名的完整参数。
 * 后台请求会丢弃 undefined / null / 空字符串参数，签名前同步剔除，保证签名与实际发送的参数一致。
 */
export function signAppParams(params: Record<string, AppSignParamValue>): Record<string, string> {
  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '')
      payload[key] = String(value)
  }
  payload.ts ||= Math.floor(Date.now() / 1000).toString()
  const sign = appSign(payload, HDAppKey.appkey, HDAppKey.appsec)
  return { ...payload, sign }
}
