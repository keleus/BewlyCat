import { settings } from '~/logic'
import { t } from '~/utils/dataFormatter'

import { getUpInfo, showState } from './player'
import { saveUpVolumeConfig } from './volumeBalance'

let dialogElement: HTMLElement | null = null

// 显示音量调整对话框
export function showVolumeAdjustDialog(currentVolume: number): void {
  if (!settings.value.enableVolumeBalance) {
    return
  }

  const upInfo = getUpInfo()
  if (!upInfo.uid || !upInfo.name) {
    return
  }

  // 如果对话框已经显示，直接返回
  if (dialogElement) {
    return
  }

  const baseVolume = settings.value.baseVolume
  const volumeOffset = currentVolume - baseVolume

  // 创建对话框元素
  dialogElement = document.createElement('div')
  dialogElement.id = 'bewly-volume-dialog'
  dialogElement.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100001;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 20px;
    border-radius: 8px;
    font-size: 16px;
    min-width: 300px;
    text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  dialogElement.innerHTML = `
    <div style="margin-bottom: 15px;">
      <div style="font-weight: bold; margin-bottom: 10px;">${t('settings.volume_balance.dialog.title')}</div>
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">
        ${t('settings.volume_balance.dialog.current_volume')}: ${currentVolume}% | ${t('settings.volume_balance.dialog.base_volume')}: ${baseVolume}%
      </div>
      <div style="font-size: 14px; color: #ccc;">
        ${t('settings.volume_balance.dialog.up_name')}: ${upInfo.name}
      </div>
    </div>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <button id="recordUp" style="
        background: #00a1d6;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
      ">${t('settings.volume_balance.dialog.record_up_config')}</button>
      <button id="adjustBase" style="
        background: #fb7299;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
      ">${t('settings.volume_balance.dialog.adjust_base_volume')}</button>
      <button id="cancel" style="
        background: #666;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
      ">${t('settings.volume_balance.dialog.cancel')}</button>
    </div>
  `

  // 添加按钮悬停效果
  const buttons = dialogElement.querySelectorAll('button')
  buttons.forEach((button) => {
    button.addEventListener('mouseenter', () => {
      const currentBg = button.style.background
      if (currentBg.includes('#00a1d6')) {
        button.style.background = '#0082b3'
      }
      else if (currentBg.includes('#fb7299')) {
        button.style.background = '#e85a7a'
      }
      else {
        button.style.background = '#555'
      }
    })

    button.addEventListener('mouseleave', () => {
      const id = button.id
      if (id === 'recordUp') {
        button.style.background = '#00a1d6'
      }
      else if (id === 'adjustBase') {
        button.style.background = '#fb7299'
      }
      else {
        button.style.background = '#666'
      }
    })
  })

  // 添加事件监听器
  const recordUpBtn = dialogElement.querySelector('#recordUp') as HTMLButtonElement
  const adjustBaseBtn = dialogElement.querySelector('#adjustBase') as HTMLButtonElement
  const cancelBtn = dialogElement.querySelector('#cancel') as HTMLButtonElement

  recordUpBtn.addEventListener('click', () => {
    saveUpVolumeConfig(upInfo.uid!, upInfo.name!, volumeOffset)
    const offsetText = volumeOffset > 0 ? `+${volumeOffset}` : `${volumeOffset}`
    showState(t('settings.volume_balance.dialog.recorded_message', { name: upInfo.name, offset: offsetText }))
    closeDialog()
  })

  adjustBaseBtn.addEventListener('click', () => {
    settings.value.baseVolume = currentVolume
    showState(t('settings.volume_balance.dialog.base_adjusted_message', { volume: currentVolume }))
    closeDialog()
  })

  cancelBtn.addEventListener('click', () => {
    closeDialog()
  })

  // 添加键盘事件监听
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeDialog()
      document.removeEventListener('keydown', handleKeydown)
    }
  }
  document.addEventListener('keydown', handleKeydown)

  // 添加到页面
  document.body.appendChild(dialogElement)

  // 5秒后自动关闭
  setTimeout(() => {
    if (dialogElement && document.body.contains(dialogElement)) {
      closeDialog()
      document.removeEventListener('keydown', handleKeydown)
    }
  }, 5000)
}

// 关闭对话框
function closeDialog() {
  if (dialogElement) {
    document.body.removeChild(dialogElement)
    dialogElement = null
  }
}
