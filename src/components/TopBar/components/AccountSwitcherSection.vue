<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import type { AccountSummary } from '~/constants/accountSwitcher'
import { ACCOUNT_SWITCHER_ERROR_MESSAGE_KEYS } from '~/constants/accountSwitcher'
import { useAccountSwitcherStore } from '~/stores/accountSwitcherStore'

const { t } = useI18n()
const accountStore = useAccountSwitcherStore()
const { accounts, loading, busyId, loginPending, lastError } = storeToRefs(accountStore)

const errorMessage = computed(() => lastError.value ? t(ACCOUNT_SWITCHER_ERROR_MESSAGE_KEYS[lastError.value]) : '')

onMounted(async () => {
  await accountStore.refresh()

  // 页面刷新前已经开始添加账号：恢复轮询，浮窗由 loginPending 驱动。
  if (loginPending.value)
    accountStore.resumeLoginPolling()
})

function displayName(account: AccountSummary): string {
  return account.alias || account.uname || `@${account.mid}`
}

// 头像可能是 http:// 地址，HTTPS 页面会按混合内容拦截；强制升级为 https://。
function faceUrl(account: AccountSummary): string {
  return account.face ? account.face.replace(/^http:\/\//, 'https://') : ''
}

const brokenFaceIds = ref<Set<string>>(new Set())

function markFaceBroken(id: string) {
  brokenFaceIds.value = new Set(brokenFaceIds.value).add(id)
}

async function handleSwitch(account: AccountSummary) {
  if (account.isCurrent || busyId.value)
    return
  await accountStore.switchTo(account.id)
}

function openMenu(event: MouseEvent, account: AccountSummary) {
  event.stopPropagation()
  accountStore.openRowMenu(account.id, event.clientX, event.clientY)
}

async function handleAddByLogin() {
  // 登录进度由顶部浮窗展示，这里只负责启动流程。
  await accountStore.startLogin(true)
}
</script>

<template>
  <div class="account-switcher">
    <div class="account-switcher__header">
      <span>{{ $t('topbar.account_switcher.title') }}</span>
      <button
        type="button"
        class="account-switcher__icon-button"
        :aria-label="$t('topbar.account_switcher.refresh')"
        @click="accountStore.refresh()"
      >
        <div :class="loading ? 'i-svg-spinners:ring-resize' : 'i-mingcute:refresh-2-line'" />
      </button>
    </div>

    <div v-if="accounts.length > 0" class="account-switcher__list">
      <div
        v-for="account in accounts"
        :key="account.id"
        class="account-row"
        :class="{ 'account-row--current': account.isCurrent }"
        :title="displayName(account)"
        @click="handleSwitch(account)"
      >
        <img
          v-if="faceUrl(account) && !brokenFaceIds.has(account.id)"
          class="account-row__avatar"
          :src="faceUrl(account)"
          :alt="displayName(account)"
          loading="lazy"
          @error="markFaceBroken(account.id)"
        >
        <div v-else class="account-row__avatar account-row__avatar--placeholder" i-solar:user-circle-bold-duotone />

        <div class="account-row__info">
          <div class="account-row__name">
            {{ displayName(account) }}
          </div>
          <div class="account-row__meta">
            @{{ account.mid }}
            <span v-if="account.expired" class="account-row__expired">
              · {{ $t('topbar.account_switcher.expired') }}
            </span>
          </div>
        </div>

        <div v-if="account.isCurrent" class="account-row__badge">
          {{ $t('topbar.account_switcher.current') }}
        </div>
        <div v-else-if="busyId === account.id" class="account-row__spinner" i-svg-spinners:ring-resize />

        <button
          type="button"
          class="account-switcher__icon-button"
          :aria-label="$t('topbar.account_switcher.manage')"
          @click="openMenu($event, account)"
        >
          <div i-mingcute:more-2-line />
        </button>
      </div>
    </div>

    <div v-else class="account-switcher__empty">
      {{ $t('topbar.account_switcher.empty') }}
    </div>

    <div class="account-switcher__actions">
      <button type="button" class="account-switcher__action" @click="handleAddByLogin">
        <div i-mingcute:add-line />
        {{ $t('topbar.account_switcher.add_account') }}
      </button>
      <button type="button" class="account-switcher__action" @click="accountStore.openDialog('cookie')">
        <div i-mingcute:clipboard-line />
        {{ $t('topbar.account_switcher.add_by_cookie') }}
      </button>
    </div>

    <div v-if="loginPending" class="account-switcher__pending">
      <span>{{ $t('topbar.account_switcher.login_pending') }}</span>
      <button type="button" class="account-switcher__pending-cancel" @click="accountStore.cancelLogin()">
        {{ $t('topbar.account_switcher.cancel_login') }}
      </button>
    </div>

    <p v-if="errorMessage" class="account-switcher__error">
      {{ errorMessage }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.account-switcher {
  margin: var(--bew-space-2);
  padding-top: var(--bew-space-2);
  border-top: 1px solid var(--bew-border-color);
}

.account-switcher__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
}

.account-switcher__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--bew-space-1);
}

.account-row {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: 40px;
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-menu-item-radius);
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: var(--bew-fill-1);
  }
}

.account-row--current {
  cursor: default;
  background: var(--bew-fill-1);
}

.account-row__avatar {
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 50%;
  object-fit: cover;
}

.account-row__avatar--placeholder {
  color: var(--bew-text-3);
  font-size: 28px;
  line-height: 1;
}

.account-row__info {
  min-width: 0;
  flex: 1;
}

.account-row__name {
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-row__meta {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}

.account-row__expired {
  color: var(--bew-error-color);
}

.account-row__badge {
  flex: none;
  padding: 0 var(--bew-space-1);
  border-radius: var(--bew-radius-full, 999px);
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10, rgb(0 161 214 / 10%));
  font-size: var(--bew-font-size-caption);
}

.account-row__spinner {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--bew-text-3);
}

.account-switcher__icon-button {
  display: flex;
  width: 24px;
  height: 24px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--bew-radius-sm, 4px);
  color: var(--bew-text-3);
  background: transparent;
  cursor: pointer;
  appearance: none;
  transition:
    background-color 0.2s,
    color 0.2s;

  &:hover {
    color: var(--bew-theme-color);
    background: var(--bew-fill-2);
  }
}

.account-switcher__empty {
  padding: var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-control);
}

.account-switcher__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
  margin-top: var(--bew-space-1);
}

.account-switcher__action {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  min-width: 120px;
  padding: var(--bew-space-1) var(--bew-space-2);
  border: 1px dashed var(--bew-border-color);
  border-radius: var(--bew-menu-item-radius);
  color: var(--bew-text-2);
  background: transparent;
  font-size: var(--bew-font-size-caption);
  cursor: pointer;
  appearance: none;
  transition:
    background-color 0.2s,
    color 0.2s;

  &:hover {
    color: var(--bew-theme-color);
    background: var(--bew-fill-1);
  }
}

.account-switcher__pending {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-1);
  padding: var(--bew-space-1) var(--bew-space-2);
  border-radius: var(--bew-menu-item-radius);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-caption);
}

.account-switcher__pending-cancel {
  flex: none;
  padding: 0;
  border: 0;
  color: var(--bew-error-color);
  background: transparent;
  font-size: var(--bew-font-size-caption);
  cursor: pointer;
  appearance: none;

  &:hover {
    text-decoration: underline;
  }
}

.account-switcher__error {
  margin-top: var(--bew-space-1);
  padding: 0 var(--bew-space-2);
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-control);
}
</style>
