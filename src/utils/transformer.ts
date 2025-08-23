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
      if (el) {
        const targetRect = el.getBoundingClientRect()

        if (transformer.centerTarget.x) {
          x = `calc(${transformer.x} - ${targetRect.width / 2}px)`
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
        update()
        const style = targetElement.getAttribute('style')
        targetElement.setAttribute('style', generateStyle(style))
      }
    }
    catch (e) {
      console.warn('Failed to update style on visibility change:', e)
    }
  }, { flush: 'pre' })

  return target
}
