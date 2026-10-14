<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Dialog from '~/components/Dialog.vue'
import { settings } from '~/logic'
import { useUserRelationStore } from '~/stores/userRelationStore'
import api from '~/utils/api'
import { getCSRF, getUserID, openLinkToNewTab } from '~/utils/main'

import type { Video } from '../VideoCard/types'
import FollowUserConfirmDialog from '../VideoCard/VideoCardContextMenu/components/FollowUserConfirmDialog.vue'
import UnfollowUserConfirmDialog from '../VideoCard/VideoCardContextMenu/components/UnfollowUserConfirmDialog.vue'
import type { ContextMenuPanelItem } from '../VideoCard/VideoCardContextMenu/ContextMenuPanel.vue'
import ContextMenuPanel from '../VideoCard/VideoCardContextMenu/ContextMenuPanel.vue'
import VideoCardContextMenu from '../VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue'
import MomentReportDialog from './MomentReportDialog.vue'
import type { DisplayMoment } from './types'

const props = defineProps<{
  moment: DisplayMoment
  /** 视频动态沿用视频卡片菜单，动态操作追加在其后 */
  video: Video | null
  menuStyles: CSSProperties
  triggerElement?: HTMLElement | null
}>()
const emit = defineEmits<{
  close: []
  removed: []
}>()

type MomentDialog = 'delete' | 'report' | 'follow' | 'unfollow'

const { t } = useI18n()
const toast = useToast()
const userRelationStore = useUserRelationStore()
const activeDialog = ref<MomentDialog | null>(null)
const deleteDialogRef = ref<InstanceType<typeof Dialog> | null>(null)
const deleting = ref(false)
let removed = false

const authorMid = computed(() => Number(props.moment.author.mid) || undefined)
const isOwnMoment = computed(() => Boolean(authorMid.value && authorMid.value === userRelationStore.accountMid))
// 旧缓存没有三点菜单字段，按作者是否为当前账号推断，与 Web 端的展示一致。
const canDelete = computed(() => props.moment.canDelete ?? isOwnMoment.value)
const canReport = computed(() => props.moment.canReport ?? Boolean(userRelationStore.accountMid && !isOwnMoment.value))
const dialogAuthor = computed(() => ({
  author: { name: props.moment.author.name, authorFace: props.moment.author.face, mid: authorMid.value },
}))

function openDialog(dialog: MomentDialog) {
  activeDialog.value = dialog
}

function isFollowOptionVisible() {
  return settings.value.videoCardContextMenuConfig.find(item => item.key === 'followUser')?.visible ?? true
}

// 视频动态的打开、复制与关注选项由视频卡片菜单提供，这里只补充非视频动态所需的部分。
const baseGroups = computed((): ContextMenuPanelItem[][] => {
  if (props.video)
    return []

  const groups: ContextMenuPanelItem[][] = [[
    {
      key: 'open',
      name: t('video_card.operation.open_in_new_tab'),
      icon: 'i-solar:square-top-down-bold-duotone',
      select: () => {
        openLinkToNewTab(props.moment.url)
        emit('close')
      },
    },
    {
      key: 'copy',
      name: t('moment_card.copy_link'),
      icon: 'i-solar:copy-bold-duotone',
      select: () => {
        void navigator.clipboard.writeText(props.moment.url)
        emit('close')
      },
    },
  ]]

  const following = userRelationStore.getFollowing(authorMid.value)
  if (authorMid.value && userRelationStore.accountMid && !isOwnMoment.value && following !== undefined && isFollowOptionVisible()) {
    groups.push([following
      ? { key: 'unfollow', name: t('video_card.operation.unfollow_user'), icon: 'i-solar:user-minus-bold-duotone', color: 'text-orange-500', select: () => openDialog('unfollow') }
      : { key: 'follow', name: t('video_card.operation.follow_user'), icon: 'i-solar:user-plus-bold-duotone', color: 'text-blue-500', select: () => openDialog('follow') }])
  }
  return groups
})

const momentGroups = computed((): ContextMenuPanelItem[][] => [[
  ...(canReport.value
    ? [{ key: 'report', name: t('moment_card.report'), icon: 'i-solar:danger-triangle-bold-duotone', select: () => openDialog('report') }]
    : []),
  ...(canDelete.value
    ? [{ key: 'delete', name: t('moment_card.delete'), icon: 'i-solar:trash-bin-trash-bold-duotone', color: 'text-red-500', select: () => openDialog('delete') }]
    : []),
]])

async function setFollowing(follow: boolean) {
  const mid = authorMid.value
  const accountMid = userRelationStore.accountMid
  if (!mid)
    return
  try {
    const response = await api.user.relationModify({
      fid: String(mid),
      act: follow ? 1 : 2, // 1：关注，2：取消关注
      re_src: 11,
      csrf: getCSRF(),
    })
    if (response?.code !== 0)
      throw new Error(response?.message)
    userRelationStore.setFollowing(mid, follow, accountMid)
  }
  catch (error) {
    console.error(follow ? 'Follow user failed:' : 'Unfollow user failed:', error)
  }
}

async function deleteMoment() {
  if (deleting.value)
    return
  const csrf = getCSRF()
  if (!csrf || !getUserID()) {
    toast.warning(t('common.please_log_in_first'))
    return
  }

  deleting.value = true
  try {
    const response = await api.moment.removeMoment({
      dyn_id_str: props.moment.id,
      extra: props.moment.deleteParams ?? {},
      csrf,
    })
    if (response?.code !== 0)
      throw new Error(response?.message || t('moment_card.delete_failed'))
    toast.success(t('moment_card.delete_success'))
    removed = true
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('moment_card.delete_failed'))
  }
  finally {
    deleting.value = false
  }
  // Dialog 在 loading 期间拒绝关闭，等 loading 回传后再关闭；移除卡片放到对话框离场之后。
  if (removed) {
    await nextTick()
    deleteDialogRef.value?.close()
  }
}

function handleDialogClose() {
  if (removed)
    emit('removed')
  emit('close')
}
</script>

<template>
  <VideoCardContextMenu
    v-if="video && !activeDialog"
    :video="video"
    :context-menu-styles="menuStyles"
    :trigger-element="triggerElement"
    :extra-groups="momentGroups"
    hide-block-user
    @close="emit('close')"
    @removed="emit('close')"
  />
  <ContextMenuPanel
    v-else-if="!video"
    :show="!activeDialog"
    :groups="[...baseGroups, ...momentGroups]"
    :menu-styles="menuStyles"
    :trigger-element="triggerElement"
    @close="emit('close')"
  />

  <Dialog
    v-if="activeDialog === 'delete'"
    ref="deleteDialogRef"
    :title="t('moment_card.delete_title')"
    width="420px"
    max-width="calc(100vw - 16px)"
    append-to-bewly-body
    :loading="deleting"
    :close-on-confirm="false"
    @close="handleDialogClose"
    @confirm="deleteMoment"
  >
    <p text="$bew-text-1">
      {{ t('moment_card.delete_confirm') }}
    </p>
  </Dialog>
  <MomentReportDialog
    v-else-if="activeDialog === 'report'"
    :moment-id="moment.id"
    :author-mid="moment.author.mid"
    @close="handleDialogClose"
  />
  <FollowUserConfirmDialog
    v-else-if="activeDialog === 'follow'"
    :model-value="true"
    :video="dialogAuthor"
    @close="handleDialogClose"
    @confirm="setFollowing(true)"
  />
  <UnfollowUserConfirmDialog
    v-else-if="activeDialog === 'unfollow'"
    :model-value="true"
    :video="dialogAuthor"
    @close="handleDialogClose"
    @confirm="setFollowing(false)"
  />
</template>
