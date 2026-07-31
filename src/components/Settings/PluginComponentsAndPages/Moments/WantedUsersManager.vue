<script setup lang="ts">
import { useToast } from 'vue-toastification'

import { momentsWantedUsers } from '~/logic/storage'
import api from '~/utils/api'

const toast = useToast()
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
const wantedUserMids = computed(() => new Set(momentsWantedUsers.value.map(user => user.mid)))

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

async function addUser() {
  if (loading.value)
    return

  const input = query.value.trim()
  error.value = ''
  if (!input) {
    error.value = '请输入 UP 主 UID 或昵称'
    return
  }

  if (!/^\d+$/.test(input)) {
    loading.value = true
    searchCandidates.value = []
    try {
      const response = await api.search.searchUser({
        keyword: input,
        page: 1,
        pagesize: 10,
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
      })).filter(user => user.mid && user.name)
      if (!searchCandidates.value.length)
        error.value = '没有找到相关 UP 主，请尝试其他昵称'
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : '搜索 UP 主失败，请稍后重试'
    }
    finally {
      loading.value = false
    }
    return
  }

  const mid = input.replace(/^0+/, '')
  if (!mid) {
    error.value = '请输入有效的 UP 主 UID'
    return
  }
  await addUserByMid(mid)
}

async function addUserByMid(mid: string) {
  if (loading.value)
    return
  error.value = ''

  if (wantedUserMids.value.has(mid)) {
    error.value = '该 UP 主已经在“想看”分组中'
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
      error.value = cardResponse.message || '未找到该 UP 主'
      return
    }

    const relation = relationResponse.code === 0 ? relationResponse.data?.[mid] : null
    const isFollowing = relation?.attribute === 1 || relation?.attribute === 2 || relation?.attribute === 6
    if (!isFollowing) {
      error.value = `必须先关注 ${card.name}，才能将其加入“想看”分组`
      toast.warning(error.value)
      return
    }

    momentsWantedUsers.value = [
      ...momentsWantedUsers.value,
      { mid: String(card.mid), name: card.name, face: httpsUrl(card.face || '') },
    ]
    query.value = ''
    searchCandidates.value = []
    toast.success(`已将 ${card.name} 加入“想看”`)
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : '获取 UP 主信息失败，请稍后重试'
  }
  finally {
    loading.value = false
  }
}

function removeUser(mid: string) {
  const user = momentsWantedUsers.value.find(item => item.mid === mid)
  momentsWantedUsers.value = momentsWantedUsers.value.filter(item => item.mid !== mid)
  if (user)
    toast.info(`已将 ${user.name} 移出“想看”`)
}
</script>

<template>
  <div class="wanted-users-manager">
    <form class="wanted-users-manager__form" @submit.prevent="addUser">
      <input
        v-model="query"
        type="text"
        autocomplete="off"
        placeholder="输入 UP 主 UID 或昵称"
        :disabled="loading"
        @input="error = ''; searchCandidates = []"
      >
      <button type="submit" :disabled="loading || !query.trim()">
        <span v-if="loading" i-svg-spinners:ring-resize />
        <span v-else-if="/^\d+$/.test(query.trim())" i-tabler-user-plus />
        <span v-else i-tabler-search />
        {{ /^\d+$/.test(query.trim()) ? '添加' : '搜索' }}
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
        :disabled="loading || wantedUserMids.has(user.mid)"
        @click="addUserByMid(user.mid)"
      >
        <img :src="avatarUrl(user.face)" :alt="user.name">
        <span><strong>{{ user.name }}</strong><small>{{ user.sign || `UID ${user.mid}` }}</small></span>
        <em>{{ wantedUserMids.has(user.mid) ? '已添加' : '选择' }}</em>
      </button>
    </div>
    <div v-if="momentsWantedUsers.length" class="wanted-users-manager__list">
      <article v-for="user in momentsWantedUsers" :key="user.mid">
        <img :src="avatarUrl(user.face)" :alt="user.name">
        <span><strong>{{ user.name }}</strong><small>UID {{ user.mid }}</small></span>
        <button type="button" :aria-label="`将 ${user.name} 移出想看`" title="移出想看" @click="removeUser(user.mid)">
          <span i-tabler-trash />
        </button>
      </article>
    </div>
    <p v-else class="wanted-users-manager__empty">
      尚未添加 UP 主。添加后可在 Bewly 动态页的“想看”中筛选。
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
  color: #d9485f;
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
  color: #d9485f;
  background: color-mix(in oklab, #d9485f 10%, transparent);
}
.wanted-users-manager__empty {
  margin: 12px 0 0;
}
</style>
