/** B 站播放器方向键的默认音量步进（百分比） */
const DEFAULT_KEYBOARD_VOLUME_STEP = 10

export function normalizeKeyboardVolumeStep(value: unknown): number {
  const step = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_KEYBOARD_VOLUME_STEP
  return Math.round(Math.max(1, Math.min(50, step)))
}
