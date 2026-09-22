const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
  '&#x27;': '\'',
  '&apos;': '\'',
  '&nbsp;': ' ',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&euro;': '€',
  '&pound;': '£',
  '&yen;': '¥',
  '&cent;': '¢',
  '&middot;': '·',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
}

/**
 * 解码 HTML 实体
 * 使用轻量级正则替代 DOMParser，性能更好
 *
 * 支持：
 * - 命名实体：&amp; &lt; &gt; &quot; &#39; &nbsp; 等
 * - 十进制数字实体：&#38; &#60; &#34; 等
 * - 十六进制数字实体：&#x27; &#x3C; 等
 */
export function decodeHtmlEntities(text: string | undefined): string {
  if (!text || typeof text !== 'string')
    return text || ''

  return text.replace(/&(?:#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match) => {
    // 数字实体 &#123; 或 &#xAB;
    if (match.startsWith('&#')) {
      const isHex = match[2] === 'x' || match[2] === 'X'
      const code = Number.parseInt(match.slice(isHex ? 3 : 2, -1), isHex ? 16 : 10)
      // HTML 数字实体中的空字符、代理项和超范围码点都替换为 U+FFFD。
      if (code === 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF))
        return '\uFFFD'
      return String.fromCodePoint(code)
    }
    // 命名实体
    return entities[match.toLowerCase()] || match
  })
}
