<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import ContextMenu from '~/components/ContextMenu.vue'
import Dialog from '~/components/Dialog.vue'
import api from '~/utils/api'
import type { FollowingGroup } from '~/utils/followingGroups'
import { getCSRF } from '~/utils/main'

type GroupAction = 'create' | 'rename' | 'delete'
const emit = defineEmits<{
  (event: 'created', group: FollowingGroup): void
  (event: 'renamed', id: number, name: string): void
  (event: 'deleted', id: number): void
}>()
const { t } = useI18n()
const target = ref<{ id: number; name: string }>()
const menuVisible = ref(false)
const cursorPosition = ref({ x: 0, y: 0 })
const action = ref<GroupAction>()
const groupName = ref('')
const errorMessage = ref('')
const busy = ref(false)
const dialogRef = ref<InstanceType<typeof Dialog>>()
const nameInputRef = ref<HTMLInputElement>()
let disposed = false

const options = computed<ContextMenuOption[]>(() => [
  { value: 'create', label: t('home.following_create_group'), icon: 'i-mingcute:folder-add-line' },
  ...(target.value && target.value.id > 0
    ? [
        { value: 'rename', label: t('home.following_rename_group'), icon: 'i-mingcute:edit-line' },
        {
          value: 'delete',
          label: t('home.following_delete_group'),
          icon: 'i-mingcute:delete-line',
          danger: true,
        },
      ]
    : []),
])

function open(event: MouseEvent, id: number, name: string) {
  if (busy.value || action.value) return
  target.value = { id, name }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  cursorPosition.value =
    event.clientX || event.clientY
      ? { x: event.clientX, y: event.clientY }
      : { x: rect.left, y: rect.bottom }
  menuVisible.value = true
}

function selectAction(value: string | number) {
  if (busy.value || action.value || !['create', 'rename', 'delete'].includes(String(value))) return
  if (value !== 'create' && (!target.value || target.value.id <= 0)) return
  errorMessage.value = ''
  groupName.value = value === 'rename' ? target.value!.name : ''
  action.value = value as GroupAction
  if (value !== 'delete') void nextTick(() => nameInputRef.value?.focus({ preventScroll: true }))
}

async function confirmAction() {
  const operation = action.value
  const group = target.value
  if (!operation || busy.value || disposed) return
  if (operation !== 'create' && (!group || group.id <= 0)) return
  const name = groupName.value.trim()
  if (operation !== 'delete' && (!name || Array.from(name).length > 16)) {
    errorMessage.value = t('home.following_group_name_invalid')
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    const csrf = getCSRF()
    if (!csrf) throw new Error(t('common.please_log_in_first'))
    const response =
      operation === 'create'
        ? await api.user.createFollowingGroup({ tag: name, csrf })
        : operation === 'rename'
          ? await api.user.renameFollowingGroup({ tagid: String(group!.id), name, csrf })
          : await api.user.deleteFollowingGroup({ tagid: String(group!.id), csrf })
    if (response.code !== 0) throw new Error(response.message || String(response.code))
    if (disposed) return
    if (operation === 'create') {
      const id = Number(response.data?.tagid)
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error(t('common.load_failed'))
      emit('created', { tagid: id, name, count: 0, tip: '' })
    } else if (operation === 'rename') {
      emit('renamed', group!.id, name)
    } else {
      emit('deleted', group!.id)
    }
    busy.value = false
    // 等 loading prop 更新后，交给 Dialog 的退出动画完成卸载。
    await nextTick()
    dialogRef.value?.close()
  } catch (error) {
    if (!disposed)
      errorMessage.value = t('home.following_action_failed', {
        message: error instanceof Error ? error.message : t('common.load_failed'),
      })
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
})
defineExpose({ open, create: () => selectAction('create') })
</script>

<template>
  <ContextMenu
    v-if="menuVisible"
    :options="options"
    :menu-styles="{}"
    :cursor-position="cursorPosition"
    @select="selectAction"
    @close="menuVisible = false"
  />
  <Dialog
    v-if="action"
    ref="dialogRef"
    :title="$t(`home.following_${action}_group`)"
    width="420px"
    append-to-bewly-body
    :close-on-confirm="false"
    :loading="busy"
    @confirm="confirmAction"
    @close="action = undefined"
  >
    <div class="group-form" :aria-busy="busy">
      <p v-if="action === 'delete'">
        {{ $t('home.following_delete_group_confirm', { name: target?.name }) }}
      </p>
      <label v-else class="group-form">
        <span>{{ $t('home.following_group_name_label') }}</span>
        <input
          ref="nameInputRef"
          v-model="groupName"
          type="text"
          :disabled="busy"
          :aria-invalid="Boolean(errorMessage)"
          @input="errorMessage = ''"
          @keydown.enter.stop="!$event.isComposing && confirmAction()"
        />
      </label>
      <p v-if="errorMessage" role="alert">
        {{ errorMessage }}
      </p>
      <p v-if="busy" role="status">
        {{ $t('common.loading') }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.group-form {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);

  input {
    width: 100%;
    min-height: var(--bew-control-height);
    padding: var(--bew-space-2) var(--bew-space-3);
    border: 1px solid var(--bew-border-color);
    border-radius: var(--bew-interactive-radius);
    background: var(--bew-fill-1);
    color: var(--bew-text-1);

    &:hover:not(:disabled) {
      background: var(--bew-fill-2);
    }

    &:disabled {
      opacity: 0.5;
    }
  }
}
</style>
