<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { ACCOUNT_SWITCHER_ERROR_MESSAGE_KEYS } from '~/constants/accountSwitcher'
import { useAccountSwitcherStore } from '~/stores/accountSwitcherStore'
import { useTopBarStore } from '~/stores/topBarStore'

const { t } = useI18n()
const { confirm } = useConfirmDialog()
const { mainAppRef } = useBewlyApp()
const accountStore = useAccountSwitcherStore()
const topBarStore = useTopBarStore()
const { popupVisible } = storeToRefs(topBarStore)
const {
  accounts,
  activeDialog,
  lastError,
  loginPending,
  renameTargetId,
  renameTargetInitial,
  rowMenu,
} = storeToRefs(accountStore)

const cookieInput = ref('')
const cookieSubmitting = ref(false)
const renameInput = ref('')

// 登录页本身不应再显示“正在添加账号”的浮窗，也不应参与轮询。
const isPassportPage = computed(() => location.hostname === 'passport.bilibili.com')

const errorMessage = computed(() => lastError.value ? t(ACCOUNT_SWITCHER_ERROR_MESSAGE_KEYS[lastError.value]) : '')

// 顶栏“切换账号”或后台操作失败时，面板可能是收起的；用浮窗给出反馈。
const showErrorNotice = ref(false)
let errorNoticeTimer: ReturnType<typeof setTimeout> | undefined

watch(lastError, (code) => {
  if (errorNoticeTimer !== undefined) {
    clearTimeout(errorNoticeTimer)
    errorNoticeTimer = undefined
  }

  if (!code || popupVisible.value?.userPanel || activeDialog.value) {
    showErrorNotice.value = false
    return
  }

  showErrorNotice.value = true
  errorNoticeTimer = setTimeout(() => {
    errorNoticeTimer = undefined
    showErrorNotice.value = false
  }, 8000)
})

onBeforeUnmount(() => {
  if (errorNoticeTimer !== undefined)
    clearTimeout(errorNoticeTimer)
})

const menuOptions = computed<ContextMenuOption[]>(() => [
  {
    value: 'rename',
    label: t('topbar.account_switcher.rename'),
    icon: 'i-mingcute:edit-2-line',
  },
  {
    value: 'remove',
    label: t('topbar.account_switcher.remove'),
    icon: 'i-mingcute:delete-2-line',
    danger: true,
  },
])

watch(activeDialog, (dialog) => {
  if (dialog === 'rename')
    renameInput.value = renameTargetInitial.value
  if (dialog === 'cookie')
    cookieInput.value = ''
})

// 浮层被其它入口关闭时同步收起账号行菜单，避免菜单孤立地留在界面上。
watch(() => popupVisible.value.userPanel, (visible) => {
  if (!visible && rowMenu.value)
    accountStore.closeRowMenu()
})

onMounted(async () => {
  await accountStore.refresh()

  // 页面刷新前已经开始添加账号：恢复轮询，浮窗会随 loginPending 自动出现。
  if (loginPending.value && !isPassportPage.value)
    accountStore.resumeLoginPolling()
})

function displayName(id: string): string {
  const account = accounts.value.find(item => item.id === id)
  return account ? account.alias || account.uname || `@${account.mid}` : ''
}

async function handleMenuSelect(value: string | number) {
  const menu = rowMenu.value
  accountStore.closeRowMenu()
  if (!menu)
    return

  const account = accounts.value.find(item => item.id === menu.id)
  if (!account)
    return

  if (value === 'rename') {
    accountStore.openDialog('rename', {
      id: account.id,
      initial: account.alias || account.uname || `@${account.mid}`,
    })
    return
  }

  if (value === 'remove') {
    const confirmed = await confirm(t('topbar.account_switcher.remove_confirm', { name: account.alias || account.uname || `@${account.mid}` }), {
      title: t('topbar.account_switcher.remove'),
      confirmLabel: t('topbar.account_switcher.remove'),
    })
    if (confirmed)
      await accountStore.remove(account.id)
  }
}

async function handleCancelLogin() {
  await accountStore.cancelLogin()
}

async function handleSubmitCookie() {
  if (!cookieInput.value.trim() || cookieSubmitting.value)
    return

  cookieSubmitting.value = true
  const added = await accountStore.addByCookie(cookieInput.value)
  cookieSubmitting.value = false

  if (!added)
    return

  accountStore.closeDialog()
  cookieInput.value = ''
  location.reload()
}

async function handleSubmitRename() {
  const id = renameTargetId.value
  if (!id)
    return

  const renamed = await accountStore.rename(id, renameInput.value)
  if (renamed)
    accountStore.closeDialog()
}
</script>

<template>
  <!-- 账号行菜单 -->
  <ContextMenu
    v-if="rowMenu"
    :options="menuOptions"
    :menu-styles="{}"
    :cursor-position="{ x: rowMenu.x, y: rowMenu.y }"
    @select="handleMenuSelect"
    @close="accountStore.closeRowMenu()"
  />

  <!-- 添加账号：非阻塞浮窗提示（登录页本身不显示） -->
  <Teleport :to="mainAppRef" :disabled="!mainAppRef">
    <div v-if="!isPassportPage" class="account-notices">
      <Transition name="fade">
        <div
          v-if="showErrorNotice && errorMessage"
          class="account-error-notice"
          role="alert"
        >
          <div class="account-login-notice__spinner" i-mingcute:warning-line />
          <p class="account-error-notice__text">
            {{ errorMessage }}
          </p>
          <button
            type="button"
            class="account-login-notice__cancel"
            @click="showErrorNotice = false"
          >
            <div i-ic-baseline-clear />
          </button>
        </div>
      </Transition>

      <Transition name="fade">
        <div
          v-if="loginPending"
          class="account-login-notice"
          role="status"
          aria-live="polite"
        >
          <div class="account-login-notice__spinner" i-svg-spinners:ring-resize />
          <div class="account-login-notice__body">
            <p class="account-login-notice__title">
              {{ $t('topbar.account_switcher.login_pending') }}
            </p>
            <p class="account-login-notice__hint">
              {{ $t('topbar.account_switcher.login_hint') }}
            </p>
          </div>
          <button
            type="button"
            class="account-login-notice__cancel"
            @click="handleCancelLogin"
          >
            {{ $t('topbar.account_switcher.cancel_login') }}
          </button>
        </div>
      </Transition>
    </div>
  </Teleport>

  <!-- 粘贴 Cookie 对话框 -->
  <Dialog
    v-if="activeDialog === 'cookie'"
    :title="$t('topbar.account_switcher.cookie_title')"
    :show-footer="false"
    :close-on-confirm="false"
    width="440px"
    append-to-bewly-body
    @confirm="handleSubmitCookie"
    @close="accountStore.closeDialog()"
  >
    <div class="account-dialog">
      <p class="account-dialog__hint">
        {{ $t('topbar.account_switcher.cookie_hint') }}
      </p>
      <textarea
        v-model="cookieInput"
        class="account-dialog__textarea"
        :placeholder="$t('topbar.account_switcher.cookie_placeholder')"
        spellcheck="false"
      />
      <p v-if="errorMessage" class="account-dialog__error">
        {{ errorMessage }}
      </p>
      <div class="account-dialog__footer">
        <Button type="tertiary" @click="accountStore.closeDialog()">
          {{ $t('common.operation.cancel') }}
        </Button>
        <Button
          type="primary"
          :disabled="cookieSubmitting || !cookieInput.trim()"
          @click="handleSubmitCookie"
        >
          {{ $t('common.operation.confirm') }}
        </Button>
      </div>
    </div>
  </Dialog>

  <!-- 改名对话框 -->
  <Dialog
    v-if="activeDialog === 'rename'"
    :title="$t('topbar.account_switcher.rename')"
    :show-footer="false"
    :close-on-confirm="false"
    width="360px"
    append-to-bewly-body
    @confirm="handleSubmitRename"
    @close="accountStore.closeDialog()"
  >
    <div class="account-dialog">
      <p class="account-dialog__hint">
        {{ displayName(renameTargetId) }}
      </p>
      <Input v-model="renameInput" size="medium" :placeholder="$t('topbar.account_switcher.rename_placeholder')" />
      <p v-if="errorMessage" class="account-dialog__error">
        {{ errorMessage }}
      </p>
      <div class="account-dialog__footer">
        <Button type="tertiary" @click="accountStore.closeDialog()">
          {{ $t('common.operation.cancel') }}
        </Button>
        <Button type="primary" @click="handleSubmitRename">
          {{ $t('common.operation.confirm') }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style lang="scss" scoped>
.account-notices {
  position: fixed;
  right: var(--bew-space-4);
  bottom: var(--bew-space-4);
  z-index: var(--bew-z-toast);
  display: flex;
  width: min(440px, calc(100vw - var(--bew-space-4) * 2));
  flex-direction: column;
  gap: var(--bew-space-2);
  pointer-events: none;
}

.account-notices > * {
  pointer-events: auto;
}

.account-login-notice {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  box-sizing: border-box;
  width: 100%;
  padding: var(--bew-space-3) var(--bew-space-4);
  border: 1px solid var(--bew-popover-border-color);
  border-radius: var(--bew-popover-radius);
  background: var(--bew-elevated);
  box-shadow: var(--bew-shadow-3);
  backdrop-filter: var(--bew-filter-glass-1);
}

.account-error-notice {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  box-sizing: border-box;
  width: 100%;
  padding: var(--bew-space-2) var(--bew-space-3);
  border: 1px solid var(--bew-error-color);
  border-radius: var(--bew-popover-radius);
  color: var(--bew-error-color);
  background: var(--bew-elevated);
  box-shadow: var(--bew-shadow-3);
}

.account-error-notice__text {
  min-width: 0;
  flex: 1;
  margin: 0;
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-control);
}

.account-login-notice__spinner {
  width: 18px;
  height: 18px;
  flex: none;
  color: var(--bew-theme-color);
}

.account-login-notice__body {
  min-width: 0;
  flex: 1;
}

.account-login-notice__title {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
}

.account-login-notice__hint {
  margin: var(--bew-space-0-5) 0 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-control);
}

.account-login-notice__cancel {
  flex: none;
  padding: var(--bew-space-1) var(--bew-space-3);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius, 6px);
  color: var(--bew-error-color);
  background: transparent;
  font-size: var(--bew-font-size-caption);
  cursor: pointer;
  appearance: none;
  transition:
    background-color 0.2s,
    border-color 0.2s;

  &:hover {
    border-color: var(--bew-error-color);
    background: var(--bew-fill-1);
  }
}

.account-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.account-dialog__hint {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.account-dialog__warning {
  margin: 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-control);
}

.account-dialog__textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 96px;
  padding: var(--bew-space-2);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius, 6px);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font-family: monospace;
  font-size: var(--bew-font-size-caption);
  line-height: 1.5;
  resize: vertical;

  &:focus {
    border-color: var(--bew-theme-color);
    outline: none;
  }
}

.account-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--bew-space-2);
}

.account-dialog__error {
  margin: 0;
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-control);
}
</style>
