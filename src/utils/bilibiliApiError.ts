export const BILIBILI_LOGIN_INVALID_CODES = [-101, -658] as const

export const BILIBILI_RISK_CONTROL_CODES = [-352, -412, -509, -799] as const

function normalizeCode(code: unknown): number | undefined {
  if (typeof code === 'number' && Number.isFinite(code))
    return code

  if (typeof code === 'string' && code.trim()) {
    const parsedCode = Number(code)
    if (Number.isFinite(parsedCode))
      return parsedCode
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasRiskVoucher(value: unknown): boolean {
  if (!isRecord(value))
    return false

  const voucher = value.v_voucher
  return typeof voucher === 'string' ? voucher.trim().length > 0 : Boolean(voucher)
}

function hasRiskControlMessage(value: Record<string, unknown>): boolean {
  const message = value.message
  return typeof message === 'string'
    && /风控|risk[\s-]*control|API返回了HTML/i.test(message)
}

export function isBilibiliLoginInvalidCode(code: unknown): boolean {
  const normalizedCode = normalizeCode(code)
  return normalizedCode !== undefined
    && BILIBILI_LOGIN_INVALID_CODES.includes(normalizedCode as typeof BILIBILI_LOGIN_INVALID_CODES[number])
}

/**
 * Identifies the risk-control responses used by the web recommendation APIs.
 * Some request failures are thrown as errors with `isRiskControl: true`, while
 * JSON responses may carry a risk code or a `data.v_voucher` challenge even
 * when their top-level code is 0.
 */
export function isBilibiliRiskControl(value: unknown): boolean {
  if (!isRecord(value))
    return false

  if (value.isRiskControl === true)
    return true

  // WebExtension 消息通道在部分浏览器中只保留 Error 的 name/message，
  // background 附加的 code/isRiskControl 字段可能丢失。
  if (hasRiskControlMessage(value))
    return true

  const normalizedCode = normalizeCode(value.code)
  if (
    normalizedCode !== undefined
    && BILIBILI_RISK_CONTROL_CODES.includes(normalizedCode as typeof BILIBILI_RISK_CONTROL_CODES[number])
  ) {
    return true
  }

  return hasRiskVoucher(value.data)
}
