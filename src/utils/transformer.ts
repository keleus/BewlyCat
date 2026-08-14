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

export type TransformerHandle = Ref<MaybeElement> & {
  applyPosition: () => void
}

/**
 * Covert transform to top and left style, if no chromium, use transform
 * @param trigger
 * @param transformer
 */
export function createTransformer(trigger: Ref<MaybeElement>, transformer: Transformer): TransformerHandle {
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
        // offsetWidth/Height 是布局盒（CSSOM View），不含 transform。
        // getBoundingClientRect 含 transform，enter/leave 动画中会得到错误宽高。
        const targetWidth = el instanceof HTMLElement ? el.offsetWidth : el.getBoundingClientRect().width
        const targetHeight = el instanceof HTMLElement ? el.offsetHeight : el.getBoundingClientRect().height
        const triggerRect = triggerEl.getBoundingClientRect()

        if (transformer.centerTarget.x) {
          // 计算 popup 的预期中心点位置
          const popupCenterX = triggerRect.left + triggerRect.width / 2
          // 计算 popup 居中后的左右边界
          const popupLeft = popupCenterX - targetWidth / 2
          const popupRight = popupCenterX + targetWidth / 2

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
            x = `calc(${transformer.x} - ${targetWidth / 2}px + ${offset}px)`
          }
          else {
            x = `calc(${transformer.x} - ${targetWidth / 2}px)`
          }
        }

        if (transformer.centerTarget.y) {
          y = `calc(${transformer.y} - ${targetHeight / 2}px)`
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

  function applyPosition() {
    try {
      const element = unrefElement(target)
      if (!(element instanceof HTMLElement))
        return
      // 未生成 CSS 布局盒时跳过（display:none 或不在文档中，CSSOM View getClientRects）。
      if (element.getClientRects().length === 0)
        return

      update()
      element.setAttribute('style', generateStyle(element.getAttribute('style')))
    }
    catch (e) {
      console.warn('Failed to apply transformer position:', e)
    }
  }

  // IntersectionObserver 在绘制之后通知，只作 getClientRects 仍为空时的补写。
  const targetVisibility = useElementVisibility(target)
  whenever(targetVisibility, () => {
    applyPosition()
  }, { flush: 'post' })

  const handle = target as TransformerHandle
  handle.applyPosition = applyPosition
  return handle
}
