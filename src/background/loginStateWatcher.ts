import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_MATCHES } from '~/constants/contentScript'
import { TOP_BAR_STATE_MESSAGE } from '~/constants/topBarState'

// 登录态相关的会话 Cookie（见 bilibili-API-collect docs/login/exit.md：
// 登出会清空它们，登录/扫码登录会写入）
const WATCHED_COOKIE_NAMES = new Set(['DedeUserID', 'SESSDATA'])

// 登录/登出/切号通常会连续触发多个 Cookie 变更；短窗内合并为一次广播
const BROADCAST_COALESCE_MS = 200

let broadcastTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 监听会话 Cookie 变化并广播给所有内容脚本。
 *
 * 登录态变化（他处登录/登出/会话过期/切换账号）必然伴随这两个 Cookie 的
 * 写入或清除，因此事件驱动可以替代轮询（见 issue #921）。广播不携带状态，
 * 各标签页自行按本地 Cookie 事实校正（reconcileLocalLoginState），SESSDATA
 * 例行轮换等值变化会被标签页侧的 mid 比对自然过滤。
 */
export function setupLoginStateWatcher() {
  browser.cookies.onChanged.addListener(({ cookie }) => {
    const normalizedDomain = cookie.domain.trim().toLowerCase().replace(/^\.+/, '')
    const isBilibiliDomain = normalizedDomain === 'bilibili.com' || normalizedDomain.endsWith('.bilibili.com')

    if (!WATCHED_COOKIE_NAMES.has(cookie.name) || !isBilibiliDomain)
      return

    scheduleBroadcastLoginStateChanged()
  })
}

function scheduleBroadcastLoginStateChanged() {
  // 延后到最后一次 Cookie 变更后再广播，避免在 DedeUserID/SESSDATA
  // 尚未同时更新时触发中间态校正。
  if (broadcastTimer !== null)
    clearTimeout(broadcastTimer)

  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    void broadcastLoginStateChanged()
  }, BROADCAST_COALESCE_MS)
}

async function broadcastLoginStateChanged() {
  try {
    const tabs = await browser.tabs.query({ url: [...CONTENT_SCRIPT_MATCHES] })
    await Promise.allSettled(
      tabs
        .filter(tab => tab.id !== undefined)
        .map(tab => browser.tabs.sendMessage(tab.id!, { type: TOP_BAR_STATE_MESSAGE.LOGIN_STATE_CHANGED })),
    )
  }
  catch {
    // 没有匹配的标签页或查询失败时静默：下次变化会再次广播
  }
}
