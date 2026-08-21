<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { MomentsWantedUser } from '~/logic/storage'
import { momentsPinnedUsers, momentsWantedUsers } from '~/logic/storage'
import api from '~/utils/api'

const props = withDefaults(defineProps<{
  mode?: 'wanted' | 'pinned'
}>(), {
  mode: 'wanted',
})

const toast = useToast()
const { t } = useI18n()
const query = ref('')
const error = ref('')
const loading = ref(false)
interface UserSearchCandidate {
  mid: string
  name: string
  face: string
  sign: string
}
const searchCandidates = ref<UserSearchCandidate[]>([])
const MAX_PINNED_USERS = 6

const isPinnedMode = computed(() => props.mode === 'pinned')

const managedUsers = computed<MomentsWantedUser[]>({
  get: () => isPinnedMode.value ? momentsPinnedUsers.value : momentsWantedUsers.value,
  set: (value) => {
    if (isPinnedMode.value)
      momentsPinnedUsers.value = value
    else
      momentsWantedUsers.value = value
  },
})

const managedUserMids = computed(() => new Set(managedUsers.value.map(user => user.mid)))

const copy = computed(() => {
  if (isPinnedMode.value) {
    return {
      alreadyIn: t('settings.wanted_users.pinned_already'),
      needFollow: (name: string) => t('settings.wanted_users.pinned_need_follow', { name }),
      added: (name: string) => t('settings.wanted_users.pinned_added', { name }),
      removed: (name: string) => t('settings.wanted_users.pinned_removed', { name }),
      removeAria: (name: string) => t('settings.wanted_users.remove_pinned', { name }),
      removeTitle: t('settings.wanted_users.remove_pinned_title'),
      empty: t('settings.wanted_users.pinned_empty'),
    }
  }
  return {
    alreadyIn: t('settings.wanted_users.wanted_already'),
    needFollow: (name: string) => t('settings.wanted_users.wanted_need_follow', { name }),
    added: (name: string) => t('settings.wanted_users.wanted_added', { name }),
    removed: (name: string) => t('settings.wanted_users.wanted_removed', { name }),
    removeAria: (name: string) => t('settings.wanted_users.remove_wanted', { name }),
    removeTitle: t('settings.wanted_users.remove_wanted_title'),
    empty: t('settings.wanted_users.wanted_empty'),
  }
})

function httpsUrl(url = '') {
  return url.replace(/^http:/, 'https:')
}

function avatarUrl(url = '') {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  return normalized ? `${normalized}@64w_64h_1c.webp` : ''
}

function stripSearchHighlight(value: unknown) {
  return String(value || '')
    .replace(/<em class="keyword">|<\/em>/gi, '')
    .replace(/[<>]/g, '')
    .trim()
}

async function addUser() {
  if (loading.value)
    return

  const input = query.value.trim()
  error.value = ''
  if (!input) {
    error.value = t('settings.wanted_users.enter_query')
    return
  }

  if (!/^\d+$/.test(input)) {
    loading.value = true
    searchCandidates.value = []
    try {
      const response = await api.search.searchUser({
        keyword: input,
        page: 1,
        page_size: 10,
        order: '',
        order_sort: 0,
        user_type: 0,
      })
      const results = response.code === 0 && Array.isArray(response.data?.result)
        ? response.data.result
        : []
      searchCandidates.value = results.slice(0, 10).map((user: any) => ({
        mid: String(user.mid || ''),
        name: stripSearchHighlight(user.uname),
        face: httpsUrl(user.upic || user.face || ''),
        sign: stripSearchHighlight(user.usign || user.sign),
      })).filter((user: UserSearchCandidate) => user.mid && user.name)
      if (!searchCandidates.value.length)
        error.value = t('settings.wanted_users.no_results')
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : t('settings.wanted_users.search_failed')
    }
    finally {
      loading.value = false
    }
    return
  }

  const mid = input.replace(/^0+/, '')
  if (!mid) {
    error.value = t('settings.wanted_users.invalid_uid')
    return
  }
  await addUserByMid(mid)
}

async function addUserByMid(mid: string) {
  if (loading.value)
    return
  error.value = ''

  if (managedUserMids.value.has(mid)) {
    error.value = copy.value.alreadyIn
    return
  }
  if (isPinnedMode.value && managedUsers.value.length >= MAX_PINNED_USERS) {
    error.value = t('settings.wanted_users.pinned_limit', { count: MAX_PINNED_USERS })
    return
  }

  loading.value = true
  try {
    const [cardResponse, relationResponse] = await Promise.all([
      api.user.getUserCard({ mid }),
      api.user.getRelations({ fids: mid }),
    ])
    const card = cardResponse.code === 0 ? cardResponse.data?.card : null
    if (!card?.mid || !card?.name) {
      error.value = cardResponse.message || t('settings.wanted_users.not_found')
      return
    }

    const relation = relationResponse.code === 0 ? relationResponse.data?.[mid] : null
    const isFollowing = relation?.attribute === 1 || relation?.attribute === 2 || relation?.attribute === 6
    if (!isFollowing) {
      error.value = copy.value.needFollow(card.name)
      toast.warning(error.value)
      return
    }

    managedUsers.value = [
      ...managedUsers.value,
      { mid: String(card.mid), name: card.name, face: httpsUrl(card.face || '') },
    ]
    query.value = ''
    searchCandidates.value = []
    toast.success(copy.value.added(card.name))
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('settings.wanted_users.info_failed')
  }
  finally {
    loading.value = false
  }
}

function removeUser(mid: string) {
  const user = managedUsers.value.find(item => item.mid === mid)
  managedUsers.value = managedUsers.value.filter(item => item.mid !== mid)
  if (user)
    toast.info(copy.value.removed(user.name))
}
</script>

<template>
  <div class="wanted-users-manager">
    <form class="wanted-users-manager__form" @submit.prevent="addUser">
      <input
        v-model="query"
        type="text"
        autocomplete="off"
        :placeholder="t('settings.wanted_users.placeholder')"
        :disabled="loading"
        @input="error = ''; searchCandidates = []"
      >
      <button type="submit" :disabled="loading || !query.trim()">
        <span v-if="loading" i-svg-spinners:ring-resize />
        <span v-else-if="/^\d+$/.test(query.trim())" i-tabler-user-plus />
        <span v-else i-tabler-search />
        {{ /^\d+$/.test(query.trim()) ? t('common.operation.add') : t('common.search') }}
      </button>
    </form>
    <p v-if="error" class="wanted-users-manager__error">
      <span i-tabler-alert-circle />{{ error }}
    </p>
    <div v-if="searchCandidates.length" class="wanted-users-manager__candidates">
      <button
        v-for="user in searchCandidates"
        :key="user.mid"
        type="button"
        :disabled="loading || managedUserMids.has(user.mid) || (isPinnedMode && managedUsers.length >= MAX_PINNED_USERS)"
        @click="addUserByMid(user.mid)"
      >
        <img :src="avatarUrl(user.face)" :alt="user.name">
        <span>
          <strong>{{ user.name }}</strong>
          <small>UID {{ user.mid }}</small>
          <em v-if="user.sign">{{ user.sign }}</em>
        </span>
      </button>
    </div>
    <div v-if="managedUsers.length" class="wanted-users-manager__list">
      <article v-for="user in managedUsers" :key="user.mid">
        <img :src="avatarUrl(user.face)" :alt="user.name">
        <span>
          <strong>{{ user.name }}</strong>
          <small>UID {{ user.mid }}</small>
        </span>
        <button
          type="button"
          :aria-label="copy.removeAria(user.name)"
          :title="copy.removeTitle"
          @click="removeUser(user.mid)"
        >
          <span i-tabler-trash />
        </button>
      </article>
    </div>
    <p v-else class="wanted-users-manager__empty">
      {{ copy.empty }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.wanted-users-manager {
  width: 100%;
}
.wanted-users-manager__form {
  display: flex;
  gap: 8px;
}
.wanted-users-manager__form input {
  min-width: 0;
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  outline: none;
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}
.wanted-users-manager__form input:focus {
  border-color: var(--bew-theme-color);
}
.wanted-users-manager__form button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  min-width: 78px;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: #fff;
  background: var(--bew-theme-color);
  cursor: pointer;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  transition: filter var(--bew-duration-normal) var(--bew-ease-standard);
}
.wanted-users-manager__form button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.wanted-users-manager__form button:hover:not(:disabled) {
  filter: brightness(1.08);
}
.wanted-users-manager__error {
  display: flex;
  gap: var(--bew-space-2);
  margin: var(--bew-space-3) 0 0;
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-control);
}
.wanted-users-manager__candidates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.wanted-users-manager__candidates > button {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  min-width: 0;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  background: var(--bew-fill-1);
  text-align: left;
  cursor: pointer;
}
.wanted-users-manager__candidates > button:hover:not(:disabled) {
  border-color: var(--bew-theme-color);
  background: var(--bew-fill-2);
}
.wanted-users-manager__candidates > button:disabled {
  opacity: 0.55;
  cursor: default;
}
.wanted-users-manager__candidates img {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 50%;
  object-fit: cover;
}
.wanted-users-manager__candidates button > span {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.wanted-users-manager__candidates strong,
.wanted-users-manager__candidates small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wanted-users-manager__candidates strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}
.wanted-users-manager__candidates small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.wanted-users-manager__candidates em {
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-style: normal;
}
.wanted-users-manager__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
  margin-top: var(--bew-space-4);
}
.wanted-users-manager__list article {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  min-width: 0;
  padding: 8px;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
}
.wanted-users-manager__list img {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 50%;
  object-fit: cover;
}
.wanted-users-manager__list article > span {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.wanted-users-manager__list strong,
.wanted-users-manager__list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wanted-users-manager__list strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}
.wanted-users-manager__list small,
.wanted-users-manager__empty {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.wanted-users-manager__list button {
  display: grid;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-3);
  background: transparent;
  place-items: center;
  cursor: pointer;
}
.wanted-users-manager__list button:hover {
  color: var(--bew-error-color);
  background: var(--bew-error-color-10);
}
.wanted-users-manager__empty {
  margin: 12px 0 0;
}
</style>
