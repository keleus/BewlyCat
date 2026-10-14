import { PAGE_STYLE_GATE_ATTRIBUTE } from '../src/constants/contentScript'

// 首个复合选择器必须是带门槛属性的根元素或其后代；:where 不增加优先级。
const GATE_SELECTOR = `:where([${PAGE_STYLE_GATE_ATTRIBUTE}],[${PAGE_STYLE_GATE_ATTRIBUTE}] *)`
// 内部仍是规则列表的 at-rule；其余（@keyframes、@font-face 等）原样保留。
const GROUPING_AT_RULE_PATTERN = /^@(?:media|supports|layer|container|scope|starting-style|document|-moz-document)\b/i
const LEGACY_PSEUDO_ELEMENT_PATTERN = /^:(?:before|after|first-line|first-letter)(?![\w-])/i

/** 跳过从 index 开始的注释、字符串或转义序列，返回其后的位置；不是这些结构时原样返回。 */
function skipAtomic(css: string, index: number): number {
  const char = css[index]
  if (char === '\\')
    return index + 2
  if (char === '/' && css[index + 1] === '*') {
    const end = css.indexOf('*/', index + 2)
    return end === -1 ? css.length : end + 2
  }
  if (char === '"' || char === '\'') {
    let cursor = index + 1
    while (cursor < css.length && css[cursor] !== char)
      cursor += css[cursor] === '\\' ? 2 : 1
    return cursor + 1
  }
  return index
}

/** 从 start 开始找到第一个位于顶层（不在括号、字符串、注释中）且属于 stops 的字符。 */
function findTopLevel(css: string, start: number, stops: string): number {
  let depth = 0
  let cursor = start
  while (cursor < css.length) {
    const next = skipAtomic(css, cursor)
    if (next !== cursor) {
      cursor = next
      continue
    }
    const char = css[cursor]
    if (depth === 0 && stops.includes(char))
      return cursor
    if (char === '(' || char === '[')
      depth++
    else if (char === ')' || char === ']')
      depth--
    cursor++
  }
  return css.length
}

/** 返回与 open 处 `{` 匹配的 `}` 位置。 */
function findBlockEnd(css: string, open: number): number {
  let depth = 0
  let cursor = open
  while (cursor < css.length) {
    const next = skipAtomic(css, cursor)
    if (next !== cursor) {
      cursor = next
      continue
    }
    if (css[cursor] === '{')
      depth++
    else if (css[cursor] === '}' && --depth === 0)
      return cursor
    cursor++
  }
  return css.length
}

function scopeSelector(selector: string): string {
  const trimmed = selector.trim()
  // :host 规则只服务 Shadow DOM，在页面中本就不会命中。
  if (!trimmed || trimmed.startsWith(':host'))
    return selector

  // 门槛插在首个复合选择器末尾；若其中有伪元素，则插在伪元素之前。
  let insertAt = trimmed.length
  let depth = 0
  let cursor = 0
  while (cursor < trimmed.length) {
    const next = skipAtomic(trimmed, cursor)
    if (next !== cursor) {
      cursor = next
      continue
    }
    const char = trimmed[cursor]
    if (depth === 0) {
      if (/[\s>+~]/.test(char)) {
        insertAt = cursor
        break
      }
      if (char === ':' && (trimmed[cursor + 1] === ':' || LEGACY_PSEUDO_ELEMENT_PATTERN.test(trimmed.slice(cursor)))) {
        insertAt = cursor
        break
      }
    }
    if (char === '(' || char === '[')
      depth++
    else if (char === ')' || char === ']')
      depth--
    cursor++
  }
  return `${trimmed.slice(0, insertAt)}${GATE_SELECTOR}${trimmed.slice(insertAt)}`
}

function scopeSelectorList(prelude: string): string {
  const selectors: string[] = []
  let start = 0
  while (start <= prelude.length) {
    const comma = findTopLevel(prelude, start, ',')
    selectors.push(scopeSelector(prelude.slice(start, comma)))
    start = comma + 1
  }
  return selectors.join(',')
}

function scopeRules(css: string): string {
  let output = ''
  let cursor = 0
  while (cursor < css.length) {
    const end = findTopLevel(css, cursor, '{;')
    const prelude = css.slice(cursor, end)
    if (end >= css.length || css[end] === ';') {
      // at-rule 语句（@charset、@layer a,b;）或结尾的空白原样保留
      output += css.slice(cursor, end + 1)
      cursor = end + 1
      continue
    }

    const blockEnd = findBlockEnd(css, end)
    const body = css.slice(end + 1, blockEnd)
    const trimmedPrelude = prelude.trim()
    if (trimmedPrelude.startsWith('@')) {
      output += GROUPING_AT_RULE_PATTERN.test(trimmedPrelude)
        ? `${prelude}{${scopeRules(body)}}`
        : `${prelude}{${body}}`
    }
    else {
      output += `${scopeSelectorList(prelude)}{${body}}`
    }
    cursor = blockEnd + 1
  }
  return output
}

/**
 * content script 的样式同时用于 Shadow DOM 与页面。页面级副本只应在 BewlyCat 实际运行的
 * 页面生效，否则 UnoCSS 工具类、过渡类等通用类名会在未运行脚本的框架（如直播页内嵌的主站
 * 框架）中命中原站元素。Shadow DOM 内继续使用未改写的原样式。
 */
export function scopePageStyles(css: string): string {
  return scopeRules(css)
}
