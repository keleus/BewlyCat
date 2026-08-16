<script setup lang="ts">
import { useWindowFocus } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import browser from 'webextension-polyfill'

import ALink from '~/components/ALink.vue'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { getUserID, isInIframe, removeHttpFromUrl } from '~/utils/main'
import { isComponentVisible, shouldShowBadge, shouldShowDotBadge, shouldShowNumberBadge } from '~/utils/topBarBadge'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import { MESSAGE_URL } from '../constants/urls'
import FavoritesPop from './pops/FavoritesPop.vue'
import HistoryPop from './pops/HistoryPop.vue'
import MomentsPop from './pops/MomentsPop.vue'
import MorePop from './pops/MorePop.vue'
import NotificationsPop from './pops/NotificationsPop.vue'
import UploadPop from './pops/UploadPop.vue'
import UserPanelPop from './pops/UserPanelPop.vue'
import WatchLaterPop from './pops/WatchLaterPop.vue'
import TopBarItemEditor from './TopBarItemEditor.vue'

const emit = defineEmits(['notificationsClick'])

const topBarStore = useTopBarStore()
// 使用 store 中的必要状态
const {
  isLogin,
  userInfo,
  unReadMessage,
  unReadDm,
  newMomentsCount,
  watchLaterCount,
  drawerVisible,
  popupVisible,
  unReadMessageCount,
  hasBCoinToReceive,
} = storeToRefs(topBarStore)

const { invalidateUnreadMessageState, syncMomentsState, syncSharedData, syncUnreadMessageState } = topBarStore

function refreshUnreadMessageSharedState() {
  syncUnreadMessageState().catch((error) => {
    console.error('同步未读消息共享状态失败:', error)
  })
}

// 将 DOM 引用移到组件内部
const avatarImg = ref<HTMLElement | null>(null)
const avatarShadow = ref<HTMLElement | null>(null)

const {
  handleClickTopBarItem,
  setupTopBarItemHoverEvent,
  setupTopBarItemTransformer,
  getTopBarItemHref,
  forceWhiteIcon,
} = useTopBarInteraction()
const { isLayoutEditing } = useLayoutEditMode()

const mid = computed(() => userInfo.value.mid || getUserID())

interface EditableTopBarComponent {
  key: string
  supportsBadge: boolean
}

const editableTopBarComponents: EditableTopBarComponent[] = [
  { key: 'moments', supportsBadge: true },
  { key: 'favorites', supportsBadge: true },
  { key: 'history', supportsBadge: true },
  { key: 'watchLater', supportsBadge: true },
  { key: 'creatorCenter', supportsBadge: false },
  { key: 'upload', supportsBadge: false },
  { key: 'notifications', supportsBadge: true },
  { key: 'pinnedChannels', supportsBadge: false },
  { key: 'avatar', supportsBadge: false },
]

function ensureTopBarComponentsConfig() {
  const currentConfig = settings.value.topBarComponentsConfig
  if (!Array.isArray(currentConfig)) {
    settings.value.topBarComponentsConfig = editableTopBarComponents.map(component => ({
      key: component.key,
      visible: true,
      badgeType: component.supportsBadge ? 'number' as const : 'none' as const,
    }))
    return
  }

  const missingConfig = editableTopBarComponents
    .filter(component => !currentConfig.some(config => config.key === component.key))
    .map(component => ({
      key: component.key,
      visible: true,
      badgeType: component.supportsBadge ? 'number' as const : 'none' as const,
    }))

  if (missingConfig.length)
    settings.value.topBarComponentsConfig = [...currentConfig, ...missingConfig]
}

watch(
  () => settings.value.topBarComponentsConfig?.map(config => config.key).join('|'),
  ensureTopBarComponentsConfig,
  { immediate: true },
)

// Initialise hover handlers for every top-bar item up front. Visibility is
// reactive in the template, so an item hidden at first render must still have
// a handler when it is enabled from the layout editor later.
const moments = setupTopBarItemHoverEvent('moments')
const favorites = setupTopBarItemHoverEvent('favorites')
const history = setupTopBarItemHoverEvent('history')
const watchLater = setupTopBarItemHoverEvent('watchLater')
const upload = setupTopBarItemHoverEvent('upload')
const notifications = setupTopBarItemHoverEvent('notifications')
const more = setupTopBarItemHoverEvent('more')
const avatar = setupTopBarItemHoverEvent('userPanel')

function handleTopBarItemClick(event: MouseEvent, key: string) {
  if (isLayoutEditing.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  handleClickTopBarItem(event, key)
}

function handleNotificationsLinkClick(event: MouseEvent) {
  if (isLayoutEditing.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (drawerVisible.value)
    drawerVisible.value.notifications = true
}

watch(isLayoutEditing, (editing) => {
  if (editing)
    topBarStore.closeAllPopups()
})

watch(popupVisible, () => {
  if (isLayoutEditing.value)
    topBarStore.closeAllPopups()
}, { deep: true })

const avatarPopRef = ref()
const notificationsPopRef = ref()
const momentsPopRef = ref()
const favoritesPopRef = ref()
const historyPopRef = ref()
const watchLaterPopRef = ref()
const uploadPopRef = ref()
const morePopRef = ref()

// 在 setup 同步初始化，使内部 watch 随组件卸载自动停止。
setupTopBarItemTransformer('userPanel', avatarPopRef)
setupTopBarItemTransformer('notifications', notificationsPopRef)
setupTopBarItemTransformer('moments', momentsPopRef)
setupTopBarItemTransformer('favorites', favoritesPopRef)
setupTopBarItemTransformer('history', historyPopRef)
setupTopBarItemTransformer('watchLater', watchLaterPopRef)
setupTopBarItemTransformer('upload', uploadPopRef)
setupTopBarItemTransformer('more', morePopRef)

// Keep notification state in sync even when the item starts hidden and is
// enabled later from the layout editor.
watch(
  () => popupVisible.value?.notifications ?? false,
  (newVal, oldVal) => {
    if (newVal === undefined || oldVal === undefined)
      return

    if (oldVal !== undefined && MESSAGE_URL.test(location.href))
      return

    if (newVal === oldVal)
      return

    if (!newVal)
      refreshUnreadMessageSharedState()
  },
  { immediate: true },
)

watch(
  () => drawerVisible.value?.notifications ?? false,
  (newVal, oldVal) => {
    if (newVal === oldVal)
      return

    if (!newVal)
      refreshUnreadMessageSharedState()
  },
)

const focused = useWindowFocus()
watch(() => focused.value, (newVal, _) => {
  if (!isLogin.value)
    return

  if (!newVal) {
    if (MESSAGE_URL.test(location.href) && !isInIframe())
      refreshUnreadMessageSharedState()
    return
  }

  syncSharedData().catch((error) => {
    console.error('同步顶栏共享状态失败:', error)
  })

  nextTick(() => {
    favoritesPopRef.value?.refreshFavoriteData?.()
  })
})

watch(
  () => popupVisible.value?.moments ?? false,
  async (newVal, oldVal) => {
    if (newVal === undefined || oldVal === undefined)
      return

    if (newVal === oldVal)
      return

    // 弹窗关闭时更新
    if (isLogin.value) {
      if (!newVal) {
        await syncMomentsState('video')
      }
      else {
        nextTick(() => {
          if (momentsPopRef.value)
            momentsPopRef.value.initData?.()
        })
      }
    }
  },
)

watch(
  () => popupVisible.value?.favorites ?? false,
  (newVal, oldVal) => {
    if (newVal === undefined || oldVal === undefined)
      return

    if (newVal === oldVal)
      return

    if (newVal) {
      nextTick(() => {
        if (favoritesPopRef.value)
          favoritesPopRef.value.refreshFavoriteData?.()
      })
    }
  },
  { immediate: true },
)

// 修改通知点击处理
function handleNotificationsClick(item: { name: string, url: string, unreadCount: number, icon: string }) {
  invalidateUnreadMessageState().catch((error) => {
    console.error('标记未读消息缓存失效失败:', error)
  })
  emit('notificationsClick', item)
}

// 判断分割线是否应该显示：左右两组至少各有一个可见时才显示
const shouldShowDivider = computed(() => {
  if (isLayoutEditing.value)
    return true

  const leftSideVisible = isComponentVisible('moments')
    || isComponentVisible('favorites')
    || isComponentVisible('history')
    || isComponentVisible('watchLater')
    || isComponentVisible('creatorCenter')

  const rightSideVisible = isComponentVisible('upload')
    || isComponentVisible('notifications')

  return leftSideVisible && rightSideVisible
})
</script>

<template>
  <div
    class="right-side"
    flex="inline xl:1 justify-end items-center"
  >
    <div
      class="others"
      flex="~ items-center gap-1" px-5px
      text="$bew-text-1"
      :style="{ height: 'var(--bew-control-height)' }"
    >
      <div
        v-if="!isLogin"
        class="right-side-item"
        important-w-auto
      >
        <a
          href="https://passport.bilibili.com/login"
          class="login"
          @click="(event: MouseEvent) => handleTopBarItemClick(event, 'login')"
        >
          <div i-solar:user-circle-bold-duotone class="text-xl mr-2" />{{
            $t('topbar.sign_in')
          }}
        </a>
      </div>
      <template v-if="isLogin || isLayoutEditing">
        <div
          class="hidden lg:flex"
          :class="{ 'top-bar-editing-group': isLayoutEditing }"
          gap-1
        >
          <!-- Moments -->
          <div
            v-if="isLayoutEditing || isComponentVisible('moments')"
            ref="moments"
            class="right-side-item"
            :class="{ active: popupVisible?.moments }"
            @click="(event: MouseEvent) => handleTopBarItemClick(event, 'moments')"
          >
            <TopBarItemEditor
              component-key="moments"
              :title="$t('topbar.moments')"
            >
              <template v-if="newMomentsCount > 0 && shouldShowBadge('moments')">
                <div
                  v-if="shouldShowNumberBadge('moments')"
                  class="unread-num-dot"
                >
                  {{ newMomentsCount > 99 ? '99+' : newMomentsCount }}
                </div>
                <div
                  v-else-if="shouldShowDotBadge('moments')"
                  class="unread-dot"
                />
              </template>
              <ALink
                :class="{ 'white-icon': forceWhiteIcon }"
                :href="getTopBarItemHref('moments', 'https://t.bilibili.com')"
                :title="$t('topbar.moments')"
                type="topBar"
                :custom-click-event="isLayoutEditing || (!settings.touchScreenOptimization && settings.openTopBarItemsInBewly)"
                @click="(event: MouseEvent) => handleTopBarItemClick(event, 'moments')"
              >
                <div i-tabler:windmill />
              </ALink>

              <Transition name="slide-in">
                <MomentsPop
                  v-if="!isLayoutEditing"
                  v-show="popupVisible?.moments"
                  ref="momentsPopRef"
                  class="bew-popover"
                  @click.stop="() => {}"
                />
              </Transition>
            </TopBarItemEditor>
          </div>

          <!-- Favorites -->
          <div
            v-if="isLayoutEditing || isComponentVisible('favorites')"
            ref="favorites"
            class="right-side-item"
            :class="{ active: popupVisible?.favorites }"
            @click="(event: MouseEvent) => handleTopBarItemClick(event, 'favorites')"
          >
            <TopBarItemEditor
              component-key="favorites"
              :title="$t('topbar.favorites')"
            >
              <ALink
                :class="{ 'white-icon': forceWhiteIcon }"
                :href="getTopBarItemHref('favorites', `https://space.bilibili.com/${mid}/favlist`)"
                :title="$t('topbar.favorites')"
                type="topBar"
                :custom-click-event="isLayoutEditing || (!settings.touchScreenOptimization && settings.openTopBarItemsInBewly)"
                @click="(event: MouseEvent) => handleTopBarItemClick(event, 'favorites')"
              >
                <div i-mingcute:star-line />
              </ALink>

              <Transition name="slide-in">
                <KeepAlive>
                  <FavoritesPop
                    v-if="!isLayoutEditing && popupVisible?.favorites"
                    ref="favoritesPopRef"
                    class="bew-popover"
                    @click.stop="() => {}"
                  />
                </KeepAlive>
              </Transition>
            </TopBarItemEditor>
          </div>

          <!-- History -->
          <div
            v-if="isLayoutEditing || isComponentVisible('history')"
            ref="history"
            class="right-side-item"
            :class="{ active: popupVisible?.history }"
            @click="(event: MouseEvent) => handleTopBarItemClick(event, 'history')"
          >
            <TopBarItemEditor
              component-key="history"
              :title="$t('topbar.history')"
            >
              <ALink
                :class="{ 'white-icon': forceWhiteIcon }"
                :href="getTopBarItemHref('history', 'https://www.bilibili.com/history')"
                :title="$t('topbar.history')"
                type="topBar"
                :custom-click-event="isLayoutEditing || (!settings.touchScreenOptimization && settings.openTopBarItemsInBewly)"
                @click="(event: MouseEvent) => handleTopBarItemClick(event, 'history')"
              >
                <div i-mingcute:time-line />
              </ALink>

              <Transition name="slide-in">
                <HistoryPop
                  v-if="!isLayoutEditing && popupVisible?.history"
                  ref="historyPopRef"
                  class="bew-popover"
                  @click.stop="() => {}"
                />
              </Transition>
            </TopBarItemEditor>
          </div>

          <!-- Watch later -->
          <div
            v-if="isLayoutEditing || isComponentVisible('watchLater')"
            ref="watchLater"
            class="right-side-item"
            :class="{ active: popupVisible?.watchLater }"
            @click="(event: MouseEvent) => handleTopBarItemClick(event, 'watchLater')"
          >
            <TopBarItemEditor
              component-key="watchLater"
              :title="$t('topbar.watch_later')"
            >
              <template v-if="watchLaterCount > 0 && shouldShowBadge('watchLater')">
                <div
                  v-if="shouldShowNumberBadge('watchLater')"
                  class="unread-num-dot"
                >
                  {{ watchLaterCount > 99 ? '99+' : watchLaterCount }}
                </div>
                <div
                  v-else-if="shouldShowDotBadge('watchLater')"
                  class="unread-dot"
                />
              </template>
              <ALink
                :class="{ 'white-icon': forceWhiteIcon }"
                :href="getTopBarItemHref('watchLater', 'https://www.bilibili.com/watchlater/list')"
                :title="$t('topbar.watch_later')"
                type="topBar"
                :custom-click-event="isLayoutEditing || (!settings.touchScreenOptimization && settings.openTopBarItemsInBewly)"
                @click="(event: MouseEvent) => handleTopBarItemClick(event, 'watchLater')"
              >
                <div i-mingcute:carplay-line />
              </ALink>

              <Transition name="slide-in">
                <WatchLaterPop
                  v-if="!isLayoutEditing && popupVisible?.watchLater"
                  ref="watchLaterPopRef"
                  class="bew-popover"
                  @click.stop="() => {}"
                />
              </Transition>
            </TopBarItemEditor>
          </div>

          <!-- Creative center -->
          <div
            v-if="isLayoutEditing || isComponentVisible('creatorCenter')"
            class="right-side-item"
            @click="(event: MouseEvent) => handleTopBarItemClick(event, 'creatorCenter')"
          >
            <TopBarItemEditor
              component-key="creatorCenter"
              :title="$t('topbar.creative_center')"
            >
              <a
                :class="{ 'white-icon': forceWhiteIcon }"
                href="https://member.bilibili.com/platform/home"
                target="_blank"
                :title="$t('topbar.creative_center')"
                @click="(event: MouseEvent) => handleTopBarItemClick(event, 'creatorCenter')"
              >
                <div i-mingcute:bulb-line />
              </a>
            </TopBarItemEditor>
          </div>
        </div>

        <!-- More -->
        <div
          ref="more"
          class="right-side-item lg:!hidden flex"
          :class="{ active: popupVisible?.more }"
          data-layout-edit-target="topbar-more"
          data-layout-settings-menu="BewlyComponents"
          data-layout-settings-page="topbar"
          data-layout-settings-title-key="settings.topbar_actions"
          @click="(event: MouseEvent) => handleClickTopBarItem(event, 'more')"
        >
          <a
            :class="{ 'white-icon': forceWhiteIcon }"
            title="More"
          >
            <div i-mingcute:menu-line />
          </a>

          <Transition name="slide-in">
            <MorePop
              v-show="popupVisible?.more"
              ref="morePopRef"
              class="bew-popover"
              @click.stop="() => {}"
              @bewly-page-click="(event: MouseEvent, key: string) => handleClickTopBarItem(event, key)"
            />
          </Transition>
        </div>

        <div
          class="hidden lg:flex"
          :class="{ 'top-bar-editing-group': isLayoutEditing }"
          gap-1 items-center
        >
          <!-- Divider -->
          <div
            v-if="shouldShowDivider"
            :class="{ 'white-icon': forceWhiteIcon }"
            w-2px h-16px bg="$bew-border-color" mx-1
            rounded="$bew-radius-sm"
          />

          <!-- Upload -->
          <div
            v-if="isLayoutEditing || isComponentVisible('upload')"
            ref="upload"
            class="right-side-item"
            :class="{ active: popupVisible?.upload }"
            @click="(event: MouseEvent) => handleTopBarItemClick(event, 'upload')"
          >
            <TopBarItemEditor
              component-key="upload"
              :title="$t('topbar.upload')"
            >
              <a
                class="upload"
                :class="{ 'white-icon': forceWhiteIcon }"
                style="backdrop-filter: var(--bew-filter-glass-1);"
                href="https://member.bilibili.com/platform/upload/video/frame"
                target="_blank"
                :title="$t('topbar.upload')"
                @click="(event: MouseEvent) => handleTopBarItemClick(event, 'upload')"
              >
                <div i-mingcute:upload-line flex-shrink-0 />
              </a>

              <Transition name="slide-in">
                <UploadPop
                  v-if="!isLayoutEditing && popupVisible?.upload"
                  ref="uploadPopRef"
                  class="bew-popover"
                  @click.stop="() => {}"
                />
              </Transition>
            </TopBarItemEditor>
          </div>

          <!-- Notifications -->
          <div
            v-if="isLayoutEditing || isComponentVisible('notifications')"
            ref="notifications"
            class="right-side-item"
            :class="{ active: popupVisible?.notifications }"
            @click="(event: MouseEvent) => handleTopBarItemClick(event, 'notifications')"
          >
            <TopBarItemEditor
              component-key="notifications"
              :title="$t('topbar.notifications')"
            >
              <template v-if="unReadMessageCount > 0 && shouldShowBadge('notifications')">
                <div
                  v-if="shouldShowNumberBadge('notifications')"
                  class="unread-num-dot"
                >
                  {{ unReadMessageCount > 99 ? '99+' : unReadMessageCount }}
                </div>
                <div
                  v-else-if="shouldShowDotBadge('notifications')"
                  class="unread-dot"
                />
              </template>

              <ALink
                :href="settings.openNotificationsPageAsDrawer ? undefined : 'https://message.bilibili.com'"
                :class="{ 'white-icon': forceWhiteIcon }"
                :title="$t('topbar.notifications')"
                type="topBar"
                :custom-click-event="isLayoutEditing || settings.openNotificationsPageAsDrawer"
                @click="handleNotificationsLinkClick"
              >
                <div i-tabler:bell />
              </ALink>

              <Transition name="slide-in">
                <NotificationsPop
                  v-if="!isLayoutEditing && popupVisible?.notifications"
                  ref="notificationsPopRef"
                  class="bew-popover"
                  :un-read-message="unReadMessage"
                  :un-read-dm="unReadDm"
                  @click.stop="() => {}"
                  @item-click="handleNotificationsClick"
                />
              </Transition>
            </TopBarItemEditor>
          </div>
        </div>
      </template>

      <!-- Avatar -->

      <div
        v-if="isLayoutEditing || (isLogin && isComponentVisible('avatar'))"
        ref="avatar"
        :class="{ hover: popupVisible?.userPanel }"
        class="avatar right-side-item"
        @click="(event: MouseEvent) => handleTopBarItemClick(event, 'userPanel')"
      >
        <TopBarItemEditor
          component-key="avatar"
          :title="$t('settings.topbar_user_menu')"
        >
          <template v-if="isLogin">
            <!-- B币领取提醒dot -->
            <div
              v-if="hasBCoinToReceive && settings.showBCoinReceiveReminder"
              class="unread-dot avatar-dot"
              :class="{ hover: popupVisible?.userPanel }"
            />

            <ALink
              ref="avatarImg"
              :href="`https://space.bilibili.com/${mid}`"
              type="topBar"
              :custom-click-event="isLayoutEditing"
              class="avatar-img"
              :class="{ hover: popupVisible?.userPanel }"
              :style="{
                backgroundImage: `url(${userInfo.face ? removeHttpFromUrl(userInfo.face) : ''})`,
              }"
              @click="(event: MouseEvent) => handleTopBarItemClick(event, 'userPanel')"
            />
            <div
              ref="avatarShadow"
              class="avatar-shadow"
              :class="{ hover: popupVisible?.userPanel }"
              :style="{
                backgroundImage: `url(${userInfo.face ? removeHttpFromUrl(userInfo.face) : ''})`,
              }"
            />
            <svg
              v-if="userInfo.vip?.status === 1"
              class="vip-img"
              :class="{ hover: popupVisible?.userPanel }"
              :style="{
                opacity: popupVisible?.userPanel ? 1 : 0,
                background: `url(${browser.runtime.getURL('/assets/big-vip.svg')}) center / contain no-repeat`,
              }"
              w="28%" h="28%" z-1
              pos="absolute bottom-18px right-11px" duration-300
            />

            <Transition name="slide-in">
              <UserPanelPop
                v-if="!isLayoutEditing && popupVisible?.userPanel"
                ref="avatarPopRef"
                :user-info="userInfo"
                after:h="!0"
                class="bew-popover"
                pos="!left-auto !right-0" transform="!translate-x-0"
                @click.stop="() => {}"
              />
            </Transition>
          </template>
          <div v-else class="avatar-editing-placeholder" aria-hidden="true">
            <div i-mingcute:user-3-line />
          </div>
        </TopBarItemEditor>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";

.top-bar-editing-group {
  display: flex !important;
}

.avatar-editing-placeholder {
  display: grid;
  width: var(--bew-top-bar-primary-control-height);
  height: var(--bew-top-bar-primary-control-height);
  place-items: center;
  border: 1px dashed var(--bew-border-color);
  border-radius: 50%;
  color: var(--bew-text-2);
  opacity: 0.8;
}

.avatar-editing-placeholder > div {
  font-size: var(--bew-icon-size-md);
}
</style>
