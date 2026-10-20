<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { useAnchoredDropdown } from '~/composables/useAnchoredDropdown'
import { useBewlyApp } from '~/composables/useAppProvider'
import api from '~/utils/api'

import type { UserSearchCandidate } from '../types'

const props = withDefaults(defineProps<{
  /** 选中后的处理；返回错误文案表示未添加，此时保留输入。 */
  select: (user: UserSearchCandidate) => Promise<string | void> | string | void
  /** 已添加的 UID，对应候选置灰。 */
  exclude?: string[]
  /** 整体不可再添加（如已达上限）时置灰全部候选。 */
  disabled?: boolean
  placeholder?: string
  size?: 'default' | 'small'
}>(), {
  exclude: () => [],
  disabled: false,
  size: 'default',
})

type SearchStatus = 'idle' | 'loading' | 'not_found' | 'no_results' | 'invalid_uid' | 'search_failed' | 'info_failed'

const SEARCH_DEBOUNCE = 300

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()
const listboxId = `user-search-${useId()}`
const inputRef = ref<HTMLInputElement>()
const listRef = ref<HTMLElement>()
const query = ref('')
const error = ref('')
const picking = ref(false)
const status = ref<SearchStatus>('idle')
const candidates = ref<UserSearchCandidate[]>([])
const dropdown = useAnchoredDropdown(inputRef, listRef)
const { open, activeIndex } = dropdown
let requestId = 0

const excludedMids = computed(() => new Set(props.exclude))
const statusText = computed(() => {
  if (status.value === 'loading')
    return t('common.loading')
  if (status.value === 'idle')
    return ''
  return t(`settings.wanted_users.${status.value}`)
})

const runSearch = useDebounceFn(search, SEARCH_DEBOUNCE)

watch(query, (value) => {
  error.value = ''
  const input = value.trim()
  requestId++
  if (!input) {
    candidates.value = []
    status.value = 'idle'
    dropdown.hide()
    return
  }
  status.value = 'loading'
  dropdown.show()
  runSearch(input, requestId)
})

function httpsUrl(url = '') {
  return url.replace(/^http:/, 'https:')
}

function avatarUrl(url = '') {
  const normalized = httpsUrl(url).replace(/@[^/]*$/, '')
  return normalized ? `${normalized}@64w_64h_1c.webp` : ''
}

function stripSearchHighlight(value: unknown) {
  // 反复移除高亮标签直到不再变化，再清掉残留尖括号，避免嵌套标签拼接出新的标签
  let text = String(value || '')
  let previous: string
  do {
    previous = text
    text = text.replace(/<[^>]*>/g, '')
  } while (text !== previous)
  return text.replace(/[<>]/g, '').trim()
}

function parseMid(input: string): string {
  const spaceMatch = input.match(/space\.bilibili\.com\/(\d+)/)
  if (spaceMatch)
    return spaceMatch[1]
  const uidMatch = input.match(/^(?:uid:?)?(\d+)$/i)
  return uidMatch ? uidMatch[1].replace(/^0+/, '') : ''
}

async function findByMid(mid: string): Promise<UserSearchCandidate[]> {
  const response = await api.user.getUserCard({ mid })
  const card = response.code === 0 ? response.data?.card : null
  return card?.mid && card?.name
    ? [{ mid: String(card.mid), name: card.name, face: httpsUrl(card.face || ''), sign: stripSearchHighlight(card.sign) }]
    : []
}

async function searchByKeyword(keyword: string): Promise<UserSearchCandidate[]> {
  const response = await api.search.searchUser({
    keyword,
    page: 1,
    page_size: 10,
    order: '',
    order_sort: 0,
    user_type: 0,
  })
  const results = response.code === 0 && Array.isArray(response.data?.result) ? response.data.result : []
  return results.slice(0, 10).map((user: any) => ({
    mid: String(user.mid || ''),
    name: stripSearchHighlight(user.uname),
    face: httpsUrl(user.upic || user.face || ''),
    sign: stripSearchHighlight(user.usign || user.sign),
  })).filter((user: UserSearchCandidate) => user.mid && user.name)
}

async function search(input: string, id: number) {
  // UID 或空间链接直接查卡片，其余按昵称搜索
  const mid = parseMid(input)
  if (!mid && /^(?:uid:?)?\d+$/i.test(input)) {
    candidates.value = []
    status.value = 'invalid_uid'
    return
  }
  try {
    const results = mid ? await findByMid(mid) : await searchByKeyword(input)
    // 忽略已被后续输入取代的结果
    if (id !== requestId)
      return
    candidates.value = results
    status.value = results.length ? 'idle' : mid ? 'not_found' : 'no_results'
    activeIndex.value = results.length ? 0 : -1
  }
  catch {
    if (id !== requestId)
      return
    candidates.value = []
    status.value = mid ? 'info_failed' : 'search_failed'
  }
}

async function pick(user: UserSearchCandidate) {
  if (picking.value)
    return
  error.value = ''
  picking.value = true
  try {
    const message = await props.select(user)
    if (message) {
      error.value = message
      dropdown.hide()
      return
    }
    query.value = ''
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('settings.wanted_users.info_failed')
    dropdown.hide()
  }
  finally {
    picking.value = false
  }
}

function showResults() {
  if (query.value.trim())
    dropdown.show()
}

function confirmActive(event: KeyboardEvent) {
  // 输入法组字时的回车用于上屏
  if (event.isComposing)
    return
  event.preventDefault()
  const user = candidates.value[activeIndex.value]
  if (open.value && user)
    pick(user)
}
</script>

<template>
  <div class="user-search-picker" :class="`user-search-picker--${size}`">
    <div class="user-search-picker__field">
      <span class="user-search-picker__icon" :class="status === 'loading' || picking ? 'i-svg-spinners:ring-resize' : 'i-tabler-search'" />
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-controls="listboxId"
        :aria-expanded="open"
        :aria-activedescendant="open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined"
        :aria-label="placeholder ?? t('settings.wanted_users.placeholder')"
        :placeholder="placeholder ?? t('settings.wanted_users.placeholder')"
        @focus="showResults"
        @click="showResults"
        @blur="dropdown.hide"
        @keydown.down.prevent="dropdown.move(1, candidates.length)"
        @keydown.up.prevent="dropdown.move(-1, candidates.length)"
        @keydown.enter="confirmActive"
        @keydown.esc="dropdown.hideOnEscape"
      >
    </div>
    <p v-if="error" class="user-search-picker__error" role="alert">
      <span i-tabler-alert-circle />{{ error }}
    </p>

    <Teleport :to="mainAppRef" :disabled="!mainAppRef">
      <Transition name="user-search-picker-popover">
        <div
          v-if="open"
          :id="listboxId"
          ref="listRef"
          class="user-search-picker__list bew-popover-surface"
          role="listbox"
          :style="dropdown.style.value"
          @mousedown.prevent
        >
          <template v-if="status === 'idle'">
            <button
              v-for="(user, index) in candidates"
              :id="`${listboxId}-${index}`"
              :key="user.mid"
              type="button"
              role="option"
              tabindex="-1"
              :aria-selected="index === activeIndex"
              :aria-disabled="disabled || excludedMids.has(user.mid)"
              :class="{ 'active': index === activeIndex, 'is-disabled': disabled || excludedMids.has(user.mid) }"
              @mouseenter="activeIndex = index"
              @click="pick(user)"
            >
              <img :src="avatarUrl(user.face)" :alt="user.name">
              <span>
                <strong>{{ user.name }}<small>UID {{ user.mid }}</small></strong>
                <em v-if="user.sign">{{ user.sign }}</em>
              </span>
            </button>
          </template>
          <p v-else class="user-search-picker__status">
            {{ statusText }}
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.user-search-picker {
  --user-search-picker-height: 40px;

  width: 100%;
  min-width: 0;
}

.user-search-picker--small {
  --user-search-picker-height: 28px;
}

.user-search-picker__field {
  position: relative;
  display: flex;
  align-items: center;
}

.user-search-picker__icon {
  position: absolute;
  left: var(--bew-space-3);
  width: 16px;
  height: 16px;
  color: var(--bew-text-3);
  pointer-events: none;
}

.user-search-picker--small .user-search-picker__icon {
  left: var(--bew-space-2);
  width: 14px;
  height: 14px;
}

.user-search-picker__field input {
  box-sizing: border-box;
  width: 100%;
  height: var(--user-search-picker-height);
  padding: 0 var(--bew-space-3) 0 calc(var(--bew-space-3) + 16px + var(--bew-space-2));
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  outline: none;
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

.user-search-picker--small .user-search-picker__field input {
  padding: 0 var(--bew-space-2) 0 calc(var(--bew-space-2) + 14px + var(--bew-space-1));
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.user-search-picker__field input:focus {
  border-color: var(--bew-theme-color);
}

.user-search-picker__error {
  display: flex;
  gap: var(--bew-space-1);
  align-items: center;
  margin: var(--bew-space-2) 0 0;
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.user-search-picker__list {
  position: fixed;
  // 设置面板与规则编辑弹窗内均需位于最上层
  z-index: calc(var(--bew-z-dialog) + 2);
  box-sizing: border-box;
  padding: var(--bew-space-1);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;

  button {
    display: flex;
    align-items: center;
    gap: var(--bew-space-2);
    width: 100%;
    min-width: 0;
    padding: var(--bew-space-1) var(--bew-space-2);
    border: 0;
    border-radius: var(--bew-interactive-radius);
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

    &.active {
      background: var(--bew-fill-2);
    }

    &.is-disabled {
      opacity: 0.5;
    }
  }

  img {
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    border-radius: 50%;
    object-fit: cover;
  }

  button > span {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  strong,
  em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-control);
  }

  small {
    margin-left: var(--bew-space-2);
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
  }

  em {
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    font-style: normal;
    line-height: var(--bew-line-height-caption);
  }
}

.user-search-picker__status {
  margin: 0;
  padding: var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.user-search-picker-popover-enter-active,
.user-search-picker-popover-leave-active {
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
}

.user-search-picker-popover-enter-from,
.user-search-picker-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
