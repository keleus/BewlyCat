function isUnmodifiedActivation(event: Event): boolean {
  if (!(event instanceof MouseEvent || event instanceof KeyboardEvent))
    return false

  return !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
    && (!(event instanceof MouseEvent) || event.button === 0)
}

function isBilibiliUrl(url: URL): boolean {
  return (url.protocol === 'https:' || url.protocol === 'http:')
    && (url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com'))
}

export function installNativeSameTabNavigation(isEnabled: () => boolean) {
  window.addEventListener('click', (event) => {
    if (!isEnabled() || !event.isTrusted || !isUnmodifiedActivation(event))
      return

    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement)
    const target = link?.getAttribute('target')
    if (!link || link.getRootNode() !== document || target?.toLowerCase() !== '_blank'
      || !link.hasAttribute('href') || link.hasAttribute('download')
      || !URL.canParse(link.href) || !isBilibiliUrl(new URL(link.href))) {
      return
    }

    // Preserve native link activation and the site's own click handlers.
    link.target = '_self'
    setTimeout(() => {
      if (link.getAttribute('target') === '_self')
        link.target = target
    }, 0)
  }, { capture: true })

  const open = window.open
  window.open = function (this: Window, ...args: Parameters<typeof open>) {
    const [url, target, features] = args
    const event = window.event
    const source = event?.composedPath()[0]
    if (isEnabled() && navigator.userActivation?.isActive && event?.isTrusted
      && (event.type === 'submit' || isUnmodifiedActivation(event))
      && source instanceof Node && source.getRootNode() === document
      && (!target || String(target).toLowerCase() === '_blank') && !features
      && url && URL.canParse(url, document.baseURI)) {
      const destination = new URL(url, document.baseURI)
      // Native navigation such as search can call window.open from a user gesture.
      if (isBilibiliUrl(destination)) {
        location.assign(destination.href)
        return null
      }
    }
    return Reflect.apply(open, this, args)
  }
}
