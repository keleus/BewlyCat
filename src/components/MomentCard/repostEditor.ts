export interface RepostNode {
  raw_text: string
  type: 1 | 2 | 9
  biz_id: string
  animated?: boolean
  image?: string
  topic?: { id: number, name: string }
}

/** Keep browser-created line breaks while treating topics/mentions/emotes as atomic nodes. */
export function readRepostEditor(root: HTMLElement): RepostNode[] {
  const result: RepostNode[] = []
  function text(value: string) {
    if (!value)
      return
    const last = result.at(-1)
    if (last?.type === 1 && !last.topic)
      last.raw_text += value
    else
      result.push({ raw_text: value, type: 1, biz_id: '' })
  }
  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      text(node.textContent || '')
      return
    }
    if (!(node instanceof HTMLElement))
      return
    const type = Number(node.dataset.repostType)
    if (node.contentEditable === 'false' && (type === 2 || type === 9 || (type === 1 && node.dataset.topicId))) {
      result.push({
        raw_text: node.dataset.text || node.textContent || '',
        type,
        biz_id: type === 2 ? node.dataset.uid || '' : '',
        animated: node.dataset.animated === 'true',
        image: node.querySelector('img')?.src,
        ...(node.dataset.topicId ? { topic: { id: Number(node.dataset.topicId), name: node.dataset.topicName || '' } } : {}),
      })
      return
    }
    if (node.tagName === 'BR') {
      text('\n')
      return
    }
    if (['DIV', 'P'].includes(node.tagName) && result.length && !result.at(-1)?.raw_text.endsWith('\n'))
      text('\n')
    node.childNodes.forEach(visit)
  }
  root.childNodes.forEach(visit)
  return result
}

export function createRepostRequest(id: string, nodes: RepostNode[], uploadId: string, topic?: { id: number, name: string }, commercialId?: number) {
  if (!/^\d+$/.test(id))
    throw new Error('Invalid dynamic ID')
  const contents = nodes.map(({ raw_text, type, biz_id }) => ({ raw_text, type, biz_id }))
  if (!contents.some(node => node.raw_text.trim()))
    contents.splice(0, contents.length, { raw_text: '转发动态', type: 1, biz_id: '' })
  return {
    dyn_req: {
      content: { contents },
      scene: 4,
      upload_id: uploadId,
      meta: { app_meta: { from: 'create.dynamic.web', mobi_app: 'web' } },
      ...(topic ? { topic: { ...topic, from_source: 'dyn.web.search', from_topic_id: 0 } } : {}),
      ...(commercialId ? { attach_card: { commercial: { commercial_entity_type: 0, commercial_entity_id: commercialId } } } : {}),
    },
    // Never turn the dynamic ID into a JS number.
    web_repost_src: { dyn_id_str: id },
  }
}

export const pendingReposts = new Set<string>()
export const repostDrafts = new Map<string, { nodes: RepostNode[], topic?: { id: number, name: string }, commercialId?: number }>()

/** Check whitespace or a line edge, including across inline nodes and tokens. */
export function isRepostCompletionBoundary(root: HTMLElement, caret: Range, side: 'before' | 'after' = 'before') {
  const before = side === 'before'
  let node = before ? caret.startContainer : caret.endContainer
  let offset = before ? caret.startOffset : caret.endOffset
  while (root.contains(node)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = before ? (node.textContent || '').slice(0, offset) : (node.textContent || '').slice(offset)
      if (text)
        return before ? /\s$/.test(text) : /^\s/.test(text)
    }
    else if (before ? offset > 0 : offset < node.childNodes.length) {
      node = node.childNodes[before ? offset - 1 : offset]
      if (node instanceof HTMLElement) {
        if (['BR', 'DIV', 'P'].includes(node.tagName))
          return true
        if (node.contentEditable === 'false')
          return false
      }
      offset = before ? (node.nodeType === Node.TEXT_NODE ? (node.textContent || '').length : node.childNodes.length) : 0
      continue
    }
    if (node === root || (node instanceof HTMLElement && ['DIV', 'P'].includes(node.tagName)))
      return true
    const parent = node.parentNode!
    offset = Array.prototype.indexOf.call(parent.childNodes, node) + (before ? 0 : 1)
    node = parent
  }
  return false
}

/** Match an unfinished trigger at a word boundary; whitespace ends the query. */
export function findRepostCompletion(root: HTMLElement, caret: Range) {
  if (!caret.collapsed || !root.contains(caret.startContainer) || !isRepostCompletionBoundary(root, caret, 'after'))
    return null
  let node: Node | null = caret.startContainer
  let offset = caret.startOffset
  if (node.nodeType !== Node.TEXT_NODE) {
    node = node.childNodes[offset - 1] || null
    offset = node?.textContent?.length || 0
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || node.parentElement?.closest('[contenteditable="false"]'))
    return null
  const parts: { node: Node, text: string }[] = [{ node, text: (node.textContent || '').slice(0, offset) }]
  while (node.previousSibling?.nodeType === Node.TEXT_NODE) {
    node = node.previousSibling
    parts.unshift({ node, text: node.textContent || '' })
  }
  const text = parts.map(part => part.text).join('')
  const match = /([@#])([^\s@#]*)$/.exec(text)
  if (!match)
    return null
  let start = match.index
  for (const part of parts) {
    if (start < part.text.length) {
      const range = caret.cloneRange()
      range.setStart(part.node, start)
      if (!isRepostCompletionBoundary(root, range))
        return null
      return { kind: match[1] === '@' ? 'mention' as const : 'topic' as const, query: match[2], range }
    }
    start -= part.text.length
  }
  return null
}
