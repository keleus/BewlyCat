<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useUserRelationScope } from '~/composables/useUserRelationScope'
import { settings } from '~/logic'
import type { VideoCardContextMenuKey } from '~/logic/storage'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import { useUserRelationStore } from '~/stores/userRelationStore'
import api from '~/utils/api'
import { cleanBilibiliUrl, getCSRF, getUserID, openLinkToNewTab } from '~/utils/main'
import { openLinkInBackground } from '~/utils/tabs'

import type { Video } from '../types'
import { isBangumiVideo } from '../utils'
import BlockUserConfirmDialog from './components/BlockUserConfirmDialog.vue'
import DislikeDialog from './components/DislikeDialog.vue'
import FavoriteVideoDialog from './components/FavoriteVideoDialog.vue'
import FollowUserConfirmDialog from './components/FollowUserConfirmDialog.vue'
import UnfollowUserConfirmDialog from './components/UnfollowUserConfirmDialog.vue'
import type { ContextMenuPanelItem } from './ContextMenuPanel.vue'
import ContextMenuPanel from './ContextMenuPanel.vue'

const props = withDefaults(defineProps<{
  video: Video
  contextMenuStyles: CSSProperties
  isFollowingPage?: boolean
  hideBlockUser?: boolean
  triggerElement?: HTMLElement | null
  /** 追加在视频选项之后的分组，由调用方自行处理选中后的操作。 */
  extraGroups?: ContextMenuPanelItem[][]
}>(), {
  isFollowingPage: false,
  hideBlockUser: false,
  extraGroups: () => [],
})
const emit = defineEmits<{
  (event: 'removed'): void
  (event: 'close'): void
}>()

const getVideoType = inject<() => string>('getVideoType')!

const { t } = useI18n()
const toast = useToast()
const userRelationStore = useUserRelationStore()
useUserRelationScope(() => {
  const mid = getAuthorMid()
  return mid ? [mid] : []
})
const videoOptions = computed(() => [
  { id: 1, key: 'notInterested' as const, name: t('video_card.operation.not_interested') },
  { id: 2, key: 'notInterestedUploader' as const, name: t('video_card.operation.not_interested_uploader') },
].filter(option => isOptionVisible(option.key)))
const appVideoOptions = computed(() => (props.video.threePointV2 ?? []).filter(option =>
  option.type !== ThreePointV2Type.WatchLater
  && option.type !== ThreePointV2Type.Feedback
  && (option.type !== ThreePointV2Type.Dislike || isOptionVisible('notInterested')),
))
const recommendationGroup = computed((): ContextMenuPanelItem[] => {
  if (getVideoType() === 'appRcmd') {
    return appVideoOptions.value.map(option => ({
      key: `app-${option.type}`,
      name: option.type === ThreePointV2Type.Dislike ? t('video_card.operation.not_interested') : option.title,
      icon: 'i-solar:confounded-circle-bold-duotone',
      select: () => handleAppMoreCommand(option.type),
    }))
  }
  if (getVideoType() === 'rcmd') {
    return videoOptions.value.map(option => ({
      key: `rcmd-${option.id}`,
      name: option.name,
      icon: 'i-solar:confounded-circle-bold-duotone',
      select: () => handleMoreCommand(option.id),
    }))
  }
  return []
})
const showContextMenu = ref<boolean>(true)
const showDislikeDialog = ref<boolean>(false)
const showFavoriteDialog = ref(false)
const showBlockUserDialog = ref<boolean>(false)
const showFollowUserDialog = ref<boolean>(false)
const showUnfollowUserDialog = ref<boolean>(false)
const showPipWindow = ref<boolean>(false)
const loadingWebDislike = ref<boolean>(false)
const { openIframeDrawer, openVideoDialog } = useBewlyApp()

enum VideoOption {
  OpenInNewTab,
  OpenInBackground,
  OpenInCurrentTab,
  OpenInNewWindow,
  OpenInDrawer,
  OpenInDialog,
  Favorite,

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

const canFavorite = computed(() => {
  const video = props.video
  if (getVideoType() === 'bangumi' || getVideoType() === 'live'
    || video.roomid || video.epid || video.type === 'bangumi' || video.type === 'ketang') {
    return false
  }

  return Boolean(video.bvid || video.aid || (video.id > 0 && /\/video\/av\d+/.test(video.url || '')))
})

const commonOptions = computed((): OptionItem[][] => {
  let result: OptionItem[][] = [
    canFavorite.value
      ? [{ command: VideoOption.Favorite, key: 'favorite', name: t('video_card.operation.favorite'), icon: 'i-solar:star-bold-duotone' }]
      : [],
    [
      ...(props.video.url
        ? [
            { command: VideoOption.OpenInNewTab, key: 'openInNewTab' as const, name: t('video_card.operation.open_in_new_tab'), icon: 'i-solar:square-top-down-bold-duotone' },
            { command: VideoOption.OpenInBackground, key: 'openInBackground' as const, name: t('video_card.operation.open_in_background'), icon: 'i-solar:square-top-down-bold-duotone' },
            { command: VideoOption.OpenInNewWindow, key: 'openInNewWindow' as const, name: t('video_card.operation.open_in_new_window'), icon: 'i-solar:maximize-square-3-bold-duotone' },
            { command: VideoOption.OpenInCurrentTab, key: 'openInCurrentTab' as const, name: t('video_card.operation.open_in_current_tab'), icon: 'i-solar:square-top-down-bold-duotone' },
            { command: VideoOption.OpenInDrawer, key: 'openInDrawer' as const, name: t('video_card.operation.open_in_drawer'), icon: 'i-solar:archive-up-minimlistic-bold-duotone' },
            { command: VideoOption.OpenInDialog, key: 'openInDialog' as const, name: t('video_card.operation.open_in_dialog'), icon: 'i-solar:window-frame-bold-duotone' },
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

  // 优先采用共享的查询/操作结果，未查询时沿用卡片数据与关注页语义。
  const authorMid = getAuthorMid()
  const providedFollowed = Array.isArray(props.video.author)
    ? props.video.author[0]?.followed
    : props.video.author?.followed
  const authorFollowed = userRelationStore.getFollowing(authorMid) ?? providedFollowed
  const canFollowAuthor = authorMid && userRelationStore.accountMid && authorMid !== userRelationStore.accountMid

  if (canFollowAuthor && (authorFollowed !== undefined || props.isFollowingPage)) {
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

  // 已关注的 UP 主、正在关注页、动态及缺少作者 mid 的卡片隐藏拉黑选项。
  if (authorMid && authorMid !== userRelationStore.accountMid && authorFollowed !== true && !props.isFollowingPage && !props.hideBlockUser) {
    result.push([
      { command: VideoOption.BlockUser, key: 'blockUser', name: t('video_card.operation.block_user'), icon: 'i-solar:user-block-bold-duotone', color: 'text-red-500' },
    ])
  }

  if (getVideoType() === 'bangumi' || getVideoType() === 'live' || isBangumiVideo(props.video)) {
    result = result.map((group) => {
      return group.filter((opt) => {
        return opt.command !== VideoOption.CopyBVNumber && opt.command !== VideoOption.CopyAVNumber && opt.command !== VideoOption.CopyCleanVideoLink && opt.command !== VideoOption.ViewThisUserChannel
      })
    })
  }
  return result.map(group => group.filter(option => isOptionVisible(option.key))).filter(group => group.length > 0)
})

const menuGroups = computed((): ContextMenuPanelItem[][] => [
  recommendationGroup.value,
  ...commonOptions.value.map(group => group.map(option => ({
    key: option.command,
    name: option.name,
    icon: option.icon,
    color: option.color,
    select: () => handleCommonCommand(option.command),
  }))),
  ...props.extraGroups,
])

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
    case VideoOption.Favorite:
      if (!getUserID() || !getCSRF()) {
        toast.warning(t('common.please_log_in_first'))
        handleClose()
        break
      }
      showFavoriteDialog.value = true
      showContextMenu.value = false
      break
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
    case VideoOption.OpenInDialog:
      openVideoDialog(props.video.url || '')
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

function handleRemoved() {
  emit('removed')
  handleClose()
}

async function blockUser() {
  const authorMid = getAuthorMid()
  const accountMid = userRelationStore.accountMid

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
      userRelationStore.setFollowing(authorMid, false, accountMid)
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
  const accountMid = userRelationStore.accountMid

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
      userRelationStore.setFollowing(authorMid, true, accountMid)
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
  const accountMid = userRelationStore.accountMid

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
      userRelationStore.setFollowing(authorMid, false, accountMid)
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
    <ContextMenuPanel
      :show="showContextMenu"
      :groups="menuGroups"
      :menu-styles="contextMenuStyles"
      :trigger-element="triggerElement"
      @close="handleClose"
    />

    <FavoriteVideoDialog
      v-if="showFavoriteDialog"
      :video="video"
      @close="handleClose"
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
