import { settings } from '~/logic'

type LinkOpenMode = 'newTab' | 'background' | 'currentTab' | 'currentTabIfHomepage' | 'currentTabIfNotHomepage' | 'drawer' | 'dialog'

function shouldOpenBilibiliLinkInCurrentTab(href?: string): boolean {
  if (!settings.value.openBilibiliLinksInCurrentTab || !href || !URL.canParse(href, document.baseURI))
    return false
  const { hostname, protocol } = new URL(href, document.baseURI)
  return (protocol === 'https:' || protocol === 'http:')
    && (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com'))
}

export function getLinkOpenMode<T extends LinkOpenMode>(mode: T, href?: string): T | 'currentTab' {
  return shouldOpenBilibiliLinkInCurrentTab(href) ? 'currentTab' : mode
}

export function isModifiedLinkClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
}

export function keepBewlyLinksInCurrentTab(root: ShadowRoot | HTMLElement): AbortController {
  const events = new AbortController()
  root.addEventListener('click', (rawEvent) => {
    if (!settings.value.openBilibiliLinksInCurrentTab || !(rawEvent instanceof MouseEvent) || isModifiedLinkClick(rawEvent))
      return
    const link = rawEvent.composedPath().find(node => node instanceof HTMLAnchorElement)
    const target = link?.getAttribute('target')
    if (target?.toLowerCase() !== '_blank' || !link
      || link.hasAttribute('download') || link.hasAttribute('data-open-in-new-tab')
      || !shouldOpenBilibiliLinkInCurrentTab(link.getAttribute('href') ?? undefined)) {
      return
    }

    link.target = '_top'
    setTimeout(() => {
      if (link.getAttribute('target') === '_top')
        link.target = target
    }, 0)
  }, { capture: true, signal: events.signal })
  return events
}
