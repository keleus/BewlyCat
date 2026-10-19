// 快捷键字符串的统一格式：修饰键按 Ctrl、Alt、Shift、Meta 排序，主键使用主键盘上的基础键位，
// 例如 Shift+1、+、Alt+W。录制、匹配和展示都经过这里，避免各处各自解析 event.key。

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const
type ShortcutModifier = typeof MODIFIER_ORDER[number]

const MODIFIER_ALIASES: Record<string, ShortcutModifier> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  win: 'Meta',
}

const MODIFIER_EVENT_KEYS = new Set(['Control', 'Alt', 'AltGraph', 'Shift', 'Meta', 'OS', 'Fn', 'FnLock', 'Hyper', 'Super', 'CapsLock'])

// 符号键按物理键位取值，避免 Shift 或 macOS Option 改写 event.key 后无法匹配。
const CODE_KEY_MAP: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  Space: 'Space',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  NumpadDecimal: '.',
  NumpadComma: ',',
  NumpadEqual: '=',
  NumpadEnter: 'Enter',
}

// Shift 产生的符号还原为基础键，兼容旧配置（如 Shift+_、Shift+)）；'+' 单独处理，见 joinShortcutKey。
const SHIFTED_SYMBOL_BASE: Record<string, string> = {
  '!': '1',
  '@': '2',
  '#': '3',
  '$': '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  '_': '-',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': '\'',
  '<': ',',
  '>': '.',
  '?': '/',
  '~': '`',
}

const NAMED_KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  'space': 'Space',
  'spacebar': 'Space',
  'arrowup': '↑',
  'arrowdown': '↓',
  'arrowleft': '←',
  'arrowright': '→',
  'escape': 'Esc',
  'esc': 'Esc',
}

const IGNORED_EVENT_KEYS = new Set(['Dead', 'Unidentified', 'Process'])

function normalizeMainKey(mainKey: string, hasShift: boolean): string {
  const namedKey = NAMED_KEY_MAP[mainKey.toLowerCase()]
  if (namedKey)
    return namedKey
  if (mainKey.length !== 1)
    return mainKey
  if (hasShift && SHIFTED_SYMBOL_BASE[mainKey])
    return SHIFTED_SYMBOL_BASE[mainKey]
  return mainKey.toUpperCase()
}

function joinShortcutKey(modifiers: Iterable<ShortcutModifier>, mainKey: string): string {
  const modifierSet = new Set(modifiers)
  let normalizedMainKey = normalizeMainKey(mainKey, modifierSet.has('Shift'))
  // 主键盘上 '+' 就是 Shift+=，统一记作 '+'；Shift++ 只能靠小键盘按出，86 配列等键盘无法触发。
  if (normalizedMainKey === '+' || (normalizedMainKey === '=' && modifierSet.has('Shift'))) {
    normalizedMainKey = '+'
    modifierSet.delete('Shift')
  }
  return [...MODIFIER_ORDER.filter(modifier => modifierSet.has(modifier)), normalizedMainKey].join('+')
}

// 拆出修饰键与主键；主键本身可能是 '+'，例如 '+'、'Shift++'。
function splitShortcutKey(value: string): { modifiers: string[], mainKey: string } {
  const trimmed = value.trim()
  const plusIndex = trimmed.endsWith('+') ? trimmed.length - 1 : trimmed.lastIndexOf('+')
  const mainKey = trimmed.slice(plusIndex + 1).trim() || '+'
  const modifiers = plusIndex > 0
    ? trimmed.slice(0, plusIndex).split('+').map(part => part.trim()).filter(Boolean)
    : []
  return { modifiers, mainKey }
}

/**
 * 将配置中的快捷键统一成标准格式，兼容大小写、空格、Cmd/Option 等别名和旧的 Shift 符号写法。
 */
export function normalizeShortcutKey(value: string): string {
  if (!value.trim())
    return ''

  const { modifiers, mainKey } = splitShortcutKey(value)
  const normalizedModifiers = modifiers
    .map(modifier => MODIFIER_ALIASES[modifier.toLowerCase()])
    .filter((modifier): modifier is ShortcutModifier => !!modifier)
  return joinShortcutKey(normalizedModifiers, mainKey)
}

function getEventMainKey(event: KeyboardEvent): string | null {
  const { key, code } = event
  if (MODIFIER_EVENT_KEYS.has(key))
    return null

  if (/^Key[A-Z]$/.test(code)) {
    // 字母优先使用 event.key 以适配 Dvorak 等布局；Option 组合、死键或输入法改写时回退到物理键位。
    return /^[a-z]$/i.test(key) ? key.toUpperCase() : code.slice(3)
  }
  if (/^Digit\d$/.test(code))
    return code.slice(5)
  if (/^Numpad\d$/.test(code) && /^\d$/.test(key))
    return key
  if (CODE_KEY_MAP[code])
    return CODE_KEY_MAP[code]
  if (!key || IGNORED_EVENT_KEYS.has(key))
    return null
  return key
}

function getEventModifiers(event: KeyboardEvent): ShortcutModifier[] {
  const modifiers: ShortcutModifier[] = []
  if (event.ctrlKey)
    modifiers.push('Ctrl')
  if (event.altKey)
    modifiers.push('Alt')
  if (event.shiftKey)
    modifiers.push('Shift')
  if (event.metaKey)
    modifiers.push('Meta')
  return modifiers
}

/**
 * 根据键盘事件生成标准快捷键字符串；只按下修饰键或无法识别时返回 null。
 */
export function getShortcutKeyFromEvent(event: KeyboardEvent): string | null {
  const mainKey = getEventMainKey(event)
  if (!mainKey)
    return null
  return joinShortcutKey(getEventModifiers(event), mainKey)
}

/**
 * 键盘事件可匹配的快捷键，按优先级排列：先精确匹配，再把未按 Shift 的 '=' 键视作 '+'。
 */
export function getShortcutKeyCandidates(event: KeyboardEvent): string[] {
  const primary = getShortcutKeyFromEvent(event)
  if (!primary)
    return []

  const candidates = [primary]
  if (primary === '=' || primary.endsWith('+='))
    candidates.push(`${primary.slice(0, -1)}+`)
  return candidates
}

// 未绑定的快捷键之间不算冲突。
export function isSameShortcutKey(a: string, b: string): boolean {
  const normalizedA = normalizeShortcutKey(a).toLowerCase()
  return !!normalizedA && normalizedA === normalizeShortcutKey(b).toLowerCase()
}

/**
 * 判断键盘事件是否触发指定快捷键；不考虑其他快捷键的优先级，适合单个快捷键的独立监听。
 */
export function matchesShortcutKey(event: KeyboardEvent, configKey: string): boolean {
  const normalizedConfigKey = normalizeShortcutKey(configKey).toLowerCase()
  if (!normalizedConfigKey)
    return false
  return getShortcutKeyCandidates(event).some(candidate => candidate.toLowerCase() === normalizedConfigKey)
}

const isMacPlatform = typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad|iPod/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent)

/**
 * 展示用的快捷键文本：macOS 上用 Cmd、Option 代替 Meta、Alt。
 */
export function formatShortcutKey(value: string): string {
  const normalized = normalizeShortcutKey(value)
  if (!isMacPlatform || !normalized)
    return normalized

  const { modifiers, mainKey } = splitShortcutKey(normalized)
  return [...modifiers.map(modifier => modifier === 'Meta' ? 'Cmd' : modifier === 'Alt' ? 'Option' : modifier), mainKey].join('+')
}
