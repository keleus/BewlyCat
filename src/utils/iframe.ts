/** Release media while the iframe is still attached; Vue removes the element afterwards. */
export function releaseIframeMedia(iframe: HTMLIFrameElement | null) {
  if (!iframe)
    return

  try {
    iframe.contentDocument?.querySelectorAll<HTMLMediaElement>('video, audio').forEach((media) => {
      try {
        media.pause()
        media.srcObject = null
        media.removeAttribute('src')
        media.querySelectorAll('source').forEach(source => source.removeAttribute('src'))
        media.load()
      }
      catch {
        // A player being torn down must not prevent the remaining media from stopping.
      }
    })
  }
  catch {
    // Cross-origin documents cannot be inspected. Navigation still releases them.
  }

  try {
    iframe.src = 'about:blank'
  }
  catch {
    // The owning component still removes the browsing context on unmount.
  }
}
