import { reactive, ref, watch } from 'vue'

import { useDelayedHover } from '~/composables/useDelayedHover'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { createTransformer } from '~/utils/transformer'

export function useTopBarInteraction() {
  const topBarStore = useTopBarStore()
  const { closeAllPopups } = topBarStore
  const topBarItemElements = reactive({})
  const topBarTransformers = reactive({})

  const isMouseOverPopup = reactive<Record<string, boolean>>({})

  // 当前点击的顶栏项
  const currentClickedTopBarItem = ref<string | null>(null)

  // 设置顶栏项悬停事件
  function setupTopBarItemHoverEvent(key: string) {
    const element = useDelayedHover({
      enterDelay: 320,
      leaveDelay: 320,
      beforeEnter: () => closeAllPopups(key),
      enter: () => {
        topBarStore.popupVisible[key] = true
      },
      leave: () => {
        // 只有当鼠标不在弹窗上时才隐藏
        setTimeout(() => {
          if (!isMouseOverPopup[key]) {
            topBarStore.popupVisible[key] = false
          }
        }, 200)
      },
    })

    topBarItemElements[key] = element
    return element
  }

  // 设置顶栏项变换器
  function setupTopBarItemTransformer(key: string, targetRef?: any) {
    const transformer = createTransformer(topBarItemElements[key], {
      x: '0px',
      y: '50px',
      centerTarget: {
        x: true,
      },
    })

    // 如果提供了targetRef，将其存储但不修改transformer的内部逻辑
    if (targetRef) {
      topBarTransformers[key] = targetRef
      // 监听targetRef的变化，当targetRef有值时，将其设置为transformer的target
      watch(targetRef, (newVal) => {
        if (newVal) {
          transformer.value = newVal
        }
      }, { immediate: true })
      return targetRef
    }

    topBarTransformers[key] = transformer
    return transformer
  }

  // 处理顶栏项点击
  function handleClickTopBarItem(event: MouseEvent, key: string) {
    if (settings.value.touchScreenOptimization) {
      event.preventDefault()
      closeAllPopups(key)
      topBarStore.popupVisible[key] = !topBarStore.popupVisible[key]
      currentClickedTopBarItem.value = key
    }
  }

  return {
    currentClickedTopBarItem,
    setupTopBarItemHoverEvent,
    setupTopBarItemTransformer,
    handleClickTopBarItem,
  }
}
