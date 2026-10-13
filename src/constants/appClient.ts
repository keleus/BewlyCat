export const APP_CLIENT_REQUEST = 'bewly-app-client-request'

/** 后台只接受固定的 APP 接口，不透传任意 URL */
export type AppClientEndpoint
  = | 'qrcodeAuthCode'
    | 'qrcodePoll'
    | 'refreshTokenV3'
    | 'refreshTokenV2'
    | 'feedIndex'
    | 'feedDislike'
    | 'feedDislikeCancel'

export interface AppClientRequest {
  endpoint: AppClientEndpoint
  /** 未签名的参数，由后台补上 appkey / ts / sign */
  params: Record<string, string | number | boolean | null | undefined>
  /** 已授权账号的 mid，用于 x-bili-mid 等请求头 */
  mid?: number | null
}
