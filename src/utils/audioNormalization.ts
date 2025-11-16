/**
 * 音频响度均衡工具
 * 注意：实际的音频处理逻辑在 src/inject/index.ts 中实现
 * 这里的函数用于实时参数更新（虽然 watch 会自动同步设置，但这里提供显式接口以便即时生效）
 */

/**
 * 应用音量标准化（空实现，实际处理在inject层）
 */
export async function applyVolumeNormalization(_videoElement?: HTMLVideoElement): Promise<void> {
  // 实际功能已在 src/inject/index.ts 中通过拦截 AudioContext 实现
  // 这里保留空函数是为了保持代码结构一致性
  // 音频处理会在视频播放时自动激活，无需手动调用
}

/**
 * 更新均衡强度（用于实时调整参数）
 * 注意：settings 的 watch 已经会自动同步，此函数主要用于确保更新立即生效
 */
export function updateNormalizationStrength(_strength: number): void {
  // settings 的变化会通过 contentScripts/index.ts 的 watch 自动发送 BEWLY_SETTINGS_UPDATE 消息
  // inject/index.ts 的消息监听器会接收并更新音频节点参数
  // 这个函数保留是为了代码的语义清晰，实际不需要额外操作
}

/**
 * 更新目标音量（用于实时调整参数）
 * 注意：settings 的 watch 已经会自动同步，此函数主要用于确保更新立即生效
 */
export function updateNormalizationVolume(_volume: number): void {
  // settings 的变化会通过 contentScripts/index.ts 的 watch 自动发送 BEWLY_SETTINGS_UPDATE 消息
  // inject/index.ts 的消息监听器会接收并更新音频节点参数
  // 这个函数保留是为了代码的语义清晰，实际不需要额外操作
}
