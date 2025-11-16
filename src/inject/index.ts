// 由于是浏览器环境，所以引入的ts不能使用webextension-polyfill相关api，包含获取本地Storage，获取的是网页的localStorage
import type { Settings } from '~/logic/storage'

// 存储当前设置状态
let currentSettings: Settings | null = null
let settingsReady = false

// 之前inject.js的内容
const isArray = (val: any): boolean => Array.isArray(val)
function injectFunction(
  origin: any,
  keys: string | string[],
  cb: (...args: any[]) => void,
) {
  let keysArray: string[]
  if (!isArray(keys)) {
    keysArray = [keys as string]
  }
  else {
    keysArray = keys as string[]
  }

  const originKeysValue = keysArray.reduce((obj: any, key: string) => {
    obj[key] = origin[key]
    return obj
  }, {})

  keysArray.map((k: string) => origin[k])

  keysArray.forEach((key: string) => {
    const fn = (...args: any[]) => {
      cb(...args)
      return (originKeysValue[key]).apply(origin, args)
    }
    fn.toString = (origin)[key].toString
    ;(origin)[key] = fn
  })

  return {
    originKeysValue,
    restore: () => {
      for (const key in originKeysValue) {
        origin[key] = (originKeysValue[key]).bind(origin)
      }
    },
  }
}

injectFunction(
  window.history,
  ['pushState'],
  (...args: any[]) => {
    window.dispatchEvent(new CustomEvent('pushstate', { detail: args }))
  },
)

// 获取IP地理位置字符串
function getLocationString(replyItem: any) {
  const location = replyItem?.reply_control?.location
  if (typeof location !== 'string')
    return location

  return location.replace(/^IP属地[：: ]*/u, '')
}

function getSexString(replyItem: any) {
  return replyItem?.member?.sex
}

function updateInfoElement(
  root: ShadowRoot | null | undefined,
  id: string,
  shouldShow: boolean,
  text: any,
  anchor: Element | null | undefined,
): HTMLElement | null {
  if (!root)
    return null

  let element = root.querySelector<HTMLElement>(`#${id}`)

  if (!shouldShow || !anchor) {
    if (element)
      element.remove()
    return null
  }

  if (!element) {
    element = document.createElement('div')
    element.id = id
    anchor.insertAdjacentElement('afterend', element)
  }

  element.textContent = String(text)
  return element
}

// 判断当前页面URL是否支持IP显示
function isSupportedPage(): boolean {
  const currentUrl = window.location.href
  return (
    // 视频页面
    /https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/.*/.test(currentUrl)
    // 视频分享页短链路径
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/s\/video\/.*/.test(currentUrl)
    // 番剧页面
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/bangumi\/play\/.*/.test(currentUrl)
    // 动态页面
    || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share).*/.test(currentUrl)
    // 动态详情页
    || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/.*/.test(currentUrl)
    // 用户空间页面
    || /https?:\/\/space\.bilibili\.com\/.*/.test(currentUrl)
    // 专栏页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/read\/.*/.test(currentUrl)
    // 话题页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/topic\/detail.*/.test(currentUrl)
    // 课程页面
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/cheese\/play\/.*/.test(currentUrl)
    // 稍后再看列表页（两种路径）
    || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/(?:#\/)?list.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/watchlater(?:\?.*|\/.*)?$/.test(currentUrl)
    // 收藏夹与媒体列表
    || /https?:\/\/(?:www\.)?bilibili\.com\/list\/ml.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/medialist\/(?:play|detail)\/.*/.test(currentUrl)
    // 活动页面
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/blackboard\/.*/.test(currentUrl)
    // 拜年祭页面
    || /https?:\/\/(?:www\.|m\.)?bilibili\.com\/festival\/.*/.test(currentUrl)
    // 漫画页面
    || /https?:\/\/manga\.bilibili\.com\/detail\/.*/.test(currentUrl)
  )
}

if (window.customElements && isSupportedPage()) {
  const { define: originalDefine } = window.customElements
  window.customElements.define = new Proxy(originalDefine, {
    apply: (target, thisArg, args) => {
      const [name, classConstructor] = args
      if (typeof classConstructor !== 'function') {
        return Reflect.apply(target, thisArg, args)
      }

      // 处理评论区图片组件
      if (name === 'bili-comment-pictures-renderer') {
        const originalUpdate = classConstructor.prototype.update
        classConstructor.prototype.update = function (...updateArgs: any[]) {
          const result = originalUpdate.apply(this, updateArgs)
          const root = this.shadowRoot
          if (!root)
            return result

          // 根据设置决定是否修复图片长宽比问题
          if (currentSettings?.adjustCommentImageHeight) {
            // 非1:1图片（非flex布局）保持宽度，高度按实际比例自适应
            const content = root.querySelector('#content')
            if (content && !content.classList.contains('flex')) {
              const images = content.querySelectorAll('img')
              images.forEach((img: HTMLImageElement) => {
                // 移除固定的 height 属性，让图片按实际比例显示
                img.removeAttribute('height')
                img.style.height = 'auto'
              })
            }
          }

          return result
        }
        return Reflect.apply(target, thisArg, args)
      }

      // 处理评论操作按钮组件
      if (name === 'bili-comment-action-buttons-renderer') {
        const originalUpdate = classConstructor.prototype.update
        classConstructor.prototype.update = function (...updateArgs: any[]) {
          const result = originalUpdate.apply(this, updateArgs)
          const root = this.shadowRoot
          const pubDateEl = root?.querySelector('#pubdate')
          if (!pubDateEl)
            return result

          const locationString = getLocationString(this.data)
          const shouldShowLocation = Boolean(currentSettings?.showIPLocation && locationString)
          const locationEl = updateInfoElement(root, 'location', shouldShowLocation, locationString, pubDateEl)

          const sexString = getSexString(this.data)
          const shouldShowSex = Boolean(currentSettings?.showSex && sexString)
          const sexAnchor = locationEl ?? pubDateEl
          updateInfoElement(root, 'sex', shouldShowSex, sexString, sexAnchor)
          return result
        }
        return Reflect.apply(target, thisArg, args)
      }

      return Reflect.apply(target, thisArg, args)
    },
  })
}

// 添加消息监听器
window.addEventListener('message', (event) => {
  // 确保消息来源是插件环境
  if (event.source !== window)
    return

  const { type, data } = event.data

  // 处理来自插件环境的消息
  if (type === 'BEWLY_SETTINGS_UPDATE') {
    // 更新设置
    if (data) {
      const isFirstTime = !settingsReady
      currentSettings = data
      settingsReady = true

      // 只在首次启用时输出日志
      if (isFirstTime && data.enableVolumeNormalization) {
        console.log('[AudioInterceptor] 音量均衡已启用')
      }
    }
  }
})

// 请求初始设置
window.postMessage({
  type: 'BEWLY_REQUEST_SETTINGS',
}, '*')

// ==================== 音频拦截器：响度均衡 ====================
;(() => {
  // 检查是否为直播页面，如果是则不注入
  if (location.hostname.includes('live.bilibili.com'))
    return

  // 保存原始 AudioContext
  const OriginalAudioContext = window.AudioContext || (window as any).webkitAudioContext
  if (!OriginalAudioContext) {
    console.warn('[AudioInterceptor] AudioContext 不可用')
    return
  }

  // 音频节点引用（用于实时更新参数）
  let audioNodes: {
    source: MediaElementAudioSourceNode
    analyser: AnalyserNode
    compressor: DynamicsCompressorNode
    adaptiveGain: GainNode
    limiter: DynamicsCompressorNode
    context: AudioContext
  } | null = null

  // 响度分析状态
  let loudnessAnalysis: {
    dataArray: Float32Array<ArrayBuffer>
    smoothedLoudness: number
    targetLoudness: number
    animationId: number | null
  } | null = null

  // 标记是否已处理
  let currentVideoElement: HTMLVideoElement | null = null
  let hasProcessed = false

  // 重置处理状态（用于视频切换时）
  function resetProcessingState() {
    hasProcessed = false
    currentVideoElement = null

    // 停止旧的响度分析循环
    if (loudnessAnalysis?.animationId) {
      cancelAnimationFrame(loudnessAnalysis.animationId)
      loudnessAnalysis.animationId = null
    }

    // 关闭旧的 AudioContext
    if (audioNodes?.context && audioNodes.context.state !== 'closed') {
      audioNodes.context.close().catch(err => console.warn('[AudioInterceptor] 关闭 AudioContext 失败:', err))
    }

    audioNodes = null
    loudnessAnalysis = null
  }

  // 创建音频处理链
  function createAudioProcessingChain(context: AudioContext, source: MediaElementAudioSourceNode) {
    try {
      // 1. 创建分析器节点（用于实时监测响度）
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      const bufferLength = analyser.fftSize
      const dataArray = new Float32Array(bufferLength)

      // 2. 创建自适应增益节点（核心：根据响度自动调整音量）
      const adaptiveGain = context.createGain()
      adaptiveGain.gain.setValueAtTime(1.0, context.currentTime)

      // 3. 创建极轻度压缩器（仅用于极端峰值平滑，避免破音）
      const compressor = context.createDynamicsCompressor()
      const ratio = currentSettings!.normalizationStrength || 12
      // 使用极度温和的参数，几乎不压缩，只处理极端情况
      compressor.threshold.setValueAtTime(-6, context.currentTime) // 非常高的阈值
      compressor.knee.setValueAtTime(40, context.currentTime) // 软拐点
      compressor.ratio.setValueAtTime(Math.min(ratio / 6, 2), context.currentTime) // 极低压缩比（最大2:1）
      compressor.attack.setValueAtTime(0.1, context.currentTime) // 100ms 慢启动
      compressor.release.setValueAtTime(1.0, context.currentTime) // 1秒释放（最大值）

      // 4. 创建限制器（防止削峰破音）
      const limiter = context.createDynamicsCompressor()
      limiter.threshold.setValueAtTime(-1, context.currentTime) // 接近0dB才限制
      limiter.knee.setValueAtTime(0, context.currentTime)
      limiter.ratio.setValueAtTime(20, context.currentTime)
      limiter.attack.setValueAtTime(0.001, context.currentTime)
      limiter.release.setValueAtTime(0.1, context.currentTime)

      // 连接音频处理链（简化版：只做音量调整，不改变音质）
      source.connect(analyser)
      analyser.connect(adaptiveGain) // 自适应增益
      adaptiveGain.connect(compressor) // 轻度压缩
      compressor.connect(limiter) // 限制器
      limiter.connect(context.destination)

      // 保存节点引用
      audioNodes = {
        source,
        analyser,
        compressor,
        adaptiveGain,
        limiter,
        context,
      }

      // 初始化响度分析
      const targetVolume = currentSettings!.targetVolume || 50
      const targetLoudness = targetVolume / 100
      loudnessAnalysis = {
        dataArray,
        smoothedLoudness: 0,
        targetLoudness,
        animationId: null,
      }

      // 启动响度分析循环
      startLoudnessAnalysis()

      return limiter
    }
    catch (error: any) {
      console.error('[AudioInterceptor] 创建音频处理链失败:', error)
      throw error
    }
  }

  // 监听 URL 变化（B站是单页应用，切换视频时重置状态）
  let lastUrl = location.href

  function checkUrlChange() {
    const currentUrl = location.href
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl
      // 如果是视频页面，重置状态
      if (currentUrl.includes('/video/')) {
        setTimeout(() => resetProcessingState(), 500)
      }
    }
  }

  // 监听 pushState 和 replaceState
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = function (...args) {
    originalPushState.apply(this, args)
    checkUrlChange()
  }

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args)
    checkUrlChange()
  }

  // 拦截 createMediaElementSource
  const originalCreateMediaElementSource = OriginalAudioContext.prototype.createMediaElementSource

  OriginalAudioContext.prototype.createMediaElementSource = function (mediaElement: HTMLMediaElement) {
    // 调用原始方法创建源节点
    const source = originalCreateMediaElementSource.call(this, mediaElement)

    // 只处理视频元素
    if (!(mediaElement instanceof HTMLVideoElement))
      return source

    // 如果已经处理过这个视频元素，跳过
    if (hasProcessed && currentVideoElement === mediaElement)
      return source

    // 如果检测到新的视频元素，重置状态
    if (currentVideoElement && currentVideoElement !== mediaElement)
      resetProcessingState()

    currentVideoElement = mediaElement as HTMLVideoElement

    // 检查设置是否就绪
    if (!settingsReady || !currentSettings)
      return source

    // 检查是否启用
    if (!currentSettings.enableVolumeNormalization)
      return source

    hasProcessed = true

    try {
      // 调用共用函数创建音频处理链
      const limiter = createAudioProcessingChain(this as AudioContext, source)

      // 返回限制器节点（让 Bilibili 播放器连接到处理链末端）
      // 注意：这里返回 limiter 而不是 source，这样 Bilibili 连接到 destination 时
      // 音频流会经过完整的处理链：video → source → analyser → compressor → gain → limiter → destination
      return limiter as any as MediaElementAudioSourceNode
    }
    catch (error) {
      console.error('[AudioInterceptor] 创建音频处理链失败:', error)
      hasProcessed = false
      return source
    }
  }

  // 响度分析和自适应增益调整
  function startLoudnessAnalysis() {
    if (!audioNodes || !loudnessAnalysis || !currentSettings)
      return

    const { analyser, adaptiveGain, context } = audioNodes
    const responseSpeed = (currentSettings.adaptiveGainSpeed || 5) / 10 // 归一化到 0-1

    // 增益更新控制
    let lastGainUpdate = 0 // 记录上次更新增益的时间

    function analyze() {
      if (!audioNodes || !loudnessAnalysis)
        return

      // 获取时域数据
      analyser.getFloatTimeDomainData(loudnessAnalysis.dataArray)

      // 计算 RMS（均方根）作为响度
      let sum = 0
      for (let i = 0; i < loudnessAnalysis.dataArray.length; i++) {
        sum += loudnessAnalysis.dataArray[i] * loudnessAnalysis.dataArray[i]
      }
      const rms = Math.sqrt(sum / loudnessAnalysis.dataArray.length)

      // 平滑响度（长时间滑动窗口平均，保持视频级别稳定）
      // 使用更大的平滑因子，让响度只反映长期平均值，而非瞬时变化
      const smoothingFactor = 0.985 // 提高到0.985，响应更慢，约30秒达到稳定
      loudnessAnalysis.smoothedLoudness = loudnessAnalysis.smoothedLoudness * smoothingFactor + rms * (1 - smoothingFactor)

      // 每隔 1 秒才更新一次增益（避免频繁调度导致音频断续）
      const now = context.currentTime
      if (now - lastGainUpdate >= 1.0) {
        lastGainUpdate = now

        // 计算增益调整（使用 dB 对数计算）
        const currentLoudness = loudnessAnalysis.smoothedLoudness
        if (currentLoudness > 0.0001) { // 避免除以0和过低的值
          // 将响度转换为 dB
          const currentDb = 20 * Math.log10(currentLoudness)

          // 目标响度映射（改进版）：targetVolume (0-100) -> 目标dB
          // 使用指数曲线映射，让常用范围（30-70）的差异更明显
          // 公式: targetDb = -45 * ((100 - targetVolume) / 100) ^ 1.8
          // targetVolume = 0   → -45dB (非常安静)
          // targetVolume = 30  → -22dB (偏安静)
          // targetVolume = 50  → -11dB (中等)
          // targetVolume = 70  → -4dB  (偏响)
          // targetVolume = 100 → 0dB   (最响)
          const volumeRatio = (100 - loudnessAnalysis.targetLoudness * 100) / 100
          const targetDb = -45 * volumeRatio ** 1.8

          // 计算需要的增益（dB差值）
          const gainDb = targetDb - currentDb

          // 限制增益范围：-25dB 到 +25dB（对应 0.056x 到 17.8x）
          // 放宽限制以支持更大的音量调整范围
          const clampedGainDb = Math.max(-25, Math.min(25, gainDb))

          // 转换回线性增益
          const targetGain = 10 ** (clampedGainDb / 20)

          // 根据响应速度调整时间常数
          // responseSpeed: 1-10 -> timeConstant: 10-1秒
          // 时间常数越小，响应越快
          const timeConstant = 11 - responseSpeed // 1-10秒

          // 使用 setTargetAtTime 实现平滑过渡（指数曲线，非常自然）
          // timeConstant 定义了到达目标值 63% 所需的时间
          adaptiveGain.gain.setTargetAtTime(
            Math.max(0.01, targetGain), // 确保增益至少为0.01
            now,
            timeConstant,
          )
        }
      }

      // 继续分析
      loudnessAnalysis.animationId = requestAnimationFrame(analyze)
    }

    analyze()
  }

  // 停止响度分析
  function stopLoudnessAnalysis() {
    if (loudnessAnalysis?.animationId) {
      cancelAnimationFrame(loudnessAnalysis.animationId)
      loudnessAnalysis.animationId = null
    }
  }

  // 监听设置更新，实时调整音频参数
  window.addEventListener('message', (event) => {
    if (event.source !== window)
      return

    const { type, data } = event.data

    if (type === 'BEWLY_SETTINGS_UPDATE' && audioNodes) {
      try {
        const newSettings = data as Settings

        // 更新目标响度
        if (newSettings.targetVolume !== undefined && loudnessAnalysis)
          loudnessAnalysis.targetLoudness = newSettings.targetVolume / 100

        // 更新压缩比
        if (newSettings.normalizationStrength !== undefined) {
          const ratio = Math.min(newSettings.normalizationStrength / 6, 2)
          audioNodes.compressor.ratio.setValueAtTime(
            ratio,
            audioNodes.context.currentTime,
          )
        }
      }
      catch (error) {
        console.error('[AudioInterceptor] 更新音频参数失败:', error)
      }
    }
  })

  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    stopLoudnessAnalysis()
  })
})()

// 页面加载完成后初始化随机播放（功能已迁移到contentScripts）
