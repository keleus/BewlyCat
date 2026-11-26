export const TOP_BAR_VISIBILITY_CHANGE = 'topBarVisibilityChange'
export const TOP_BAR_SCROLL_VISIBILITY_CHANGE = 'topBarScrollVisibilityChange'
export const OVERLAY_SCROLL_BAR_SCROLL = 'overlayScrollBarScroll'
/** 视口上方增删内容并同步补偿 scrollTop 时，平移顶栏滚动基准，避免误判为用户滚动。 */
export const OVERLAY_SCROLL_BAR_REBASE = 'overlayScrollBarRebase'
export const OVERLAY_SCROLL_STATE_CHANGE = 'overlayScrollStateChange'
export const BEWLY_MOUNTED = 'bewlyMounted'
export const BEWLY_IFRAME_DRAWER_HOST_CLASS = 'bewly-iframe-drawer-host'
export const DRAWER_VIDEO_ENTER_PAGE_FULL = 'drawerVideoEnterPageFull'
export const DRAWER_VIDEO_EXIT_PAGE_FULL = 'drawerVideoExitPageFull'
/** iframe 内视频页在 ESC 未被页面自身消费时发出的关闭请求（抽屉与沉浸流共用） */
export const BEWLY_DRAWER_CLOSE_REQUEST = 'BEWLY_DRAWER_CLOSE_REQUEST'
/** iframe 内 Dialog、图片预览或播放器层已消费 ESC，通知父页面不要关闭抽屉 */
export const BEWLY_DRAWER_ESCAPE_HANDLED = 'BEWLY_DRAWER_ESCAPE_HANDLED'
/** iframe 内 PhotoSwipe 图片预览开关状态变化，通知父页面 */
export const IFRAME_PHOTO_VIEWER_STATE = 'IFRAME_PHOTO_VIEWER_STATE'
/** 动态页与视频卡片视频弹窗内 iframe 的 window.name，播放器据此应用弹窗显示模式覆盖。 */
export const VIDEO_DIALOG_IFRAME_NAME = 'bewly-video-dialog'
export const IFRAME_PAGE_SWITCH_BEWLY = 'iframePageSwitchBewly'
export const IFRAME_PAGE_SWITCH_BILI = 'iframePageSwitchBili'
export const IFRAME_DARK_MODE_CHANGE = 'iframeDarkModeChange'
export const IFRAME_SEARCH_NAVIGATION = 'bewlyIframeSearchNavigation'
export const IFRAME_TOP_BAR_CHANGE = 'iframeTopBarChange'
/** iframe 原版页向首页报告文档滚动条占位宽度，首页顶栏与 Dock 据此让出槽位。 */
export const IFRAME_SCROLLBAR_GUTTER_CHANGE = 'iframeScrollbarGutterChange'
export const DARK_MODE_BASE_COLOR_CHANGE = 'darkModeBaseColorChange'
