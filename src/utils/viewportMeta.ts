export const BEWLYCAT_VIEWPORT_ATTRIBUTE = 'data-bewlycat-viewport'
export const RESPONSIVE_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1'

function normalizeViewportContent(content: string): string {
  const preservedDirectives = content
    .split(',')
    .map(directive => directive.trim())
    .filter(Boolean)
    .filter(directive => !/^(?:width|initial-scale)\s*=/i.test(directive))

  return [RESPONSIVE_VIEWPORT_CONTENT, ...preservedDirectives].join(', ')
}

export function ensureResponsiveViewport(doc: Document): HTMLMetaElement {
  let viewportMeta = doc.head.querySelector<HTMLMetaElement>('meta[name="viewport"]')

  if (!viewportMeta) {
    viewportMeta = doc.createElement('meta')
    viewportMeta.name = 'viewport'
    doc.head.appendChild(viewportMeta)
  }

  viewportMeta.content = normalizeViewportContent(viewportMeta.content)
  viewportMeta.setAttribute(BEWLYCAT_VIEWPORT_ATTRIBUTE, '')
  return viewportMeta
}
