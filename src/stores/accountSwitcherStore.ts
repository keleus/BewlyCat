import { defineStore } from 'pinia'
import { ref } from 'vue'

import type {
  AccountAddByCookiePayload,
  AccountListResult,
  AccountLoginPollResult,
  AccountLoginStartResult,
  AccountMutationResult,
  AccountRenamePayload,
  AccountSummary,
  AccountSwitcherErrorCode,
  AccountSwitchResult,
} from '~/constants/accountSwitcher'
import { ACCOUNT_SWITCHER_MESSAGE } from '~/constants/accountSwitcher'
import { sendMessage } from '~/utils/messaging'

const LOGIN_POLL_INTERVAL_MS = 900

export type AccountDialogType = 'cookie' | 'rename'

export const useAccountSwitcherStore = defineStore('accountSwitcher', () => {
  const accounts = ref<AccountSummary[]>([])
  const loading = ref(false)
  const busyId = ref<string>()
  const loginPending = ref(false)
  const lastError = ref<AccountSwitcherErrorCode | ''>('')

  // 对话框状态放在 store 里，使对话框组件可以挂在 popover 外部（始终挂载），
  // 避免 popover 收起时对话框被卸载。
  const activeDialog = ref<AccountDialogType | null>(null)
  const renameTargetId = ref<string>('')
  const renameTargetInitial = ref<string>('')
  // 账号行右键/更多菜单同样放在常驻层，避免顶栏弹层收起时被卸载。
  const rowMenu = ref<{ id: string, x: number, y: number } | null>(null)

  let loginPollTimer: ReturnType<typeof setInterval> | undefined

  function stopLoginPolling() {
    if (loginPollTimer !== undefined) {
      clearInterval(loginPollTimer)
      loginPollTimer = undefined
    }
  }

  async function refresh() {
    loading.value = true
    try {
      const result = await sendMessage<undefined, AccountListResult>(ACCOUNT_SWITCHER_MESSAGE.LIST)
      if (result.ok) {
        accounts.value = result.accounts
        loginPending.value = result.loginPending
        // 登录会话状态已确认，不再残留“请先完成或取消”的提示。
        if (lastError.value === 'LOGIN_IN_PROGRESS' && !result.loginPending)
          lastError.value = ''
      }
      else {
        lastError.value = result.code
      }
    }
    catch {
      lastError.value = 'UNAVAILABLE'
    }
    finally {
      loading.value = false
    }
  }

  async function switchTo(id: string): Promise<boolean> {
    busyId.value = id
    lastError.value = ''
    try {
      const result = await sendMessage<{ id: string }, AccountSwitchResult>(ACCOUNT_SWITCHER_MESSAGE.SWITCH, { id })
      if (!result.ok) {
        lastError.value = result.code
        busyId.value = undefined
        return false
      }
      busyId.value = undefined
      // 已经是当前账号时无需刷新页面。
      if (result.unchanged) {
        await refresh()
        return true
      }
      // 后台已写入目标账号的 Cookie，刷新后页面重新读取登录态。
      location.reload()
      return true
    }
    catch {
      lastError.value = 'UNAVAILABLE'
      busyId.value = undefined
      return false
    }
  }

  async function pollLoginOnce() {
    try {
      const result = await sendMessage<undefined, AccountLoginPollResult>(ACCOUNT_SWITCHER_MESSAGE.LOGIN_POLL)
      if (!result.ok) {
        lastError.value = result.code
        stopLoginPolling()
        loginPending.value = false
        await refresh()
        return
      }
      if (result.status === 'done') {
        stopLoginPolling()
        loginPending.value = false
        await refresh()
        // 仅在确实切换了账号时刷新；只添加不切换时由登录态广播更新界面。
        if (result.switched)
          location.reload()
      }
    }
    catch {
      lastError.value = 'UNAVAILABLE'
      stopLoginPolling()
      loginPending.value = false
    }
  }

  /** 页面刷新后仍处于添加账号流程时，重新挂上轮询。 */
  function resumeLoginPolling() {
    if (loginPollTimer !== undefined)
      return
    loginPending.value = true
    loginPollTimer = setInterval(pollLoginOnce, LOGIN_POLL_INTERVAL_MS)
  }

  async function startLogin(switchAfterLogin = true): Promise<'started' | 'in-progress' | 'failed'> {
    stopLoginPolling()
    lastError.value = ''
    try {
      const result = await sendMessage<{ switchAfterLogin: boolean }, AccountLoginStartResult>(
        ACCOUNT_SWITCHER_MESSAGE.LOGIN_START,
        { switchAfterLogin },
      )
      if (!result.ok) {
        // 已有进行中的登录：直接接管现有会话，而不是报错卡住。
        if (result.code === 'LOGIN_IN_PROGRESS') {
          resumeLoginPolling()
          return 'in-progress'
        }
        lastError.value = result.code
        return 'failed'
      }
    }
    catch {
      lastError.value = 'UNAVAILABLE'
      return 'failed'
    }

    resumeLoginPolling()
    return 'started'
  }

  async function cancelLogin() {
    stopLoginPolling()
    try {
      await sendMessage(ACCOUNT_SWITCHER_MESSAGE.LOGIN_CANCEL)
    }
    catch {
      // 取消失败时后台仍会在下次轮询/关闭登录页时恢复。
    }
    loginPending.value = false
    // 后台会还原原账号的 Cookie；登录态变化由后台广播驱动，无需刷新页面。
    await refresh()
  }

  async function addByCookie(cookieString: string): Promise<boolean> {
    lastError.value = ''
    try {
      const result = await sendMessage<AccountAddByCookiePayload, AccountMutationResult>(
        ACCOUNT_SWITCHER_MESSAGE.ADD_BY_COOKIE,
        { cookieString },
      )
      if (!result.ok) {
        lastError.value = result.code
        return false
      }
      await refresh()
      return true
    }
    catch {
      lastError.value = 'UNAVAILABLE'
      return false
    }
  }

  async function rename(id: string, alias: string): Promise<boolean> {
    lastError.value = ''
    try {
      const result = await sendMessage<AccountRenamePayload, AccountMutationResult>(
        ACCOUNT_SWITCHER_MESSAGE.RENAME,
        { id, alias },
      )
      if (!result.ok) {
        lastError.value = result.code
        return false
      }
      await refresh()
      return true
    }
    catch {
      lastError.value = 'UNAVAILABLE'
      return false
    }
  }

  async function remove(id: string): Promise<boolean> {
    lastError.value = ''
    try {
      const result = await sendMessage<{ id: string }, AccountMutationResult>(
        ACCOUNT_SWITCHER_MESSAGE.REMOVE,
        { id },
      )
      if (!result.ok) {
        lastError.value = result.code
        return false
      }
      await refresh()
      return true
    }
    catch {
      lastError.value = 'UNAVAILABLE'
      return false
    }
  }

  function clearError() {
    lastError.value = ''
  }

  function openDialog(type: AccountDialogType, opts?: { id?: string, initial?: string }) {
    clearError()
    activeDialog.value = type
    if (opts?.id !== undefined)
      renameTargetId.value = opts.id
    if (opts?.initial !== undefined)
      renameTargetInitial.value = opts.initial
  }

  function closeDialog() {
    activeDialog.value = null
  }

  function openRowMenu(id: string, x: number, y: number) {
    rowMenu.value = { id, x, y }
  }

  function closeRowMenu() {
    rowMenu.value = null
  }

  return {
    accounts,
    loading,
    busyId,
    loginPending,
    lastError,
    refresh,
    switchTo,
    startLogin,
    resumeLoginPolling,
    cancelLogin,
    addByCookie,
    rename,
    remove,
    clearError,
    activeDialog,
    renameTargetId,
    renameTargetInitial,
    rowMenu,
    openDialog,
    closeDialog,
    openRowMenu,
    closeRowMenu,
  }
})
