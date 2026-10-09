<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import type { Video } from '~/components/VideoCard/types'
import type { FavoritesCategoryResult, List as FavoriteFolder } from '~/models/video/favoriteCategory'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

const props = defineProps<{ video: Video }>()
const emit = defineEmits<{ (event: 'close'): void }>()
const { t } = useI18n()
const toast = useToast()
const topBarStore = useTopBarStore()
const dialog = ref<InstanceType<typeof Dialog>>()
const folders = ref<FavoriteFolder[]>([])
const selectedIds = ref<number[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const loaded = ref(false)
const errorMessage = ref('')
const accountId = getUserID()
let aid = 0
let disposed = false

onBeforeUnmount(() => {
  disposed = true
})

onMounted(loadFolders)

function checkAccount() {
  if (!accountId || getUserID() !== accountId || !getCSRF())
    throw new Error(t('common.please_log_in_first'))
}

async function loadFolders() {
  if (isLoading.value || isSaving.value || disposed)
    return

  isLoading.value = true
  loaded.value = false
  errorMessage.value = ''
  try {
    checkAccount()
    // 有 BV 号但没有明确 aid 时查询稿件，避免把其他种类卡片的 id 当成 avid。
    aid = Number(props.video.aid || (!props.video.bvid ? props.video.id : 0))
    if (!aid && props.video.bvid) {
      const result = await api.video.getVideoInfo({ bvid: props.video.bvid })
      if (result.code !== 0)
        throw new Error(result.message || t('common.load_failed'))
      aid = Number(result.data?.aid)
    }
    if (!Number.isSafeInteger(aid) || aid <= 0)
      throw new Error(t('common.load_failed'))
    if (disposed)
      return

    checkAccount()
    const result: FavoritesCategoryResult = await api.favorite.getFavoriteCategories({
      up_mid: accountId,
      type: 2,
      rid: aid,
    })
    if (disposed)
      return
    checkAccount()
    if (result.code !== 0 || !result.data)
      throw new Error(result.message || t('common.load_failed'))

    folders.value = result.data.list ?? []
    selectedIds.value = folders.value.filter(folder => folder.fav_state === 1).map(folder => folder.id)
    loaded.value = true
  }
  catch (error) {
    if (!disposed)
      errorMessage.value = error instanceof Error ? error.message : t('common.load_failed')
  }
  finally {
    isLoading.value = false
  }
}

async function save() {
  if (!loaded.value || !folders.value.length || isLoading.value || isSaving.value || disposed)
    return

  isSaving.value = true
  errorMessage.value = ''
  let saved = false
  try {
    checkAccount()
    const selected = new Set(selectedIds.value)
    const added = folders.value.filter(folder => selected.has(folder.id) && folder.fav_state !== 1)
    const removed = folders.value.filter(folder => !selected.has(folder.id) && folder.fav_state === 1)
    if (added.length || removed.length) {
      const result = await api.favorite.updateVideoFavorites({
        rid: aid,
        add_media_ids: added.map(folder => folder.id).join(','),
        del_media_ids: removed.map(folder => folder.id).join(','),
        csrf: getCSRF(),
      })
      if (result.code !== 0)
        throw new Error(result.message || t('video_card.favorite_dialog.save_failed'))

      if (getUserID() === accountId) {
        void topBarStore.notifyFavoritesChanged().catch((error) => {
          console.error('通知顶栏收藏状态变化失败:', error)
        })
      }
      if (!disposed)
        toast.success(t('video_card.favorite_dialog.saved'))
    }
    saved = true
  }
  catch (error) {
    if (!disposed)
      errorMessage.value = error instanceof Error ? error.message : t('video_card.favorite_dialog.save_failed')
  }
  finally {
    isSaving.value = false
  }
  // 等待 Dialog 的离场动画结束后再让父组件卸载菜单。
  if (saved && !disposed)
    dialog.value?.close()
}
</script>

<template>
  <Dialog
    ref="dialog"
    :title="t('video_card.operation.favorite')"
    width="440px"
    max-width="calc(100vw - 16px)"
    content-max-height="calc(100dvh - 120px)"
    :show-footer="false"
    :close-on-confirm="false"
    :loading="isSaving"
    append-to-bewly-body
    @close="emit('close')"
    @confirm="save"
  >
    <div class="favorite-video-dialog">
      <p class="favorite-video-dialog__title">
        {{ video.title }}
      </p>
      <p>{{ t('video_card.favorite_dialog.hint') }}</p>
      <p v-if="isLoading" role="status">
        {{ t('common.loading') }}
      </p>
      <p v-if="errorMessage" role="alert">
        {{ errorMessage }}
      </p>
      <Button v-if="!isLoading && (!loaded || !folders.length)" type="secondary" @click="loadFolders">
        {{ t('common.operation.refresh') }}
      </Button>
      <template v-if="loaded">
        <p v-if="!folders.length">
          {{ t('video_card.favorite_dialog.empty') }}
        </p>
        <div v-else class="favorite-video-dialog__folders">
          <label v-for="folder in folders" :key="folder.id" class="favorite-video-dialog__folder">
            <input v-model="selectedIds" type="checkbox" :value="folder.id" :disabled="isSaving">
            <span class="favorite-video-dialog__folder-name">{{ folder.title }}</span>
            <span class="favorite-video-dialog__count">{{ folder.media_count }}</span>
          </label>
        </div>
      </template>
      <div class="favorite-video-dialog__actions">
        <Button type="tertiary" :disabled="isSaving" @click="dialog?.close()">
          {{ t('common.operation.cancel') }}
        </Button>
        <Button type="primary" :disabled="!loaded || isLoading || isSaving || !folders.length" @click="save">
          {{ t('common.operation.confirm') }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.favorite-video-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);

  p {
    margin: 0;
  }
}

.favorite-video-dialog__title {
  overflow-wrap: anywhere;
  font-weight: var(--bew-font-weight-semibold);
}

.favorite-video-dialog__folders {
  max-height: min(320px, 40dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.favorite-video-dialog__folder {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  cursor: pointer;

  &:hover {
    background: var(--bew-fill-1);
  }
  &:active {
    background: var(--bew-fill-2);
  }
  &:has(input:checked) {
    color: var(--bew-theme-color);
  }
  &:has(input:disabled) {
    cursor: not-allowed;
    opacity: 0.5;
  }

  input {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    margin: 0;
    accent-color: var(--bew-theme-color);
    cursor: inherit;
  }
}

.favorite-video-dialog__folder-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.favorite-video-dialog__count {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.favorite-video-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--bew-space-2);
}
</style>
