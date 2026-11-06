export const DIAGNOSTIC_MASK = '*'

const MAX_DEPTH = 6
const MAX_ARRAY_ITEMS = 5
const MAX_OBJECT_KEYS = 40
const MAX_STRING_LENGTH = 1000

// 登录凭据、WBI/APP 签名、设备标识，以及不需要明文也能排查的账号与浏览记录。
const SENSITIVE_KEY_SOURCE = [
  '(?:set-)?cookie',
  'firefox-multi-account-cookie',
  'sessdata',
  'bili_jct',
  'dedeuserid(?:__ckmd5)?',
  'sid',
  'buvid[\\w-]*',
  '_uuid',
  'b_lsid',
  'b_nut',
  'csrf(?:_token)?',
  '[\\w-]*token',
  'access_key',
  'auth_code',
  'appkey',
  'appsec',
  'sign',
  'w_rid',
  'wts',
  'w_webid',
  'dm_[\\w-]*',
  'bili_ticket',
  'ticket',
  'v_voucher',
  'wbi_img',
  'img_url',
  'sub_url',
  'img_?key',
  'sub_?key',
  'x-bili-[\\w-]*',
  'session_id',
  'vmid',
  'uniq_id',
  'uname',
  'email',
  'tel',
  'telephone',
  'phone',
  'keyword',
  'last_showlist',
  'last_clicklist',
].join('|')

const SENSITIVE_KEY_PATTERN = new RegExp(`^(?:${SENSITIVE_KEY_SOURCE})$`, 'i')
const QUERY_PAIR_PATTERN = new RegExp(`(^|[?&;\\s,"'])(${SENSITIVE_KEY_SOURCE})=[^&;\\s"',]*`, 'gi')
const JSON_PAIR_PATTERN = new RegExp(`"(${SENSITIVE_KEY_SOURCE})"\\s*:\\s*(?:"[^"]*"|-?\\d+(?:\\.\\d+)?)`, 'gi')
const COOKIE_HEADER_PATTERN = /\b((?:set-)?cookie)\s*:\s*[^\r\n]*/gi

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

function maskValue(value: unknown): unknown {
  // 保留空值，便于区分“参数缺失”和“参数已被隐藏”。
  return value === undefined || value === null || value === '' ? value : DIAGNOSTIC_MASK
}

/** 处理错误信息、HTML 等无法按键名脱敏的自由文本。 */
export function sanitizeDiagnosticText(text: string, maxLength = MAX_STRING_LENGTH): string {
  const sanitized = text
    .replace(COOKIE_HEADER_PATTERN, `$1: ${DIAGNOSTIC_MASK}`)
    .replace(QUERY_PAIR_PATTERN, `$1$2=${DIAGNOSTIC_MASK}`)
    .replace(JSON_PAIR_PATTERN, `"$1":"${DIAGNOSTIC_MASK}"`)

  return sanitized.length > maxLength
    ? `${sanitized.slice(0, maxLength)}…(+${sanitized.length - maxLength})`
    : sanitized
}

/** 深拷贝并脱敏；结果可安全地跨上下文传递，且体积有上限。 */
export function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (typeof value === 'string')
    return sanitizeDiagnosticText(value)
  if (value instanceof URLSearchParams)
    return sanitizeDiagnosticValue(Object.fromEntries(value), depth)
  if (typeof value !== 'object')
    return String(value)
  if (depth >= MAX_DEPTH)
    return '…'

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map(item => sanitizeDiagnosticValue(item, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS)
      items.push(`…(+${value.length - MAX_ARRAY_ITEMS})`)
    return items
  }

  const entries = Object.entries(value)
  const result: Record<string, unknown> = {}
  for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS))
    result[key] = isSensitiveKey(key) ? maskValue(item) : sanitizeDiagnosticValue(item, depth + 1)
  if (entries.length > MAX_OBJECT_KEYS)
    result['…'] = `+${entries.length - MAX_OBJECT_KEYS}`
  return result
}

/** 拆分地址与查询参数，让参数和普通对象走同一套按键名脱敏。 */
export function sanitizeDiagnosticUrl(url: string): { url: string, params?: unknown } {
  try {
    const { origin, pathname, searchParams } = new URL(url)
    const hasParams = [...searchParams.keys()].length > 0
    return {
      url: `${origin}${pathname}`,
      params: hasParams ? sanitizeDiagnosticValue(searchParams) : undefined,
    }
  }
  catch {
    return { url: sanitizeDiagnosticText(url) }
  }
}

export function sanitizeDiagnosticBody(body: unknown): unknown {
  if (body === undefined || body === null)
    return undefined
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const fields: Record<string, string> = {}
    body.forEach((value, key) => {
      fields[key] = typeof value === 'string' ? value : `[File ${value.size}]`
    })
    return sanitizeDiagnosticValue(fields)
  }
  if (typeof body !== 'string')
    return sanitizeDiagnosticValue(body)

  try {
    return sanitizeDiagnosticValue(JSON.parse(body))
  }
  catch {
    return /^[^=&\s]+=/.test(body)
      ? sanitizeDiagnosticValue(new URLSearchParams(body))
      : sanitizeDiagnosticText(body)
  }
}
