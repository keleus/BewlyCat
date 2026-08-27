<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import type { VideoCardContextMenuKey } from '~/logic/storage'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import api from '~/utils/api'
import { cleanBilibiliUrl, getCSRF, openLinkToNewTab } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'

import type { Video } from '../types'
import BlockUserConfirmDialog from './components/BlockUserConfirmDialog.vue'
import DislikeDialog from './components/DislikeDialog.vue'
import FollowUserConfirmDialog from './components/FollowUserConfirmDialog.vue'
import UnfollowUserConfirmDialog from './components/UnfollowUserConfirmDialog.vue'

const props = withDefaults(defineProps<{
  video: Video
  contextMenuStyles: CSSProperties
  isFollowingPage?: boolean
  triggerElement?: HTMLElement | null
}>(), {
  isFollowingPage: false,
})
const emit = defineEmits<{
  (event: 'removed', selectedOpt?: { reasonId?: number, feedbackId?: number }): void
  (event: 'close'): void
  (event: 'reopen'): void
}>()

// styles 带 bottom（无 top）即向上展开，缩放原点随之翻转到锚点下缘
const opensUpward = computed(() => props.contextMenuStyles.bottom !== undefined && props.contextMenuStyles.top === undefined)

// 添加滚动相关的变量和方法
const menuListRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)
const activeMenuIndex = ref(0)
let shouldRestoreFocus = true

function getMenuItems() {
  return Array.from(menuListRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
}

function focusMenuItem(index: number) {
  const items = getMenuItems()
  if (!items.length)
    return

  activeMenuIndex.value = (index + items.length) % items.length
  items.forEach((item, itemIndex) => item.tabIndex = itemIndex === activeMenuIndex.value ? 0 : -1)
  items[activeMenuIndex.value].focus({ preventScroll: true })
}

function setActiveMenuItem(event: FocusEvent) {
  const index = getMenuItems().indexOf(event.currentTarget as HTMLButtonElement)
  if (index >= 0)
    activeMenuIndex.value = index
}

function handleMenuKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      focusMenuItem(activeMenuIndex.value + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      focusMenuItem(activeMenuIndex.value - 1)
      break
    case 'Home':
      event.preventDefault()
      focusMenuItem(0)
      break
    case 'End':
      event.preventDefault()
      focusMenuItem(getMenuItems().length - 1)
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      handleClose()
      break
    case 'Tab':
      shouldRestoreFocus = false
      handleClose()
      break
  }
}

// 处理滚动事件，更新箭头显示状态
function handleScroll() {
  if (!menuListRef.value)
    return

  const { scrollTop, scrollHeight, clientHeight } = menuListRef.value
  canScrollUp.value = scrollTop > 0
  canScrollDown.value = scrollTop < scrollHeight - clientHeight - 5 // 5px 容差
}

// 滚动到顶部
function scrollToTop() {
  if (!menuListRef.value)
    return
  menuListRef.value.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

// 滚动到底部
function scrollToBottom() {
  if (!menuListRef.value)
    return
  menuListRef.value.scrollTo({
    top: menuListRef.value.scrollHeight,
    behavior: 'smooth',
  })
}

const getVideoType = inject<() => string>('getVideoType')!

const { t } = useI18n()
const videoOptions = computed(() => [
  { id: 1, key: 'notInterested' as const, name: t('video_card.operation.not_interested') },
  { id: 2, key: 'notInterestedUploader' as const, name: t('video_card.operation.not_interested_uploader') },
].filter(option => isOptionVisible(option.key)))
const showContextMenu = ref<boolean>(false)
const showDislikeDialog = ref<boolean>(false)
const showBlockUserDialog = ref<boolean>(false)
const showFollowUserDialog = ref<boolean>(false)
const showUnfollowUserDialog = ref<boolean>(false)
const showPipWindow = ref<boolean>(false)
const loadingWebDislike = ref<boolean>(false)
const { openIframeDrawer } = useBewlyApp()

enum VideoOption {
  OpenInNewTab,
  OpenInBackground,
  OpenInCurrentTab,
  OpenInNewWindow,
  OpenInDrawer,

  ViewTheOriginalCover,
  ViewThisUserChannel,

  CopyVideoLink,
  CopyCleanVideoLink,
  CopyBVNumber,
  CopyAVNumber,

  FollowUser,
  UnfollowUser,
  BlockUser,
}

interface OptionItem { command: VideoOption, key: VideoCardContextMenuKey, name: string, icon: string, color?: string }

function isOptionVisible(key: VideoCardContextMenuKey) {
  return settings.value.videoCardContextMenuConfig.find(item => item.key === key)?.visible ?? true
}

const commonOptions = computed((): OptionItem[][] => {
  let result: OptionItem[][] = [
    [
      ...(props.video.url
        ? [
            { command: VideoOption.OpenInNewTab, key: 'openInNewTab' as const, name: t('video_card.operation.open_in_new_tab'), icon: 'i-solar:square-top-down-bold-duotone' },
            { command: VideoOption.OpenInBackground, key: 'openInBackground' as const, name: t('video_card.operation.open_in_background'), icon: 'i-solar:square-top-down-bold-duotone' },
            { command: VideoOption.OpenInNewWindow, key: 'openInNewWindow' as const, name: t('video_card.operation.open_in_new_window'), icon: 'i-solar:maximize-square-3-bold-duotone' },
            { command: VideoOption.OpenInCurrentTab, key: 'openInCurrentTab' as const, name: t('video_card.operation.open_in_current_tab'), icon: 'i-solar:square-top-down-bold-duotone' },
            { command: VideoOption.OpenInDrawer, key: 'openInDrawer' as const, name: t('video_card.operation.open_in_drawer'), icon: 'i-solar:archive-up-minimlistic-bold-duotone' },
          ]
        : []),
    ],

    [
      ...(props.video.url
        ? [{ command: VideoOption.CopyVideoLink, key: 'copyVideoLink' as const, name: t('video_card.operation.copy_video_link'), icon: 'i-solar:copy-bold-duotone' }]
        : []),
      ...(settings.value.enableCleanShareLink && props.video.url
        ? [{ command: VideoOption.CopyCleanVideoLink, key: 'copyCleanVideoLink' as const, name: t('video_card.operation.copy_clean_video_link'), icon: 'i-solar:link-minimalistic-2-bold-duotone' }]
        : []),
      ...(props.video.bvid
        ? [{ command: VideoOption.CopyBVNumber, key: 'copyBVNumber' as const, name: t('video_card.operation.copy_bv_number'), icon: 'i-solar:copy-bold-duotone' }]
        : []),
      ...(props.video.id
        ? [{ command: VideoOption.CopyAVNumber, key: 'copyAVNumber' as const, name: t('video_card.operation.copy_av_number'), icon: 'i-solar:copy-bold-duotone' }]
        : []),
    ],

    [
      ...(props.video.cover
        ? [{ command: VideoOption.ViewTheOriginalCover, key: 'viewOriginalCover' as const, name: t('video_card.operation.view_the_original_cover'), icon: 'i-solar:gallery-minimalistic-bold-duotone' }]
        : []),
    ],
  ]

  // 添加关注/取消关注选项
  // 1. 如果明确传入了 followed 状态，根据状态显示
  // 2. 如果在 Following 页面且未传入 followed，默认显示"取消关注"（因为都是已关注的UP主）
  // 3. 其他情况不显示
  const authorMid = getAuthorMid()
  const authorFollowed = Array.isArray(props.video.author)
    ? props.video.author[0]?.followed
    : props.video.author?.followed

  if (authorMid && (authorFollowed !== undefined || props.isFollowingPage)) {
    // 判断是否已关注：明确为 true，或者在 Following 页面且未明确为 false
    const isFollowed = authorFollowed === true || (props.isFollowingPage && authorFollowed !== false)

    if (isFollowed) {
      result.push([
        { command: VideoOption.UnfollowUser, key: 'followUser', name: t('video_card.operation.unfollow_user'), icon: 'i-solar:user-minus-bold-duotone', color: 'text-orange-500' },
      ])
    }
    else {
      result.push([
        { command: VideoOption.FollowUser, key: 'followUser', name: t('video_card.operation.follow_user'), icon: 'i-solar:user-plus-bold-duotone', color: 'text-blue-500' },
      ])
    }
  }

  // 添加拉黑用户选项；缺少作者 mid 时隐藏，避免点击后发出无效请求。
  if (authorMid) {
    result.push([
      { command: VideoOption.BlockUser, key: 'blockUser', name: t('video_card.operation.block_user'), icon: 'i-solar:user-block-bold-duotone', color: 'text-red-500' },
    ])
  }

  if (getVideoType() === 'bangumi' || getVideoType() === 'live') {
    result = result.map((group) => {
      return group.filter((opt) => {
        return opt.command !== VideoOption.CopyBVNumber && opt.command !== VideoOption.CopyAVNumber && opt.command !== VideoOption.CopyCleanVideoLink && opt.command !== VideoOption.ViewThisUserChannel
      })
    })
  }
  return result.map(group => group.filter(option => isOptionVisible(option.key))).filter(group => group.length > 0)
})

// 在菜单显示后检查是否需要显示滚动指示器
watch(() => showContextMenu.value, (newVal) => {
  if (newVal) {
    nextTick(() => {
      handleScroll()
      focusMenuItem(0)
    })
  }
})

// 监听菜单列表尺寸变化，确保滚动指示器状态正确
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  showContextMenu.value = true
  window.addEventListener('resize', handleViewportResize)
  window.visualViewport?.addEventListener('resize', handleViewportResize)
  nextTick(() => {
    handleScroll()

    // 监听菜单列表的尺寸变化
    if (menuListRef.value) {
      resizeObserver = new ResizeObserver(() => {
        handleScroll()
      })
      resizeObserver.observe(menuListRef.value)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleViewportResize)
  window.visualViewport?.removeEventListener('resize', handleViewportResize)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (shouldRestoreFocus && props.triggerElement?.isConnected)
    props.triggerElement.focus({ preventScroll: true })
})

// Fixed menu coordinates are calculated from the viewport at open time. Close
// when its dimensions change so an upward menu cannot drift from its trigger.
function handleViewportResize() {
  emit('close')
}

function getAuthorMid() {
  if (!props.video.author)
    return undefined

  return Array.isArray(props.video.author)
    ? props.video.author[0]?.mid
    : props.video.author.mid
}

async function submitWebDislike(command: number) {
  const csrf = getCSRF()
  const authorMid = getAuthorMid()

  if (!csrf || !props.video.id || !authorMid)
    return

  if (loadingWebDislike.value)
    return

  loadingWebDislike.value = true

  try {
    const response = await api.video.webDislikeVideo({
      goto: props.video.goto || 'av',
      id: props.video.id,
      mid: authorMid,
      track_id: props.video.trackId || '',
      reason_id: command,
      csrf,
    })

    if (response.code !== 0)
      console.warn('Web dislike request failed:', response.message)
  }
  catch (error) {
    console.warn('Web dislike request error:', error)
  }
  finally {
    loadingWebDislike.value = false
  }
}

function handleMoreCommand(command: number) {
  handleRemoved()
  void submitWebDislike(command)
}

function handleAppMoreCommand(command: ThreePointV2Type) {
  switch (command) {
    case ThreePointV2Type.Feedback:
      break
    case ThreePointV2Type.Dislike:
      openAppDislikeDialog()
      break
  }
}

function handleCommonCommand(command: VideoOption) {
  switch (command) {
    case VideoOption.OpenInNewTab:
      openLinkToNewTab(props.video.url!)
      handleClose()
      break
    case VideoOption.OpenInBackground:
      openLinkInBackground(props.video.url!)
      handleClose()
      break
    case VideoOption.OpenInNewWindow:
      showPipWindow.value = true
      break
    case VideoOption.OpenInCurrentTab:
      window.open(props.video.url, '_self')
      handleClose()
      break
    case VideoOption.OpenInDrawer:
      openIframeDrawer(props.video.url || '')
      handleClose()
      break

    case VideoOption.CopyVideoLink:
      navigator.clipboard.writeText(
        settings.value.enableCleanShareLink && settings.value.cleanShareLinkRemoveTrackingParams
          ? cleanBilibiliUrl(props.video.url!)
          : props.video.url!,
      )
      handleClose()
      break
    case VideoOption.CopyCleanVideoLink: {
      const cleanUrl = cleanBilibiliUrl(props.video.url!)
      const text = settings.value.cleanShareLinkIncludeTitle && props.video.title
        ? `${props.video.title} ${cleanUrl}`
        : cleanUrl
      navigator.clipboard.writeText(text)
      handleClose()
      break
    }
    case VideoOption.CopyBVNumber:
      navigator.clipboard.writeText(props.video.bvid!)
      handleClose()
      break
    case VideoOption.CopyAVNumber:
      navigator.clipboard.writeText(`av${props.video.id.toString()}`)
      handleClose()
      break

    case VideoOption.ViewTheOriginalCover:
      window.open(props.video.cover, '_blank')
      handleClose()
      break

    case VideoOption.FollowUser:
      openFollowUserConfirmDialog()
      break
    case VideoOption.UnfollowUser:
      openUnfollowUserConfirmDialog()
      break
    case VideoOption.BlockUser:
      openBlockUserConfirmDialog()
      break
  }
}

function openAppDislikeDialog() {
  showDislikeDialog.value = true
  showContextMenu.value = false
}

function openFollowUserConfirmDialog() {
  showFollowUserDialog.value = true
  showContextMenu.value = false
}

function openUnfollowUserConfirmDialog() {
  showUnfollowUserDialog.value = true
  showContextMenu.value = false
}

function openBlockUserConfirmDialog() {
  showBlockUserDialog.value = true
  showContextMenu.value = false
}

function handleClose() {
  showContextMenu.value = false
  showPipWindow.value = false
  emit('close')
}

function handleReopen() {
  // showContextMenu.value = false
  // showPipWindow.value = false
  // console.log('reopen')
  // emit('reopen')
  handleClose()
}

function handleRemoved(selectedOpt?: { reasonId?: number, feedbackId?: number }) {
  emit('removed', selectedOpt)
  handleClose()
}

async function blockUser() {
  const authorMid = getAuthorMid()

  if (!authorMid) {
    console.error('No author mid available')
    return
  }

  try {
    const response = await api.user.relationModify({
      fid: authorMid.toString(),
      act: 5, // 5表示拉黑用户
      re_src: 11,
      csrf: getCSRF(),
    })

    if (response.code === 0) {
      // 拉黑成功
      handleRemoved()
    }
    else {
      console.error('Block user failed:', response.message)
    }
  }
  catch (error) {
    console.error('Block user error:', error)
  }
}

async function followUser() {
  const authorMid = getAuthorMid()

  if (!authorMid) {
    console.error('No author mid available')
    return
  }

  try {
    const response = await api.user.relationModify({
      fid: authorMid.toString(),
      act: 1, // 1表示关注用户
      re_src: 11,
      csrf: getCSRF(),
    })

    if (response.code === 0) {
      // 关注成功
      handleClose()
    }
    else {
      console.error('Follow user failed:', response.message)
    }
  }
  catch (error) {
    console.error('Follow user error:', error)
  }
}

async function unfollowUser() {
  const authorMid = getAuthorMid()

  if (!authorMid) {
    console.error('No author mid available')
    return
  }

  try {
    const response = await api.user.relationModify({
      fid: authorMid.toString(),
      act: 2, // 2表示取消关注用户
      re_src: 11,
      csrf: getCSRF(),
    })

    if (response.code === 0) {
      // 取消关注成功
      handleClose()
    }
    else {
      console.error('Unfollow user failed:', response.message)
    }
  }
  catch (error) {
    console.error('Unfollow user error:', error)
  }
}
</script>

<template>
  <div>
    <!-- more popup -->
    <Transition name="context-menu" appear>
      <div
        v-if="showContextMenu"
        style="backdrop-filter: var(--b-context-menu-glass, var(--bew-filter-glass-1));"
        :style="contextMenuStyles"
        class="context-menu-container bew-popover-surface"
        :class="opensUpward && 'context-menu-container--up'"
      >
        <button
          v-show="canScrollUp"
          type="button"
          class="scroll-indicator scroll-indicator-top"
          :aria-label="t('video_card.operation.scroll_top')"
          @click="scrollToTop"
        >
          <i class="i-mingcute:up-line" aria-hidden="true" />
        </button>

        <ul
          ref="menuListRef"
          flex="~ col gap-1"
          class="context-menu-list"
          role="menu"
          aria-orientation="vertical"
          @scroll="handleScroll"
          @keydown="handleMenuKeydown"
        >
          <!-- 现有内容不变 -->
          <template v-if="getVideoType() === 'appRcmd'">
            <template v-for="option in video.threePointV2" :key="option.type">
              <li
                v-if="option.type !== ThreePointV2Type.WatchLater
                  && option.type !== ThreePointV2Type.Feedback
                  && (option.type !== ThreePointV2Type.Dislike || isOptionVisible('notInterested'))"
                role="none"
              >
                <button
                  type="button"
                  role="menuitem"
                  tabindex="-1"
                  class="context-menu-item"
                  @focus="setActiveMenuItem"
                  @click="handleAppMoreCommand(option.type)"
                >
                  <i class="item-icon" i-solar:confounded-circle-bold-duotone />
                  <span v-if="option.type === ThreePointV2Type.Dislike">{{ $t('video_card.operation.not_interested') }}</span>
                  <span v-else>{{ option.title }}</span>
                </button>
              </li>
            </template>
          </template>
          <template v-else-if="getVideoType() === 'rcmd'">
            <li
              v-for="option in videoOptions" :key="option.id"
              role="none"
            >
              <button
                type="button" role="menuitem" tabindex="-1" class="context-menu-item" @focus="setActiveMenuItem"
                @click="handleMoreCommand(option.id)"
              >
                <i class="item-icon" i-solar:confounded-circle-bold-duotone />
                {{ option.name }}
              </button>
            </li>
          </template>

          <div v-if="getVideoType() === 'rcmd' && videoOptions.length > 0 && commonOptions.length > 0" class="divider" />

          <template v-for="(optionGroup, index) in commonOptions" :key="index">
            <li
              v-for="option in optionGroup"
              :key="option.command"
              role="none"
            >
              <button
                type="button" role="menuitem" tabindex="-1" class="context-menu-item" :class="option.color"
                @focus="setActiveMenuItem" @click="handleCommonCommand(option.command)"
              >
                <i class="item-icon" :class="[option.icon, option.color]" />
                {{ option.name }}
              </button>
            </li>

            <div v-if="index !== commonOptions.length - 1" class="divider" />
          </template>
        </ul>

        <button
          v-show="canScrollDown"
          type="button"
          class="scroll-indicator scroll-indicator-bottom"
          :aria-label="t('video_card.operation.scroll_bottom')"
          @click="scrollToBottom"
        >
          <i class="i-mingcute:down-line" aria-hidden="true" />
        </button>
      </div>
    </Transition>

    <!-- mask -->
    <Transition name="fade">
      <div
        v-if="showContextMenu"
        pos="fixed top-0 left-0" w-full h-full
        style="z-index: 9998;"
        @click="handleClose"
        @click.right.prevent.stop="handleReopen"
      />
    </Transition>

    <DislikeDialog
      v-if="showDislikeDialog"
      v-model="showDislikeDialog"
      :video="video"
      @close="handleClose"
      @removed="handleRemoved"
    />

    <FollowUserConfirmDialog
      v-if="showFollowUserDialog"
      v-model="showFollowUserDialog"
      :video="video"
      @close="handleClose"
      @confirm="followUser"
    />

    <UnfollowUserConfirmDialog
      v-if="showUnfollowUserDialog"
      v-model="showUnfollowUserDialog"
      :video="video"
      @close="handleClose"
      @confirm="unfollowUser"
    />

    <BlockUserConfirmDialog
      v-if="showBlockUserDialog"
      v-model="showBlockUserDialog"
      :video="video"
      @close="handleClose"
      @confirm="blockUser"
    />

    <PipWindow
      v-if="showPipWindow"
      :url="video.url"
      @close="handleClose"
    />
  </div>
</template>

<style lang="scss" scoped>
// Chromium 在 opacity/transform 动画期间会丢弃 backdrop-filter（crbug.com/40877283），
// 故玻璃与缩放同步插值到恒等滤镜，避免动画结束才出现毛玻璃
.context-menu-enter-active,
.context-menu-leave-active {
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard),
    backdrop-filter var(--bew-duration-fast) var(--bew-ease-standard);
}

.context-menu-enter-from,
.context-menu-leave-to {
  --b-context-menu-glass: blur(0px) saturate(100%);

  opacity: 0;
  transform: scale(0.9);
}

.context-menu-item {
  --uno: "hover:bg-$bew-fill-2 rounded-$bew-menu-item-radius cursor-pointer";
  --uno: "flex items-center transition-colors duration-200 ease-$bew-ease-standard";

  width: 100%;
  min-height: 32px;
  padding: var(--bew-space-2) var(--bew-space-3) var(--bew-space-2) var(--bew-space-2);
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
}

.item-icon {
  --uno: "inline-block color-$bew-text-color-2";

  margin-right: var(--bew-space-3);
}

.divider {
  --uno: "w-full h-1px bg-$bew-border-color";

  margin: var(--bew-space-1) 0;
}

.context-menu-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(240px, calc(100vw - var(--bew-space-4)));
  padding: var(--bew-popover-padding);
  transform-origin: top right; // 菜单右缘对齐按钮右缘，右上角即按钮位置
  max-height: min(480px, calc(100vh - var(--bew-space-4))); // 与 floatingMenu.ts 的 preferredMaxHeight 同步
  overflow: hidden;
  z-index: 9999;
}

.context-menu-container--up {
  transform-origin: bottom right;
}

.context-menu-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0;
  list-style: none;

  > li {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* 完全隐藏滚动条 */
  -ms-overflow-style: none; /* IE 和 Edge */
  scrollbar-width: none; /* Firefox */

  /* 隐藏 Webkit 浏览器的滚动条 */
  &::-webkit-scrollbar {
    display: none;
  }
}

.scroll-indicator {
  position: absolute;
  left: 50%;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--bew-space-6);
  height: var(--bew-space-4);
  padding: 0;
  border: none;
  color: var(--bew-text-color-2);
  background: transparent;
  transform: translateX(-50%);
  cursor: pointer;

  i {
    width: var(--bew-icon-size-sm);
    height: var(--bew-icon-size-sm);
  }

  &:hover {
    color: var(--bew-text-color-1);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
    outline-offset: -2px;
  }

  &-top {
    top: 0;
  }

  &-bottom {
    bottom: 0;
  }
}
</style>
