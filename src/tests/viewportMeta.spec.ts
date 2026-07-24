import { beforeEach, describe, expect, it } from 'vitest'

import {
  BEWLYCAT_VIEWPORT_ATTRIBUTE,
  ensureResponsiveViewport,
  RESPONSIVE_VIEWPORT_CONTENT,
} from '~/utils/viewportMeta'

describe('responsive viewport meta', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('creates a device-width viewport when the host page does not provide one', () => {
    const viewportMeta = ensureResponsiveViewport(document)

    expect(viewportMeta.parentElement).toBe(document.head)
    expect(viewportMeta.name).toBe('viewport')
    expect(viewportMeta.content).toBe(RESPONSIVE_VIEWPORT_CONTENT)
    expect(viewportMeta.hasAttribute(BEWLYCAT_VIEWPORT_ATTRIBUTE)).toBe(true)
  })

  it('replaces fixed layout dimensions while preserving unrelated directives', () => {
    document.head.innerHTML = '<meta name="viewport" content="width=980, initial-scale=0.5, viewport-fit=cover">'

    const viewportMeta = ensureResponsiveViewport(document)

    expect(viewportMeta.content).toBe(`${RESPONSIVE_VIEWPORT_CONTENT}, viewport-fit=cover`)
  })

  it('updates the existing element without creating duplicates', () => {
    document.head.innerHTML = `<meta name="viewport" content="${RESPONSIVE_VIEWPORT_CONTENT}">`

    const viewportMeta = ensureResponsiveViewport(document)

    expect(document.head.querySelectorAll('meta[name="viewport"]')).toHaveLength(1)
    expect(viewportMeta.content).toBe(RESPONSIVE_VIEWPORT_CONTENT)
  })
})
