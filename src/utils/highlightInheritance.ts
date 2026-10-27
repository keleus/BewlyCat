/** Class that restores the per-element `::selection` rule in `styles/main.scss`. */
export const SELECTION_FALLBACK_CLASS = 'bewly-selection-fallback'

const PROBE_CLASS = 'bewly-highlight-inheritance-probe'
const PROBE_COLOR = 'rgb(1, 2, 3)'

let supported: boolean | undefined

/**
 * Whether an ancestor's `::selection` also styles its descendants' selections
 * (CSS highlight inheritance). When it does, one rule on the root replaces a
 * universal `*::selection`, which made every style recalculation of the feed
 * recompute a selection style for each element.
 */
export function supportsHighlightInheritance(): boolean {
  if (supported !== undefined)
    return supported

  const root = document.documentElement
  const style = document.createElement('style')
  style.textContent = `.${PROBE_CLASS}::selection{background-color:${PROBE_COLOR}}`
  const parent = document.createElement('div')
  parent.className = PROBE_CLASS
  parent.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;'
  const child = document.createElement('span')
  parent.append(child)
  root.append(style, parent)
  supported = getComputedStyle(child, '::selection').backgroundColor === PROBE_COLOR
  style.remove()
  parent.remove()
  return supported
}
