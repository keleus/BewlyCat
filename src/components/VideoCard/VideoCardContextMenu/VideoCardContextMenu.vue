<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
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
}>(), {
  isFollowingPage: false,
})
const emit = defineEmits<{
  (event: 'removed', selectedOpt?: { dislikeReasonId: number }): void
  (event: 'close'): void
  (event: 'reopen'): void
}>()
// 添加滚动相关的变量和方法
const menuListRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)

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

const videoOptions = reactive<{ id: number, name: string }[]>([
  { id: 1, name: '不感兴趣' },
  { id: 2, name: '不想看此UP主' },
])

const { t } = useI18n()
const showContextMenu = ref<boolean>(false)
const showDislikeDialog = ref<boolean>(false)
const showBlockUserDialog = ref<boolean>(false)
const showFollowUserDialog = ref<boolean>(false)
const showUnfollowUserDialog = ref<boolean>(false)
const showPipWindow = ref<boolean>(false)
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

interface OptionItem { command: VideoOption, name: string, icon: string, color?: string }

const commonOptions = computed((): OptionItem[][] => {
  let result: OptionItem[][] = [
    [
      { command: VideoOption.OpenInNewTab, name: t('video_card.operation.open_in_new_tab'), icon: 'i-solar:square-top-down-bold-duotone' },
      { command: VideoOption.OpenInBackground, name: t('video_card.operation.open_in_background'), icon: 'i-solar:square-top-down-bold-duotone' },
      { command: VideoOption.OpenInNewWindow, name: t('video_card.operation.open_in_new_window'), icon: 'i-solar:maximize-square-3-bold-duotone' },
      { command: VideoOption.OpenInCurrentTab, name: t('video_card.operation.open_in_current_tab'), icon: 'i-solar:square-top-down-bold-duotone' },
      { command: VideoOption.OpenInDrawer, name: t('video_card.operation.open_in_drawer'), icon: 'i-solar:archive-up-minimlistic-bold-duotone' },
    ],

    [
      { command: VideoOption.CopyVideoLink, name: t('video_card.operation.copy_video_link'), icon: 'i-solar:copy-bold-duotone' },
      ...(settings.value.enableCleanShareLink
        ? [{ command: VideoOption.CopyCleanVideoLink, name: t('video_card.operation.copy_clean_video_link'), icon: 'i-solar:link-minimalistic-2-bold-duotone' }]
        : []),
      { command: VideoOption.CopyBVNumber, name: t('video_card.operation.copy_bv_number'), icon: 'i-solar:copy-bold-duotone' },
      { command: VideoOption.CopyAVNumber, name: t('video_card.operation.copy_av_number'), icon: 'i-solar:copy-bold-duotone' },
    ],

    [
      { command: VideoOption.ViewTheOriginalCover, name: t('video_card.operation.view_the_original_cover'), icon: 'i-solar:gallery-minimalistic-bold-duotone' },
    ],
  ]

  // 添加关注/取消关注选项
  // 1. 如果明确传入了 followed 状态，根据状态显示
  // 2. 如果在 Following 页面且未传入 followed，默认显示"取消关注"（因为都是已关注的UP主）
  // 3. 其他情况不显示
  const authorFollowed = Array.isArray(props.video.author)
    ? props.video.author[0]?.followed
    : props.video.author?.followed

  if (authorFollowed !== undefined || props.isFollowingPage) {
    // 判断是否已关注：明确为 true，或者在 Following 页面且未明确为 false
    const isFollowed = authorFollowed === true || (props.isFollowingPage && authorFollowed !== false)

    if (isFollowed) {
      result.push([
        { command: VideoOption.UnfollowUser, name: t('video_card.operation.unfollow_user'), icon: 'i-solar:user-minus-bold-duotone', color: 'text-orange-500' },
      ])
    }
    else {
      result.push([
        { command: VideoOption.FollowUser, name: t('video_card.operation.follow_user'), icon: 'i-solar:user-plus-bold-duotone', color: 'text-blue-500' },
      ])
    }
  }

  // 添加拉黑用户选项
  result.push([
    { command: VideoOption.BlockUser, name: t('video_card.operation.block_user'), icon: 'i-solar:user-block-bold-duotone', color: 'text-red-500' },
  ])

  if (getVideoType() === 'bangumi' || getVideoType() === 'live') {
    result = result.map((group) => {
      return group.filter((opt) => {
        return opt.command !== VideoOption.CopyBVNumber && opt.command !== VideoOption.CopyAVNumber && opt.command !== VideoOption.CopyCleanVideoLink && opt.command !== VideoOption.ViewThisUserChannel
      })
    })
  }
  return result
})

// 在菜单显示后检查是否需要显示滚动指示器
watch(() => showContextMenu.value, (newVal) => {
  if (newVal) {
    nextTick(() => {
      handleScroll()
    })
  }
})

// 监听菜单列表尺寸变化，确保滚动指示器状态正确
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  showContextMenu.value = true
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
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

function handleMoreCommand(_command: number) {
  handleRemoved()
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

function handleRemoved(selectedOpt?: { dislikeReasonId: number }) {
  emit('removed', selectedOpt)
  handleClose()
}

async function blockUser() {
  if (!props.video.author) {
    console.error('No author information available')
    return
  }

  const authorMid = Array.isArray(props.video.author)
    ? props.video.author[0]?.mid
    : props.video.author.mid

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
  if (!props.video.author) {
    console.error('No author information available')
    return
  }

  const authorMid = Array.isArray(props.video.author)
    ? props.video.author[0]?.mid
    : props.video.author.mid

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
  if (!props.video.author) {
    console.error('No author information available')
    return
  }

  const authorMid = Array.isArray(props.video.author)
    ? props.video.author[0]?.mid
    : props.video.author.mid

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
    <div v-if="showContextMenu">
      <div
        style="backdrop-filter: var(--bew-filter-glass-1); box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);"
        :style="contextMenuStyles"
        p-1 bg="$bew-elevated" rounded="$bew-radius"
        min-w-200px m="t-4 l-[calc(-200px+1rem)]"
        border="1 $bew-border-color"
        class="context-menu-container"
      >
        <!-- 顶部滚动指示器 -->
        <div
          v-show="canScrollUp"
          class="scroll-indicator scroll-indicator-top"
          @click="scrollToTop"
        >
          <i class="i-mingcute:up-line" />
        </div>

        <ul
          ref="menuListRef"
          flex="~ col gap-1"
          class="context-menu-list"
          @scroll="handleScroll"
        >
          <!-- 现有内容不变 -->
          <template v-if="getVideoType() === 'appRcmd'">
            <template v-for="option in video.threePointV2" :key="option.type">
              <li
                v-if="option.type !== ThreePointV2Type.WatchLater && option.type !== ThreePointV2Type.Feedback"
                class="context-menu-item"
                @click="handleAppMoreCommand(option.type)"
              >
                <i class="item-icon" i-solar:confounded-circle-bold-duotone />
                <span v-if="option.type === ThreePointV2Type.Dislike">{{ $t('video_card.operation.not_interested') }}</span>
                <span v-else>{{ option.title }}</span>
              </li>
            </template>
          </template>
          <template v-else-if="getVideoType() === 'rcmd'">
            <li
              v-for="option in videoOptions" :key="option.id"
              class="context-menu-item"
              @click="handleMoreCommand(option.id)"
            >
              <i class="item-icon" i-solar:confounded-circle-bold-duotone />
              {{ option.name }}
            </li>
          </template>

          <div v-if="getVideoType() === 'rcmd'" class="divider" />

          <template v-for="(optionGroup, index) in commonOptions" :key="index">
            <li
              v-for="option in optionGroup"
              :key="option.command"
              class="context-menu-item"
              :class="option.color"
              @click="handleCommonCommand(option.command)"
            >
              <i class="item-icon" :class="[option.icon, option.color]" />
              {{ option.name }}
            </li>

            <div v-if="index !== commonOptions.length - 1" class="divider" />
          </template>
        </ul>

        <!-- 底部滚动指示器 -->
        <div
          v-show="canScrollDown"
          class="scroll-indicator scroll-indicator-bottom"
          @click="scrollToBottom"
        >
          <i class="i-mingcute:down-line" />
        </div>
      </div>
    </div>

    <!-- mask -->
    <div
      v-if="showContextMenu"
      pos="fixed top-0 left-0" w-full h-full
      style="z-index: 9998;"
      @click="handleClose"
      @click.right.prevent.stop="handleReopen"
    />

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
.context-menu-item {
  --uno: "hover:bg-$bew-fill-2 text-sm px-2.5 py-1.75 rounded-$bew-radius-half cursor-pointer";
  --uno: "flex items-center";
}

.item-icon {
  --uno: "mr-2 inline-block color-$bew-text-color-2";
}

.divider {
  --uno: "w-full h-1px px-2px bg-$bew-border-color";
}

.context-menu-container {
  max-height: 80vh;
  overflow: hidden;
  z-index: 9999;
  position: relative;
}

.context-menu-list {
  max-height: calc(80vh - 40px); // 为指示器留出空间
  overflow-y: auto;
  padding: 4px 0;

  /* 完全隐藏滚动条 */
  -ms-overflow-style: none; /* IE 和 Edge */
  scrollbar-width: none; /* Firefox */

  /* 隐藏 Webkit 浏览器的滚动条 */
  &::-webkit-scrollbar {
    display: none;
  }
}

.scroll-indicator {
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--bew-text-color-2);
  cursor: pointer;
  background: var(--bew-elevated);
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;

  &:hover {
    color: var(--bew-text-color-1);
    background: var(--bew-fill-2);
  }

  &-top {
    top: 0;
    border-top-left-radius: var(--bew-radius);
    border-top-right-radius: var(--bew-radius);
    box-shadow: 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }

  &-bottom {
    bottom: 0;
    border-bottom-left-radius: var(--bew-radius);
    border-bottom-right-radius: var(--bew-radius);
    box-shadow: 0 -4px 6px -2px rgba(0, 0, 0, 0.05);
  }
}
</style>
