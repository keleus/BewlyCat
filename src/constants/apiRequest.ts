export const API_REQUEST_PORT = 'bewly-api-request'

export type ApiPortResponse = {
  ok: true
  data: any
} | {
  ok: false
  error: {
    name: string
    message: string
    code?: number
    isRiskControl?: boolean
  }
}
