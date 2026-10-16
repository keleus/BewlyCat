<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { MomentsWantedUser } from '~/logic/storage'
import { momentsPinnedUsers, momentsWantedUsers } from '~/logic/storage'
import api from '~/utils/api'

import UserSearchPicker from '../../components/UserSearchPicker.vue'
import type { UserSearchCandidate } from '../../types'

const props = withDefaults(defineProps<{
  mode?: 'wanted' | 'pinned'
}>(), {
  mode: 'wanted',
})

const toast = useToast()
const { t } = useI18n()
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

const managedUserMids = computed(() => managedUsers.value.map(user => user.mid))
const reachedPinnedLimit = computed(() => isPinnedMode.value && managedUsers.value.length >= MAX_PINNED_USERS)

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

function avatarUrl(url = '') {
  const normalized = url.replace(/^http:/, 'https:').replace(/@[^/]*$/, '')
  return normalized ? `${normalized}@64w_64h_1c.webp` : ''
}

async function addUser(user: UserSearchCandidate) {
  if (managedUserMids.value.includes(user.mid))
    return copy.value.alreadyIn
  if (reachedPinnedLimit.value)
    return t('settings.wanted_users.pinned_limit', { count: MAX_PINNED_USERS })

  const relationResponse = await api.user.getRelations({ fids: user.mid })
  const relation = relationResponse.code === 0 ? relationResponse.data?.[user.mid] : null
  const isFollowing = relation?.attribute === 1 || relation?.attribute === 2 || relation?.attribute === 6
  if (!isFollowing) {
    const message = copy.value.needFollow(user.name)
    toast.warning(message)
    return message
  }

  managedUsers.value = [
    ...managedUsers.value,
    { mid: user.mid, name: user.name, face: user.face },
  ]
  toast.success(copy.value.added(user.name))
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
    <UserSearchPicker
      :select="addUser"
      :exclude="managedUserMids"
      :disabled="reachedPinnedLimit"
    />
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
