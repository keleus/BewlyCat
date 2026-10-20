import { isInIframe } from './main'

/**
 * 首页沉浸式模式：首页用同源 iframe 打开 B 站视频详情页并强制 Bewly 宽屏，
 * 播放完全交给 B 站原生播放器；推荐流仍由首页持有，两侧通过 postMessage 同步。
 */
export const IMMERSIVE_FEED_FRAME_NAME = 'bewly-immersive-feed'
// 预加载下一条时创建的 iframe；它在被切换为当前视频前保持暂停，不响应快捷键
export const IMMERSIVE_FEED_PRELOAD_FRAME_NAME = 'bewly-immersive-feed-preload'
export const IMMERSIVE_FEED_MESSAGE_SOURCE = 'bewly-immersive-feed'

export enum ImmersiveFeedMessageType {
  /** iframe → 首页：视频页脚本已就绪，请求推荐流状态 */
  Ready = 'ready',
  /** iframe → 首页：宽屏布局已完成且视频已开播，可以撤下首页的加载遮罩 */
  Shown = 'shown',
  /** 预加载 iframe → 首页：宽屏布局已完成且视频可播放，切换时可直接显示 */
  Prepared = 'prepared',
  /** 首页 → iframe：推荐流状态 */
  State = 'state',
  Select = 'select',
  Previous = 'previous',
  Next = 'next',
  Ended = 'ended',
  LoadMore = 'loadMore',
  Close = 'close',
}

export interface ImmersiveFeedFrameItem {
  key: string
  bvid: string
  title: string
  cover: string
  author: string
  durationStr?: string
  viewStr?: string
}

export interface ImmersiveFeedFrameState {
  items: ImmersiveFeedFrameItem[]
  currentKey?: string
  loading: boolean
  noMoreContent: boolean
  hasPrevious: boolean
  hasNext: boolean
  /** 接收方是否为当前显示的视频；预加载的 iframe 为 false */
  active: boolean
}

export interface ImmersiveFeedMessage {
  source: typeof IMMERSIVE_FEED_MESSAGE_SOURCE
  type: ImmersiveFeedMessageType
  key?: string
  state?: ImmersiveFeedFrameState
}

export function isImmersiveFeedFrame(): boolean {
  // window.name 跨 iframe 内的导航保留，不受 B 站清理 URL 参数影响
  return isInIframe()
    && (window.name === IMMERSIVE_FEED_FRAME_NAME || window.name === IMMERSIVE_FEED_PRELOAD_FRAME_NAME)
}

function isEditableElement(element: Element | null | undefined): boolean {
  if (!(element instanceof HTMLElement))
    return false
  const tagName = element.tagName.toLowerCase()
  return element.isContentEditable
    || tagName === 'textarea'
    || tagName === 'select'
    || (tagName === 'input' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes((element as HTMLInputElement).type))
}

/**
 * 是否正在输入文字（评论框、弹幕框、搜索框等）。评论区等组件位于 Shadow DOM 内，
 * 除事件路径外还要沿各层 shadowRoot 的焦点元素向下查找。
 */
export function isTypingContext(event: KeyboardEvent): boolean {
  if (event.isComposing || event.composedPath().some(node => isEditableElement(node as Element)))
    return true

  let active: Element | null = document.activeElement
  while (active) {
    if (isEditableElement(active))
      return true
    active = active.shadowRoot?.activeElement ?? null
  }
  return false
}

export function isImmersiveFeedMessage(data: unknown): data is ImmersiveFeedMessage {
  return !!data
    && typeof data === 'object'
    && (data as ImmersiveFeedMessage).source === IMMERSIVE_FEED_MESSAGE_SOURCE
    && Object.values(ImmersiveFeedMessageType).includes((data as ImmersiveFeedMessage).type)
}

export function createImmersiveFeedMessage(
  type: ImmersiveFeedMessageType,
  extra: Omit<ImmersiveFeedMessage, 'source' | 'type'> = {},
): ImmersiveFeedMessage {
  return { source: IMMERSIVE_FEED_MESSAGE_SOURCE, type, ...extra }
}
