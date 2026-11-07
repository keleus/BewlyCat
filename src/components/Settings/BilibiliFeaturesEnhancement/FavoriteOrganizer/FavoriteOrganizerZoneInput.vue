<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useAnchoredDropdown } from '~/composables/useAnchoredDropdown'
import { useBewlyApp } from '~/composables/useAppProvider'
import { VIDEO_ZONES } from '~/constants/videoZones'

const props = defineProps<{ selected: number[] }>()
const emit = defineEmits<{ (event: 'select', tid: number): void }>()

interface ZoneOption {
  tid: number
  name: string
  parent?: string
  /** 用于匹配的文本：子分区带上主分区名，输入主分区名时一并列出其子分区 */
  keywords: string
}

const { t } = useI18n()
const { mainAppRef } = useBewlyApp()
const listboxId = `favorite-zone-${useId()}`
const inputRef = ref<HTMLInputElement>()
const listRef = ref<HTMLElement>()
const query = ref('')
const dropdown = useAnchoredDropdown(inputRef, listRef)
const { open, activeIndex } = dropdown

const allOptions: ZoneOption[] = VIDEO_ZONES.flatMap(zone => [
  { tid: zone.tid, name: zone.name, keywords: normalize(zone.name) },
  ...zone.children.map(child => ({
    tid: child.tid,
    name: child.name,
    parent: zone.name,
    keywords: normalize(`${zone.name}${child.name}`),
  })),
])
const parentTidByChild = new Map(VIDEO_ZONES.flatMap(zone => zone.children.map(child => [child.tid, zone.tid] as const)))

const options = computed(() => {
  const selected = new Set(props.selected)
  const keyword = normalize(query.value)
  // 已选主分区覆盖其全部子分区，不再列出
  return allOptions.filter(option => !selected.has(option.tid)
    && !selected.has(parentTidByChild.get(option.tid) ?? 0)
    && (!keyword || option.keywords.includes(keyword)))
})

watch(options, () => {
  activeIndex.value = query.value.trim() && options.value.length ? 0 : -1
})

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[\s·・]/g, '')
}

function select(option: ZoneOption) {
  emit('select', option.tid)
  query.value = ''
  dropdown.hide()
  inputRef.value?.focus()
}

function confirmActive(event: KeyboardEvent) {
  // 输入法组字时的回车用于上屏，不选中分区
  if (event.isComposing)
    return
  event.preventDefault()
  const option = options.value[activeIndex.value] ?? (query.value.trim() ? options.value[0] : undefined)
  if (option)
    select(option)
}
</script>

<template>
  <div class="zone-input">
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
      :aria-label="t('settings.favorite_organizer.zone')"
      :placeholder="t('settings.favorite_organizer.zone_placeholder')"
      @focus="dropdown.show"
      @click="dropdown.show"
      @input="dropdown.show"
      @blur="dropdown.hide"
      @keydown.down.prevent="dropdown.move(1, options.length)"
      @keydown.up.prevent="dropdown.move(-1, options.length)"
      @keydown.enter="confirmActive"
      @keydown.esc="dropdown.hideOnEscape"
    >
    <Teleport :to="mainAppRef" :disabled="!mainAppRef">
      <Transition name="zone-input-popover">
        <div
          v-if="open"
          :id="listboxId"
          ref="listRef"
          class="zone-input__list bew-popover-surface"
          role="listbox"
          :style="dropdown.style.value"
          @mousedown.prevent
        >
          <button
            v-for="(option, index) in options"
            :id="`${listboxId}-${index}`"
            :key="option.tid"
            type="button"
            role="option"
            tabindex="-1"
            :aria-selected="index === activeIndex"
            :class="{ active: index === activeIndex }"
            @mouseenter="activeIndex = index"
            @click="select(option)"
          >
            <strong>{{ option.name }}</strong>
            <span>{{ option.parent ?? t('settings.favorite_organizer.zone_main') }}</span>
          </button>
          <p v-if="!options.length">
            {{ t('settings.favorite_organizer.zone_no_match') }}
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.zone-input {
  position: relative;
  min-width: 0;
}

.zone-input input {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 var(--bew-space-2);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  outline: none;
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.zone-input input:focus {
  border-color: var(--bew-theme-color);
}

.zone-input__list {
  position: fixed;
  // 用于规则编辑弹窗内，需高于对话框层级
  z-index: calc(var(--bew-z-dialog) + 2);
  box-sizing: border-box;
  padding: var(--bew-space-1);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--bew-space-3);
    width: 100%;
    min-height: 30px;
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
  }

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-control);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }

  p {
    margin: 0;
    padding: var(--bew-space-2);
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-control);
  }
}

.zone-input-popover-enter-active,
.zone-input-popover-leave-active {
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-standard);
}

.zone-input-popover-enter-from,
.zone-input-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
