export const APP_PASSPORT_REQUEST = 'bewly-app-passport-request'

/** 后台只接受固定的 APP 授权接口，不透传任意 URL */
export type AppPassportEndpoint = 'qrcodeAuthCode' | 'qrcodePoll' | 'refreshTokenV3' | 'refreshTokenV2'

export interface AppPassportRequest {
  endpoint: AppPassportEndpoint
  params: Record<string, string>
}
