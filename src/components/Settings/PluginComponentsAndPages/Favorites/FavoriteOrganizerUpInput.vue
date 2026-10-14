<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { FavoriteOrganizerUp } from '~/logic'
import api from '~/utils/api'

const props = defineProps<{ exclude: string[] }>()
const emit = defineEmits<{ (event: 'add', up: FavoriteOrganizerUp): void }>()

const { t } = useI18n()
const query = ref('')
const loading = ref(false)
const error = ref('')
const candidates = ref<FavoriteOrganizerUp[]>([])

function stripSearchHighlight(value: unknown) {
  // 移除高亮标签后再清掉残留尖括号，避免嵌套标签拼接出新的标签
  return String(value || '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()
}

function parseMid(input: string): string {
  const spaceMatch = input.match(/space\.bilibili\.com\/(\d+)/)
  if (spaceMatch)
    return spaceMatch[1]
  const uidMatch = input.match(/^(?:uid:?)?(\d+)$/i)
  return uidMatch ? uidMatch[1].replace(/^0+/, '') : ''
}

function addUp(up: FavoriteOrganizerUp) {
  if (props.exclude.includes(up.mid)) {
    error.value = t('settings.favorite_organizer.up_already_added')
    return
  }
  emit('add', up)
  query.value = ''
  candidates.value = []
  error.value = ''
}

async function submit() {
  const input = query.value.trim()
  if (!input || loading.value)
    return

  error.value = ''
  candidates.value = []
  loading.value = true
  try {
    const mid = parseMid(input)
    if (mid) {
      const response = await api.user.getUserCard({ mid })
      const card = response.code === 0 ? response.data?.card : null
      if (!card?.mid || !card?.name) {
        error.value = t('settings.wanted_users.not_found')
        return
      }
      addUp({ mid: String(card.mid), name: card.name })
      return
    }

    const response = await api.search.searchUser({
      keyword: input,
      page: 1,
      page_size: 10,
      order: '',
      order_sort: 0,
      user_type: 0,
    })
    const results = response.code === 0 && Array.isArray(response.data?.result) ? response.data.result : []
    candidates.value = results.slice(0, 10)
      .map((user: any) => ({ mid: String(user.mid || ''), name: stripSearchHighlight(user.uname) }))
      .filter((user: FavoriteOrganizerUp) => user.mid && user.name)
    if (!candidates.value.length)
      error.value = t('settings.wanted_users.no_results')
  }
  catch {
    error.value = t('settings.wanted_users.info_failed')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="up-input">
    <Input
      v-model="query"
      size="small"
      :placeholder="t('settings.favorite_organizer.up_placeholder')"
      :aria-label="t('settings.favorite_organizer.up')"
      @enter="submit"
    >
      <template #suffix>
        <span v-if="loading" i-svg-spinners:ring-resize />
      </template>
    </Input>
    <p v-if="error" class="up-input__error">
      {{ error }}
    </p>
    <div v-if="candidates.length" class="up-input__candidates">
      <button
        v-for="user in candidates"
        :key="user.mid"
        type="button"
        :disabled="exclude.includes(user.mid)"
        @click="addUp(user)"
      >
        {{ user.name }}
        <small>UID {{ user.mid }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.up-input {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.up-input__error {
  margin: 0;
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.up-input__candidates {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);

  button {
    display: inline-flex;
    align-items: baseline;
    gap: var(--bew-space-1);
    min-height: 26px;
    padding: 0 var(--bew-space-2);
    border: 1px solid var(--bew-border-color);
    border-radius: var(--bew-badge-radius);
    color: var(--bew-text-1);
    background: var(--bew-fill-1);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: var(--bew-theme-color);
    }

    &:disabled {
      opacity: 0.55;
      cursor: default;
    }
  }

  small {
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
  }
}
</style>
