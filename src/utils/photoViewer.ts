const PHOTO_VIEWER_OPEN_SELECTOR = '.pswp.pswp--open, .bewly-opus-viewer.is-open'

export function isPhotoViewerOpen(root: ParentNode = document) {
  return root.querySelector(PHOTO_VIEWER_OPEN_SELECTOR) !== null
}
