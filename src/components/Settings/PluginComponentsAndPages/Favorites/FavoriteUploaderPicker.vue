<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import type { FavoriteOrganizerConditionValue } from '~/logic/storage'
import api from '~/utils/api'

interface UserSearchCandidate {
  mid: string
  name: string
  face: string
  sign: string
}

const modelValue = defineModel<FavoriteOrganizerConditionValue[]>({ required: true })

const { t } = useI18n()
const rootRef = ref<HTMLElement>()
const query = ref('')
const loading = ref(false)
const error = ref('')
const candidates = ref<UserSearchCandidate[]>([])

function httpsUrl(url = '') {
  return url.replace(/^http:/, 'https:')
}

function avatarUrl(url = '') {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  return normalized ? `${normalized}@64w_64h_1c.webp` : ''
}

function stripSearchHighlight(value: unknown) {
  return String(value || '').replace(/<[^>]+>/g, '').trim()
}

function selectCandidate(candidate: UserSearchCandidate) {
  if (!isCandidateSelected(candidate.mid)) {
    modelValue.value = [
      ...modelValue.value,
      { value: candidate.mid, label: candidate.name },
    ]
  }
  query.value = ''
  candidates.value = []
  error.value = ''
}

function removeUploader(index: number) {
  modelValue.value = modelValue.value.filter((_, itemIndex) => itemIndex !== index)
}

function isCandidateSelected(mid: string) {
  return modelValue.value.some(item => item.value === mid)
}

async function searchUploader() {
  const keyword = query.value.trim()
  if (!keyword || loading.value)
    return

  loading.value = true
  candidates.value = []
  error.value = ''
  try {
    if (/^\d+$/.test(keyword)) {
      const mid = keyword.replace(/^0+/, '')
      const response = await api.user.getUserCard({ mid })
      const card = response.code === 0 ? response.data?.card : null
      if (!card?.mid || !card?.name) {
        error.value = response.message || t('settings.favorite_organizer_uploader_not_found')
        return
      }
      candidates.value = [{
        mid: String(card.mid),
        name: card.name,
        face: httpsUrl(card.face || ''),
        sign: stripSearchHighlight(card.sign),
      }]
      return
    }

    const response = await api.search.searchUser({
      keyword,
      page: 1,
      pagesize: 8,
      order: '',
      order_sort: 0,
      user_type: 0,
    })
    const results = response.code === 0 && Array.isArray(response.data?.result)
      ? response.data.result
      : []
    candidates.value = results.slice(0, 8).map((user: any) => ({
      mid: String(user.mid || ''),
      name: stripSearchHighlight(user.uname),
      face: httpsUrl(user.upic || user.face || ''),
      sign: stripSearchHighlight(user.usign || user.sign),
    })).filter((user: UserSearchCandidate) => user.mid && user.name)

    if (!candidates.value.length)
      error.value = t('settings.favorite_organizer_uploader_not_found')
  }
  catch {
    error.value = t('settings.favorite_organizer_uploader_search_failed')
  }
  finally {
    loading.value = false
  }
}

useEventListener(document, 'pointerdown', (event) => {
  if (!rootRef.value?.contains(event.target as Node)) {
    candidates.value = []
    error.value = ''
  }
})
</script>

<template>
  <div ref="rootRef" class="uploader-picker">
    <div v-if="modelValue.length" class="uploader-picker__selected-list">
      <span
        v-for="(item, index) in modelValue"
        :key="`${item.value}-${index}`"
        class="uploader-picker__selected-item"
        :title="`UID ${item.value}`"
      >
        <span>{{ item.label || `UID ${item.value}` }}</span>
        <button
          type="button"
          :aria-label="$t('settings.favorite_organizer_remove_value', { value: item.label || item.value })"
          @click="removeUploader(index)"
        >
          <i i-mingcute:close-line />
        </button>
      </span>
    </div>

    <form class="uploader-picker__form" @submit.prevent="searchUploader">
      <Input
        v-model="query"
        :placeholder="$t('settings.favorite_organizer_condition_uploader_placeholder')"
        class="uploader-picker__input"
      />
      <Button
        type="secondary"
        class="uploader-picker__search"
        :disabled="loading || !query.trim()"
        :aria-label="$t('settings.favorite_organizer_search_uploader')"
        :title="$t('settings.favorite_organizer_search_uploader')"
      >
        <i v-if="loading" i-svg-spinners:ring-resize />
        <i v-else i-mingcute:search-2-line />
      </Button>
    </form>

    <div v-if="candidates.length || error" class="uploader-picker__popover bew-popover-surface">
      <p v-if="error" class="uploader-picker__error">
        <i i-mingcute:warning-line />
        {{ error }}
      </p>
      <button
        v-for="candidate in candidates"
        :key="candidate.mid"
        type="button"
        class="uploader-picker__candidate"
        :class="{ 'is-selected': isCandidateSelected(candidate.mid) }"
        :disabled="isCandidateSelected(candidate.mid)"
        @click="selectCandidate(candidate)"
      >
        <img :src="avatarUrl(candidate.face)" :alt="candidate.name">
        <span>
          <strong>{{ candidate.name }}</strong>
          <small>{{ candidate.sign || `UID ${candidate.mid}` }}</small>
        </span>
        <em>{{ $t(isCandidateSelected(candidate.mid)
          ? 'settings.favorite_organizer_uploader_selected'
          : 'settings.favorite_organizer_select_uploader') }}</em>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.uploader-picker {
  position: relative;
  display: grid;
  width: 320px;
  max-width: 100%;
  gap: var(--bew-space-2);
}

.uploader-picker__selected-list {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
}

.uploader-picker__selected-item {
  display: inline-flex;
  min-width: 0;
  min-height: 28px;
  align-items: center;
  gap: var(--bew-space-1);
  padding-left: var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
}

.uploader-picker__selected-item > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uploader-picker__selected-item > button {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  appearance: none;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--bew-badge-radius);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
}

.uploader-picker__selected-item > button:hover,
.uploader-picker__selected-item > button:focus-visible {
  color: var(--bew-error-color);
  background: var(--bew-fill-3);
}

.uploader-picker__selected-item > button:focus-visible {
  outline: 2px solid var(--bew-theme-color-40);
  outline-offset: var(--bew-space-0-5);
}

.uploader-picker__form {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.uploader-picker__input {
  min-width: 0;
  flex: 1;
}

.uploader-picker__search {
  --b-button-width: var(--bew-control-height);
  --b-button-padding: 0px;

  flex: 0 0 var(--bew-control-height);
  justify-content: center;
}

.uploader-picker__popover {
  position: absolute;
  z-index: 20;
  top: calc(100% + var(--bew-space-2));
  left: 0;
  display: grid;
  width: 100%;
  max-height: 280px;
  gap: var(--bew-space-1);
  padding: var(--bew-space-2);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.uploader-picker__candidate {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.uploader-picker__candidate:hover,
.uploader-picker__candidate:focus-visible {
  background: var(--bew-fill-2);
}

.uploader-picker__candidate.is-selected {
  opacity: 0.64;
  cursor: default;
}

.uploader-picker__candidate:focus-visible {
  outline: 2px solid var(--bew-theme-color-40);
  outline-offset: var(--bew-space-0-5);
}

.uploader-picker__candidate img {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 50%;
  object-fit: cover;
}

.uploader-picker__candidate > span {
  display: grid;
  min-width: 0;
  flex: 1;
}

.uploader-picker__candidate strong,
.uploader-picker__candidate small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uploader-picker__candidate strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.uploader-picker__candidate small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.uploader-picker__candidate em {
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-caption);
  font-style: normal;
  line-height: var(--bew-line-height-caption);
}

.uploader-picker__error {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin: 0;
  padding: var(--bew-space-2);
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
</style>
