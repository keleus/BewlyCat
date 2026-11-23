export const PHOTO_VIEWER_OPEN_SELECTOR = '.pswp.pswp--open, .bewly-opus-viewer.is-open'

export function findOpenPhotoViewer(root: ParentNode = document) {
  return root.querySelector(PHOTO_VIEWER_OPEN_SELECTOR)
}

export function isPhotoViewerOpen(root: ParentNode = document) {
  return findOpenPhotoViewer(root) !== null
}
