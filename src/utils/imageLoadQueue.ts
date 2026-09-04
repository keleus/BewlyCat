/**
 * Shared image loading queue.
 *
 * LazyPicture deliberately waits until a queue slot is available before it
 * mounts an image with a src.  This keeps queued pictures cheap while still
 * letting the browser perform the actual format negotiation and decode.
 */

export const IMAGE_LOAD_QUEUE_LIMIT = 6
const DEFAULT_IMAGE_LOAD_TIMEOUT = 20_000

export type ImageLoadQueueCancelReason = 'cancelled' | 'timeout'
export type ImageLoadQueueSettleReason = 'completed' | 'failed' | ImageLoadQueueCancelReason

export interface ImageLoadQueueStartContext {
  /** False after cancellation or timeout. Network requests are not aborted. */
  isCurrent: () => boolean
}

export interface ImageLoadQueueOptions {
  priority?: () => number
  start: (context: ImageLoadQueueStartContext) => Promise<void> | void
  timeout?: number
  onCancel?: (reason: ImageLoadQueueCancelReason) => void
  onSettled?: (reason: ImageLoadQueueSettleReason) => void
}

export interface ImageLoadQueueHandle {
  cancel: (reason?: ImageLoadQueueCancelReason) => void
  isActive: () => boolean
  isQueued: () => boolean
}

interface QueueTask {
  readonly id: number
  readonly options: ImageLoadQueueOptions
  status: 'queued' | 'active' | 'settled'
  cancelled: boolean
  timeoutId: ReturnType<typeof setTimeout> | null
}

const pendingTasks: QueueTask[] = []
const activeTasks = new Set<QueueTask>()
let nextTaskId = 0
let isPumping = false
let pumpScheduled = false

function getTaskPriority(task: QueueTask): number {
  if (!task.options.priority)
    return 0

  try {
    const priority = task.options.priority()
    return Number.isFinite(priority) ? priority : Number.POSITIVE_INFINITY
  }
  catch {
    return Number.POSITIVE_INFINITY
  }
}

function removePendingTask(task: QueueTask) {
  const index = pendingTasks.indexOf(task)
  if (index >= 0)
    pendingTasks.splice(index, 1)
}

function settleTask(task: QueueTask, reason: ImageLoadQueueSettleReason) {
  if (task.status === 'settled')
    return

  task.status = 'settled'
  removePendingTask(task)
  activeTasks.delete(task)

  if (task.timeoutId !== null) {
    clearTimeout(task.timeoutId)
    task.timeoutId = null
  }

  task.options.onSettled?.(reason)
}

function cancelTask(task: QueueTask, reason: ImageLoadQueueCancelReason) {
  if (task.status === 'settled')
    return

  task.cancelled = true
  // Mark the task settled before invoking user code. The callback can clear
  // the image synchronously and must never be able to cancel this task again.
  settleTask(task, reason)

  try {
    task.options.onCancel?.(reason)
  }
  finally {
    scheduleQueuePump()
  }
}

function startTask(task: QueueTask) {
  task.status = 'active'
  activeTasks.add(task)

  const timeout = Number.isFinite(task.options.timeout)
    ? Math.max(0, task.options.timeout!)
    : DEFAULT_IMAGE_LOAD_TIMEOUT
  task.timeoutId = setTimeout(() => cancelTask(task, 'timeout'), timeout)

  const context: ImageLoadQueueStartContext = {
    isCurrent: () => task.status === 'active' && !task.cancelled,
  }

  let result: Promise<void> | void
  try {
    result = task.options.start(context)
  }
  catch {
    settleTask(task, 'failed')
    scheduleQueuePump()
    return
  }

  Promise.resolve(result).then(
    () => settleTask(task, 'completed'),
    () => settleTask(task, 'failed'),
  ).finally(() => {
    scheduleQueuePump()
  })
}

function pumpQueue() {
  if (isPumping)
    return

  isPumping = true
  try {
    while (activeTasks.size < IMAGE_LOAD_QUEUE_LIMIT && pendingTasks.length > 0) {
      pendingTasks.sort((first, second) => {
        const priorityDifference = getTaskPriority(first) - getTaskPriority(second)
        return priorityDifference || first.id - second.id
      })

      const task = pendingTasks.shift()
      if (!task || task.status !== 'queued' || task.cancelled)
        continue

      startTask(task)
    }
  }
  finally {
    isPumping = false
  }
}

function scheduleQueuePump() {
  if (pumpScheduled)
    return

  pumpScheduled = true
  queueMicrotask(() => {
    pumpScheduled = false
    pumpQueue()
  })
}

/** Add a task to the shared six-slot image loading queue. */
export function enqueueImageLoad(options: ImageLoadQueueOptions): ImageLoadQueueHandle {
  const task: QueueTask = {
    id: nextTaskId++,
    options,
    status: 'queued',
    cancelled: false,
    timeoutId: null,
  }
  pendingTasks.push(task)
  scheduleQueuePump()

  return {
    cancel: (reason = 'cancelled') => cancelTask(task, reason),
    isActive: () => task.status === 'active' && !task.cancelled,
    isQueued: () => task.status === 'queued' && !task.cancelled,
  }
}

/** Re-evaluate pending priorities after a scroll or another layout change. */
export function refreshImageLoadQueue() {
  scheduleQueuePump()
}

interface ScrollRootRecord {
  root: Element | null
  subscriberCount: number
  lastScrollTop: number
  direction: 1 | -1
  target: Element | Window
  onScroll: () => void
}

const scrollRootRecords = new Map<Element | null, ScrollRootRecord>()

function getRootScrollTop(root: Element | null): number {
  if (root && !isDocumentScrollingElement(root))
    return root.scrollTop

  if (typeof window === 'undefined')
    return 0
  return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
}

function isDocumentScrollingElement(root: Element): boolean {
  if (typeof document === 'undefined')
    return false
  return root === document.scrollingElement || root === document.documentElement || root === document.body
}

/**
 * Subscribe once per real scroll root. The ref-counted listener supplies a
 * direction for queue ordering and is removed when the last picture leaves.
 */
export function subscribeImageLoadRoot(root: Element | null): () => void {
  if (typeof window === 'undefined')
    return () => {}

  let record = scrollRootRecords.get(root)
  if (!record) {
    const target = isDocumentScrollingElement(root as Element) ? window : root || window
    record = {
      root,
      subscriberCount: 0,
      lastScrollTop: getRootScrollTop(root),
      direction: 1,
      target,
      onScroll: () => {
        if (!record)
          return

        const scrollTop = getRootScrollTop(record.root)
        if (scrollTop !== record.lastScrollTop)
          record.direction = scrollTop > record.lastScrollTop ? 1 : -1
        record.lastScrollTop = scrollTop
        refreshImageLoadQueue()
      },
    }
    scrollRootRecords.set(root, record)
    target.addEventListener('scroll', record.onScroll, { passive: true })
    if (target === window && root)
      root.addEventListener('scroll', record.onScroll, { passive: true })
  }

  record.subscriberCount++
  let subscribed = true

  return () => {
    if (!subscribed)
      return
    subscribed = false

    const current = scrollRootRecords.get(root)
    if (!current)
      return

    current.subscriberCount--
    if (current.subscriberCount > 0)
      return

    current.target.removeEventListener('scroll', current.onScroll)
    if (current.target === window && current.root)
      current.root.removeEventListener('scroll', current.onScroll)
    scrollRootRecords.delete(root)
  }
}

export function getImageLoadScrollDirection(root: Element | null): 1 | -1 {
  return scrollRootRecords.get(root)?.direction || 1
}

function getRootViewport(root: Element | null): { top: number, bottom: number } {
  if (root && !isDocumentScrollingElement(root)) {
    const rootRect = root.getBoundingClientRect()
    if (rootRect.bottom > rootRect.top)
      return { top: rootRect.top, bottom: rootRect.bottom }
  }

  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
  return { top: 0, bottom: Math.max(0, viewportHeight) }
}

/**
 * Lower values run first: visible pictures, then pictures in the current
 * scroll direction ordered by distance, then pictures behind the direction.
 */
export function getImageLoadPriority(element: Element, root: Element | null): number {
  const viewport = getRootViewport(root)
  const rect = element.getBoundingClientRect()
  const viewportCenter = (viewport.top + viewport.bottom) / 2
  const elementCenter = (rect.top + rect.bottom) / 2

  if (rect.bottom > viewport.top && rect.top < viewport.bottom)
    return Math.abs(elementCenter - viewportCenter)

  const direction = getImageLoadScrollDirection(root)
  const isAhead = direction > 0
    ? rect.top >= viewport.bottom
    : rect.bottom <= viewport.top
  const distance = isAhead
    ? direction > 0
      ? Math.max(0, rect.top - viewport.bottom)
      : Math.max(0, viewport.top - rect.bottom)
    : direction > 0
      ? Math.max(0, viewport.top - rect.bottom)
      : Math.max(0, rect.top - viewport.bottom)

  return (isAhead ? 1_000_000 : 2_000_000) + distance
}
