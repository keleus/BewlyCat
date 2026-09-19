import browser from 'webextension-polyfill'

/**
 * 新装设备的卡顿探测（安装后前 MAX_SESSIONS 个活跃会话内工作）。
 *
 * 双通道信号（均在 5s 滑动窗口内判定，保守阈值以防误报）：
 * - longtask：主线程被阻塞超过 120ms 的任务；
 * - rAF 帧间隔：超过 50ms（约低于 20fps）的卡顿帧占比 ≥ 25%。
 *
 * 命中后弹出提示卡片；卡片关闭后进入 REWARN_COOLDOWN_MS 冷却期，
 * 期间清空信号窗口，冷却结束后再次检测到卡顿会重新弹出。
 * 仅当用户点击「不再检测」时写入 dismissed 标记并永久停止，之后零开销。
 */

const STATE_STORAGE_KEY = 'bewlycat-perf-watch-state'
const MAX_SESSIONS = 3
const SAMPLING_BUDGET_MS = 60_000
const WARMUP_DELAY_MS = 5_000
const WINDOW_MS = 5_000
const LONG_TASK_THRESHOLD_MS = 120
const LONG_TASK_LIMIT = 3
const JANK_FRAME_THRESHOLD_MS = 50
const JANK_RATIO_LIMIT = 0.25
const MIN_FRAME_SAMPLES = 60
/** 两次提示卡片出现之间的最小间隔（从卡片弹出时起算） */
const REWARN_COOLDOWN_MS = 60_000

/**
 * 卡片中可快捷关闭的高开销特效设置键，是提示卡片与采样暂停条件的共同唯一来源：
 * 全部关闭后继续检测已无意义，采样自动暂停。
 */
export const PERF_WATCH_SETTING_KEYS = [
  'enableFrostedGlass',
  'enableLiquidSegmentIndicator',
  'searchPageBlurredOnSearchFocus',
  'individuallySetSearchPageWallpaper',
] as const

export type PerfWatchSettingKey = typeof PERF_WATCH_SETTING_KEYS[number]

export interface PerfWatchState {
  /** 已经完成/开始采样的会话数 */
  sampledSessions: number
  /** 用户已点击「不再检测」 */
  dismissed: boolean
}

interface StartOptions {
  /** 返回 true 时暂停计入样本（如设置面板打开、特效均已关闭） */
  shouldPause?: () => boolean
  /** 判定卡顿后的回调；冷却结束后再次命中会重复调用 */
  onLagDetected: () => void
}

const defaultState: PerfWatchState = {
  sampledSessions: 0,
  dismissed: false,
}

let activeWatcher: PerformanceWatcher | undefined

class PerformanceWatcher {
  private readonly options: StartOptions
  private state: PerfWatchState = { ...defaultState }
  private longTaskObserver: PerformanceObserver | undefined
  private recentLongTasks: number[] = []
  private recentFrameTimes: number[] = []
  private recentJankFrames: number[] = []
  private lastFrameTime = 0
  private sampledMs = 0
  private warmupTimer: ReturnType<typeof setTimeout> | undefined
  private rafId: number | undefined
  private started = false
  private finished = false
  /** 提示卡片正在展示，暂停采样 */
  private cardVisible = false
  /** 冷却截止时间戳；在此之前不采样，避免卡片刚关就再次弹出 */
  private cooldownUntil = 0

  constructor(options: StartOptions) {
    this.options = options
  }

  async start() {
    if (this.started)
      return
    this.started = true

    this.state = await readState()
    if (this.state.dismissed || this.state.sampledSessions >= MAX_SESSIONS) {
      this.stop()
      return
    }

    // 本次注入计入一个采样会话；多标签竞争属于小概率，状态只增不减，可接受乐观写入。
    this.state.sampledSessions += 1
    await persistState(this.state)

    this.warmupTimer = setTimeout(() => this.beginSampling(), WARMUP_DELAY_MS)
  }

  /** 立即终止采样并释放监听。 */
  stop() {
    if (this.finished)
      return
    this.finished = true
    if (this.warmupTimer)
      clearTimeout(this.warmupTimer)
    if (this.rafId !== undefined)
      cancelAnimationFrame(this.rafId)
    this.longTaskObserver?.disconnect()
    this.longTaskObserver = undefined
    activeWatcher = undefined
  }

  /** 卡片被临时关闭（X、超时自动关闭、跳转设置）：进入冷却期，之后允许再次提示。 */
  cardClosed() {
    if (this.finished)
      return
    this.cardVisible = false
  }

  private samplingActive(now: number): boolean {
    return !this.cardVisible && now >= this.cooldownUntil
  }

  private beginSampling() {
    if (this.finished)
      return

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.longTaskObserver = new PerformanceObserver((list) => {
          if (!this.samplingActive(performance.now()) || this.isPaused())
            return
          for (const entry of list.getEntries()) {
            if (entry.duration >= LONG_TASK_THRESHOLD_MS)
              this.recentLongTasks.push(performance.now())
          }
        })
        this.longTaskObserver.observe({ entryTypes: ['longtask'] })
      }
      catch {
        // Firefox/Safari 可能不支持 longtask，仅依赖帧间隔信号。
      }
    }

    this.lastFrameTime = performance.now()
    const tick = (now: number) => {
      if (this.finished)
        return

      if (this.samplingActive(now) && !this.isPaused() && !document.hidden) {
        const delta = now - this.lastFrameTime
        // 标签从后台切回时的首帧间隔可能极大，丢弃该样本。
        if (delta < 1000) {
          this.sampledMs += delta
          this.recentFrameTimes.push(now)
          if (delta >= JANK_FRAME_THRESHOLD_MS)
            this.recentJankFrames.push(now)
        }

        // 命中后不中断 rAF 循环：cardVisible/cooldownUntil 会暂停采样，
        // 卡片关闭且冷却结束后用清空后的信号窗口重新判定。
        this.evaluate(now)

        if (this.sampledMs >= SAMPLING_BUDGET_MS) {
          this.stop()
          return
        }
      }

      this.lastFrameTime = now
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private isPaused(): boolean {
    return this.options.shouldPause?.() ?? false
  }

  private evaluate(now: number) {
    const windowStart = now - WINDOW_MS
    this.recentLongTasks = this.recentLongTasks.filter(time => time >= windowStart)
    this.recentFrameTimes = this.recentFrameTimes.filter(time => time >= windowStart)
    this.recentJankFrames = this.recentJankFrames.filter(time => time >= windowStart)

    if (this.recentLongTasks.length >= LONG_TASK_LIMIT) {
      this.report(now)
      return
    }

    // 仅在窗口内样本量足够时判定掉帧率，避免冷启动少量帧造成误报。
    if (this.recentFrameTimes.length >= MIN_FRAME_SAMPLES
      && this.recentJankFrames.length / this.recentFrameTimes.length >= JANK_RATIO_LIMIT) {
      this.report(now)
    }
  }

  private report(now: number) {
    // 暂停采样并清空信号窗口，冷却期后用全新信号重新判定。
    this.cardVisible = true
    this.cooldownUntil = now + REWARN_COOLDOWN_MS
    this.recentLongTasks = []
    this.recentFrameTimes = []
    this.recentJankFrames = []
    this.options.onLagDetected()
  }
}

async function readState(): Promise<PerfWatchState> {
  try {
    const result = await browser.storage.local.get(STATE_STORAGE_KEY)
    const stored = result[STATE_STORAGE_KEY] as Partial<PerfWatchState> | undefined
    if (!stored || typeof stored !== 'object')
      return { ...defaultState }

    return {
      sampledSessions: Number.isFinite(stored.sampledSessions) ? Number(stored.sampledSessions) : 0,
      dismissed: stored.dismissed === true,
    }
  }
  catch {
    // 存储不可用时按已结束处理，避免无谓采样。
    return { sampledSessions: MAX_SESSIONS, dismissed: true }
  }
}

async function persistState(state: PerfWatchState) {
  try {
    await browser.storage.local.set({ [STATE_STORAGE_KEY]: state })
  }
  catch {
    // 持久化失败不影响本次进程内判定。
  }
}

/**
 * 启动卡顿探测；重复调用安全。
 * 应仅在顶层窗口的 Bewly 页面调用。
 */
export function startPerformanceWatcher(options: StartOptions): void {
  if (activeWatcher || typeof window === 'undefined')
    return
  if (window.top !== window.self)
    return

  activeWatcher = new PerformanceWatcher(options)
  void activeWatcher.start()
}

/** 提示卡片被临时关闭后调用：冷却期结束允许再次弹出。 */
export function notifyPerfWarningCardClosed(): void {
  activeWatcher?.cardClosed()
}

/** 用户点击「不再检测」后调用，永久停止探测。 */
export async function dismissPerformanceWarning(): Promise<void> {
  activeWatcher?.stop()
  const state = await readState()
  state.dismissed = true
  await persistState(state)
}
