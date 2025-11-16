import type { MaybeElement } from '@vueuse/core'
import { unrefElement, useElementVisibility, whenever } from '@vueuse/core'
import type { CSSProperties } from 'vue'

interface TransformerCenter {
  x?: boolean
  y?: boolean
}

export interface Transformer {
  x: number | string
  y: number | string
  centerTarget?: TransformerCenter
  notrigger?: boolean
}

/**
 * Covert transform to top and left style, if no chromium, use transform
 * @param trigger
 * @param transformer
 */
export function createTransformer(trigger: Ref<MaybeElement>, transformer: Transformer) {
  const target = ref<MaybeElement>()
  const style = ref<CSSProperties>({})

  watch(() => trigger.value, (newVal) => {
    if (transformer.notrigger && newVal) {
      try {
        target.value = unrefElement(trigger)
      }
      catch (e) {
        console.warn('Failed to unref element in transformer:', e)
      }
    }
  })

  function update() {
    // 添加安全检查
    if (!target.value && !unrefElement(trigger)) {
      return
    }

    let x = '0px'
    let y = '0px'

    if (typeof transformer.x === 'number') {
      x = `${transformer.x}px`
    }
    else {
      x = transformer.x
    }

    if (typeof transformer.y === 'number') {
      y = `${transformer.y}px`
    }
    else {
      y = transformer.y
    }

    // 增加安全检查
    if (target.value && transformer.centerTarget) {
      const el = unrefElement(target.value)
      const triggerEl = unrefElement(trigger)
      if (el && triggerEl) {
        const targetRect = el.getBoundingClientRect()
        const triggerRect = triggerEl.getBoundingClientRect()

        if (transformer.centerTarget.x) {
          // 计算 popup 的预期中心点位置
          const popupCenterX = triggerRect.left + triggerRect.width / 2
          // 计算 popup 居中后的左右边界
          const popupLeft = popupCenterX - targetRect.width / 2
          const popupRight = popupCenterX + targetRect.width / 2

          const viewportWidth = window.innerWidth
          const edgeMargin = 16 // 与边缘保持的最小距离

          // 检查是否会超出边界
          let offset = 0

          // 超出右边缘
          if (popupRight > viewportWidth - edgeMargin) {
            offset = -(popupRight - (viewportWidth - edgeMargin))
          }
          // 超出左边缘（优先级更高，因为通常更重要）
          else if (popupLeft < edgeMargin) {
            offset = edgeMargin - popupLeft
          }

          // 应用偏移
          if (offset !== 0) {
            x = `calc(${transformer.x} - ${targetRect.width / 2}px + ${offset}px)`
          }
          else {
            x = `calc(${transformer.x} - ${targetRect.width / 2}px)`
          }
        }

        if (transformer.centerTarget.y) {
          y = `calc(${transformer.y} - ${targetRect.height / 2}px)`
        }
      }
    }

    style.value = {
      transform: 'none !important',
      top: y,
      left: x,
    }
  }

  function generateStyle(originStyle: string | undefined | null): string {
    const s = (originStyle || '')
      .split(';')
      .map((item) => {
        const [key, value] = item.split(':').map(item => item.trim())

        if (!key || !value) {
          return {}
        }

        return {
          [key]: value,
        }
      })
      .reduce((acc, item) => {
        return {
          ...acc,
          ...item,
        }
      }, {})

    for (const key in style.value) {
      s[key] = style.value[key]
    }

    return Object.keys(s).map(key => `${key}:${s[key]}`).join(';')
  }

  // v-show
  const targetVisibility = useElementVisibility(target)

  // fix keleus#135
  // 还原为 whenever，仅在显示时计算位置
  whenever(targetVisibility, () => {
    try {
      const targetElement = unrefElement(target)
      if (targetElement) {
        // 使用 requestAnimationFrame 和 setTimeout 确保 DOM 完全稳定后再计算位置
        // 这样可以避免在动画过程中计算位置导致的错误
        requestAnimationFrame(() => {
          setTimeout(() => {
            const element = unrefElement(target)
            if (element) {
              update()
              const style = element.getAttribute('style')
              element.setAttribute('style', generateStyle(style))
            }
          }, 0)
        })
      }
    }
    catch (e) {
      console.warn('Failed to update style on visibility change:', e)
    }
  }, { flush: 'pre' })

  return target
}
