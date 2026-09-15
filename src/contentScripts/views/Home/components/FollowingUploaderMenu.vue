<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'
import Dialog from '~/components/Dialog.vue'
import { useUserRelationStore } from '~/stores/userRelationStore'
import api from '~/utils/api'
import type { FollowingGroup, FollowingGroupsResult } from '~/utils/followingGroups'
import { getCSRF } from '~/utils/main'

interface Uploader {
  mid: number
  name: string
  groupIds: number[]
}

const emit = defineEmits<{
  (event: 'unfollowed', mid: number): void
  (event: 'groupsChanged', mid: number, groupIds: number[]): void
  (event: 'groupsLoaded', groups: FollowingGroup[]): void
}>()

const { t } = useI18n()
const toast = useToast()
const userRelationStore = useUserRelationStore()
const target = ref<Uploader>()
const cursorPosition = ref({ x: 0, y: 0 })
const menuVisible = ref(false)
const groupMenuVisible = ref(false)
const confirmVisible = ref(false)
const busy = ref(false)
const groups = ref<FollowingGroup[]>([])
let revision = 0
let disposed = false

const menuOptions = computed<ContextMenuOption[]>(() => [
  { value: 'move', label: t('home.following_move_group'), icon: 'i-mingcute:folder-line' },
  ...(target.value?.groupIds.includes(-10)
    ? [{ value: 'unspecial', label: t('home.following_remove_special'), icon: 'i-mingcute:star-line' }]
    : [{ value: 'special', label: t('home.following_add_special'), icon: 'i-mingcute:star-line' }]),
  { value: 'unfollow', label: t('video_card.operation.unfollow_user'), icon: 'i-solar:user-minus-bold-duotone', danger: true },
])

const groupOptions = computed<ContextMenuOption[]>(() => {
  const normalGroups = groups.value.filter(group => group.tagid >= 0)
  if (!normalGroups.some(group => group.tagid === 0))
    normalGroups.push({ tagid: 0, name: '', count: 0, tip: '' })
  return normalGroups.map(group => ({
    value: group.tagid,
    label: group.tagid === 0 ? t('home.following_default_group') : group.name,
    icon: 'i-mingcute:folder-line',
    checked: target.value?.groupIds.includes(group.tagid) ?? false,
  }))
})

function open(event: MouseEvent, uploader: Uploader) {
  if (busy.value || confirmVisible.value)
    return
  revision++
  // 保存右键目标，后续切换右侧视频不会改变操作对象。
  target.value = { ...uploader, groupIds: [...uploader.groupIds] }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  cursorPosition.value = event.clientX || event.clientY
    ? { x: event.clientX, y: event.clientY }
    : { x: rect.left, y: rect.bottom }
  groupMenuVisible.value = false
  menuVisible.value = true
}

async function selectAction(action: string | number) {
  if (!target.value || busy.value)
    return
  if (action === 'unfollow') {
    // 只有确认框的 confirm 事件能够发起取消关注请求。
    confirmVisible.value = true
  }
  else if (action === 'unspecial' || action === 'special') {
    await updateRelation(action)
  }
  else if (action === 'move') {
    const requestRevision = revision
    busy.value = true
    try {
      const response: FollowingGroupsResult = await api.user.getFollowingGroups()
      if (disposed || requestRevision !== revision)
        return
      if (response.code !== 0 || !Array.isArray(response.data))
        throw new Error(response.message || t('common.load_failed'))
      groups.value = response.data
      emit('groupsLoaded', response.data)
      groupMenuVisible.value = true
    }
    catch (error) {
      if (!disposed)
        toast.error(t('home.following_action_failed', { message: error instanceof Error ? error.message : t('common.load_failed') }))
    }
    finally {
      busy.value = false
    }
  }
}

async function updateRelation(action: 'unfollow' | 'unspecial' | 'special' | 'move', groupId?: number) {
  const uploader = target.value
  if (!uploader || busy.value || disposed)
    return
  const normalIds = uploader.groupIds.filter(id => id >= 0)
  if (normalIds.length === 0)
    normalIds.push(0)
  if (action === 'move' && (groupId === undefined || !groupOptions.value.some(option => option.value === groupId)))
    return
  if (action === 'move' && normalIds.length === 1 && normalIds[0] === groupId)
    return
  busy.value = true
  const accountMid = userRelationStore.accountMid
  try {
    const csrf = getCSRF()
    if (!csrf)
      throw new Error(t('common.please_log_in_first'))
    const response = action === 'unfollow'
      ? await api.user.relationModify({ fid: String(uploader.mid), act: 2, re_src: 11, csrf })
      : action === 'special'
        ? await api.user.copyFollowingUsers({ fids: String(uploader.mid), tagids: '-10', csrf })
        : await api.user.moveFollowingUsers({
            fids: String(uploader.mid),
            // 特别关注与普通分组独立：只移除本次操作涉及的原分组。
            beforeTagids: action === 'unspecial' ? '-10' : normalIds.join(','),
            afterTagids: action === 'unspecial' ? normalIds.join(',') : String(groupId),
            csrf,
          })
    if (response.code !== 0)
      throw new Error(response.message || String(response.code))
    if (action === 'unfollow')
      userRelationStore.setFollowing(uploader.mid, false, accountMid)
    if (disposed)
      return
    if (action === 'unfollow') {
      emit('unfollowed', uploader.mid)
    }
    else {
      const groupIds = action === 'unspecial'
        ? normalIds
        : action === 'special'
          ? [-10, ...normalIds]
          : [...(uploader.groupIds.includes(-10) ? [-10] : []), groupId!]
      emit('groupsChanged', uploader.mid, groupIds)
    }
    toast.success(t('home.following_action_success', { name: uploader.name }))
  }
  catch (error) {
    if (!disposed)
      toast.error(t('home.following_action_failed', { message: error instanceof Error ? error.message : t('common.load_failed') }))
  }
  finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
  revision++
})

defineExpose({ open })
</script>

<template>
  <ContextMenu
    v-if="menuVisible"
    :options="menuOptions"
    :menu-styles="{}"
    :cursor-position="cursorPosition"
    @select="selectAction"
    @close="menuVisible = false"
  />
  <ContextMenu
    v-if="groupMenuVisible"
    :options="groupOptions"
    :menu-styles="{}"
    :cursor-position="cursorPosition"
    @select="value => updateRelation('move', Number(value))"
    @close="groupMenuVisible = false"
  />
  <Dialog
    v-if="confirmVisible && target"
    :title="$t('video_card.unfollow_user_confirm.title')"
    width="420px"
    append-to-bewly-body
    @confirm="updateRelation('unfollow')"
    @close="confirmVisible = false"
  >
    <div class="unfollow-confirm-content">
      <p>{{ $t('video_card.unfollow_user_confirm.message', { name: target.name }) }}</p>
      <p class="unfollow-confirm-warning">
        {{ $t('video_card.unfollow_user_confirm.warning') }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.unfollow-confirm-content {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

.unfollow-confirm-warning {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
</style>
