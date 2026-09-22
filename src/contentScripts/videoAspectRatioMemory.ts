import { settings, settingsReady } from '~/logic'
import type { VideoAspectRatio } from '~/logic/storage'

import { setupPlayerSettingSync } from './playerSettingSync'

const ASPECT_INPUT_SELECTOR = '.bpx-player-ctrl-setting-aspect input.bui-radio-input[type="radio"]'
const SUPPORTED_ASPECT_RATIOS = new Set<VideoAspectRatio>(['0:0', '4:3', '16:9'])

let hasInitialized = false

function isVideoAspectRatio(value: string): value is VideoAspectRatio {
  return SUPPORTED_ASPECT_RATIOS.has(value as VideoAspectRatio)
}

function getAspectInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(ASPECT_INPUT_SELECTOR))
    .filter(input => isVideoAspectRatio(input.value))
}

function rememberSelectedAspectRatio(event: Event) {
  if (!settings.value.rememberVideoAspectRatio)
    return

  const input = event.target
  if (!(input instanceof HTMLInputElement)
    || !input.matches(ASPECT_INPUT_SELECTOR)
    || !input.checked
    || !isVideoAspectRatio(input.value)) {
    return
  }

  settings.value.savedVideoAspectRatio = input.value
}

function syncVideoAspectRatio() {
  if (!settings.value.rememberVideoAspectRatio)
    return

  const inputs = getAspectInputs()
  if (!inputs.length)
    return

  const selectedInput = inputs.find(input => input.checked)
  const savedAspectRatio = settings.value.savedVideoAspectRatio

  // 首次启用时沿用播放器当前值，避免意外重置用户已选择的比例。
  if (!savedAspectRatio) {
    if (selectedInput)
      settings.value.savedVideoAspectRatio = selectedInput.value as VideoAspectRatio
    return
  }

  if (selectedInput?.value === savedAspectRatio)
    return

  const targetInput = inputs.find(input => input.value === savedAspectRatio)
  if (!targetInput || targetInput.disabled)
    return

  targetInput.click()
}

export function initVideoAspectRatioMemory() {
  if (hasInitialized || location.hostname === 'live.bilibili.com')
    return

  hasInitialized = true

  void settingsReady.then(() => {
    const syncController = setupPlayerSettingSync({
      enabled: () => settings.value.rememberVideoAspectRatio,
      preference: () => settings.value.savedVideoAspectRatio,
      target: () => document.querySelector('.bpx-player-ctrl-setting-aspect'),
      sync: syncVideoAspectRatio,
    })
    document.addEventListener('change', rememberSelectedAspectRatio, { capture: true, signal: syncController.signal })
  })
}
