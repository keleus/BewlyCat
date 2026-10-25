import { watch } from 'vue'

import { settings } from '~/logic'
import { injectCSS } from '~/utils/main'

const PIP_BUTTON_SELECTOR = '.bpx-player-ctrl-pip, .bilibili-player-video-btn-pip'

let styleElement: HTMLStyleElement | null = null
let hasInitialized = false

function setButtonHidden(hidden: boolean) {
  if (!hidden) {
    styleElement?.remove()
    styleElement = null
    return
  }

  styleElement ??= injectCSS(`
    ${PIP_BUTTON_SELECTOR} {
      display: none !important;
    }
  `)
}

export function initVideoPipButtonControl() {
  if (hasInitialized)
    return

  hasInitialized = true
  watch(
    () => settings.value.showVideoPipButton,
    visible => setButtonHidden(!visible),
    { immediate: true },
  )
}
