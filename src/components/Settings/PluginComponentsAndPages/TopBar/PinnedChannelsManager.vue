<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, inject, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Draggable from 'vuedraggable'

import Button from '~/components/Button.vue'
import ChannelIcon from '~/components/TopBar/components/ChannelIcon.vue'
import { pinnedChannelLayout, validPinnedChannelKeys } from '~/components/TopBar/composables/usePinnedChannels'
import { channelCategories } from '~/components/TopBar/constants/channelCategories'
import { allChannelConfigs } from '~/components/TopBar/constants/channels'
import { settings } from '~/logic'
import { getComponentConfig, isComponentVisible } from '~/utils/topBarBadge'

import { pinnedChannelHistoryKey } from '../../composables/usePinnedChannelHistory'

const { t } = useI18n()
const adding = ref(false)
const query = ref('')
const manager = ref<HTMLElement>()
const searchInput = ref<HTMLInputElement>()
const selectedPanel = ref<HTMLElement>()
const toggleButton = ref<HTMLButtonElement>()
function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}
const reducedMotion = usePreferredReducedMotion()
const category = ref('all')
const selectedList = ref<{ $el: HTMLElement } | null>(null)
const history = inject(pinnedChannelHistoryKey)
if (!history)
  throw new Error('Pinned channel history requires a settings window')
const { save, undo, canUndo, externalChange } = history
const categories = [{ key: 'all', channels: allChannelConfigs.map(channel => channel.key) }, ...channelCategories]
const categoryKeys = computed(() => new Set(categories.find(group => group.key === category.value)?.channels ?? []))
const channelMap = new Map(allChannelConfigs.map(channel => [channel.key, channel]))
const selected = computed({
  get: () => validPinnedChannelKeys.value.map(key => channelMap.get(key)!),
  set: channels => save(channels.map(channel => channel.key)),
})
const candidates = computed(() => {
  const search = query.value.trim().toLocaleLowerCase()
  return allChannelConfigs.filter(channel =>
    categoryKeys.value.has(channel.key)
    && (!search || `${t(channel.nameKey)} ${channel.key}`.toLocaleLowerCase().includes(search)),
  )
})
function remove(key: string) {
  const index = validPinnedChannelKeys.value.indexOf(key)
  const active = (manager.value?.getRootNode() as ShadowRoot | undefined)?.activeElement
  const restoreFocus = !!active && !!selectedPanel.value?.contains(active)
  save(settings.value.topBarPinnedChannels.filter(item => item !== key))
  if (restoreFocus) {
    void nextTick(() => {
      const rows = selectedList.value?.$el.querySelectorAll<HTMLElement>('[data-selected-channel]')
      const target = rows?.[Math.min(index, rows.length - 1)]
      ;(target ?? toggleButton.value)?.focus()
    })
  }
}
function toggle(key: string) {
  if (validPinnedChannelKeys.value.includes(key))
    remove(key)
  else
    save([...settings.value.topBarPinnedChannels, key])
}
function move(index: number, offset: number) {
  const keys = [...validPinnedChannelKeys.value]
  const target = index + offset
  if (target < 0 || target >= keys.length) {
    return
  }
  const moved = keys.splice(index, 1)[0]
  keys.splice(target, 0, moved)
  save(keys)
  void nextTick(() => selectedList.value?.$el.querySelectorAll<HTMLElement>('[data-selected-channel]')[target]?.focus())
}
function enable() {
  const config = getComponentConfig('pinnedChannels')
  if (config)
    config.visible = true
}
</script>

<template>
  <div ref="manager" class="pinned-manager" :data-settings-title="t('settings.topbar_pinned_channels_title')">
    <div class="pinned-manager__toolbar">
      <span>{{ t('settings.pinned_manager.count', { count: selected.length }) }}</span>
      <span class="pinned-manager__hint" role="status">
        <template v-if="!isComponentVisible('pinnedChannels')">{{ t('settings.pinned_manager.hidden') }}</template>
        <template v-else-if="selected.length">
          {{ pinnedChannelLayout ? (pinnedChannelLayout.overflowKeys.length ? t('settings.pinned_manager.layout', { visible: pinnedChannelLayout.visibleKeys.length, hidden: pinnedChannelLayout.overflowKeys.length }) : t('settings.pinned_manager.all_visible')) : t('settings.pinned_manager.unavailable') }}
        </template>
      </span>
      <Button v-if="!isComponentVisible('pinnedChannels')" size="small" type="secondary" @click="enable">
        {{ t('settings.pinned_manager.enable') }}
      </Button>
      <button ref="toggleButton" type="button" :aria-expanded="adding" @click="adding = !adding">
        {{ t(adding ? 'settings.pinned_manager.collapse' : 'settings.pinned_manager.add') }}
      </button>
    </div>
    <div class="pinned-manager__panels">
      <section ref="selectedPanel" class="pinned-manager__selection" :aria-label="t('settings.pinned_manager.selected')">
        <Draggable
          ref="selectedList" v-model="selected" item-key="key" handle=".pinned-manager__handle"
          class="pinned-manager__selected" :animation="reducedMotion === 'reduce' ? 0 : 150"
        >
          <template #item="{ element, index }">
            <div class="pinned-manager__row" data-selected-channel tabindex="-1" :aria-label="t(element.nameKey)">
              <span class="pinned-manager__handle" aria-hidden="true"><i i-mingcute:dots-line /></span>
              <ChannelIcon :icon="element.icon" :color="element.color" />
              <span class="pinned-manager__name">{{ t(element.nameKey) }}</span>
              <button type="button" :disabled="index === 0" :aria-label="t('settings.pinned_manager.move_before', { name: t(element.nameKey) })" :title="t('settings.pinned_manager.move_before', { name: t(element.nameKey) })" @click="move(index, -1)">
                <i i-mingcute:up-line aria-hidden="true" />
              </button>
              <button type="button" :disabled="index === selected.length - 1" :aria-label="t('settings.pinned_manager.move_after', { name: t(element.nameKey) })" :title="t('settings.pinned_manager.move_after', { name: t(element.nameKey) })" @click="move(index, 1)">
                <i i-mingcute:down-line aria-hidden="true" />
              </button>
              <button type="button" :aria-label="t('settings.pinned_manager.remove', { name: t(element.nameKey) })" :title="t('settings.pinned_manager.remove', { name: t(element.nameKey) })" @click="remove(element.key)">
                <i i-mingcute:close-line aria-hidden="true" />
              </button>
            </div>
          </template>
        </Draggable>
        <p v-if="!selected.length" class="pinned-manager__hint">
          {{ t('settings.topbar_pinned_channels_empty') }}
        </p>
        <div class="pinned-manager__toolbar">
          <Button size="small" type="secondary" :disabled="!selected.length" @click="save([])">
            {{ t('settings.pinned_manager.clear') }}
          </Button>
          <Button size="small" type="secondary" :disabled="!canUndo" @click="undo">
            {{ t('settings.pinned_manager.undo') }}
          </Button>
        </div>
        <p v-if="externalChange" class="pinned-manager__hint" role="status">
          {{ t('settings.pinned_manager.history_reset') }}
        </p>
      </section>
      <section v-show="adding" class="pinned-manager__picker" :aria-label="t('settings.pinned_manager.add')">
        <div class="pinned-manager__picker-controls">
          <div class="pinned-manager__toolbar pinned-manager__search">
            <input ref="searchInput" v-model="query" type="search" :placeholder="t('settings.pinned_manager.search')" :aria-label="t('settings.pinned_manager.search')">
            <button v-if="query" type="button" :aria-label="t('settings.pinned_manager.clear_search')" :title="t('settings.pinned_manager.clear_search')" @click="clearSearch">
              <i i-mingcute:close-line aria-hidden="true" />
            </button>
          </div>
          <div class="pinned-manager__categories bew-segment-control bew-segment-control--static" role="group" :aria-label="t('settings.pinned_manager.categories')">
            <button
              v-for="group in categories" :key="group.key" type="button" class="bew-segment-control__item" :data-active="category === group.key"
              :aria-pressed="category === group.key" @click="category = group.key"
            >
              {{ t(`settings.pinned_manager.${group.key}`) }}
            </button>
          </div>
        </div>
        <div class="pinned-manager__candidates">
          <button v-for="channel in candidates" :key="channel.key" type="button" :aria-pressed="validPinnedChannelKeys.includes(channel.key)" @click="toggle(channel.key)">
            <ChannelIcon :icon="channel.icon" :color="channel.color" />
            <span class="pinned-manager__name">{{ t(channel.nameKey) }}</span>
            <span class="pinned-manager__check" aria-hidden="true">{{ validPinnedChannelKeys.includes(channel.key) ? '✓' : '' }}</span>
          </button>
          <div v-if="!candidates.length" class="pinned-manager__empty">
            <p>{{ t('settings.pinned_manager.no_results') }}</p>
            <button v-if="category !== 'all'" type="button" @click="category = 'all'">
              {{ t('settings.pinned_manager.view_all') }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pinned-manager {
  display: grid;
  padding-block: var(--bew-space-3);
  gap: var(--bew-space-2);
  min-width: 0;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  button:not(.bew-segment-control__item) {
    border-radius: var(--bew-interactive-radius);
    min-height: var(--bew-control-height);
    padding: var(--bew-space-1) var(--bew-space-2);
  }
  button:hover:not(:disabled) {
    background: var(--bew-fill-2);
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  button[aria-pressed="true"] {
    background: var(--bew-theme-color-20);
  }
}
.pinned-manager__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bew-space-2);
}
.pinned-manager__panels {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-3);
  align-items: start;
}
.pinned-manager__selection,
.pinned-manager__picker,
.pinned-manager__picker-controls {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-2);
}
.pinned-manager__selected,
.pinned-manager__candidates {
  display: flex;
  flex-wrap: wrap;
  align-content: start;
  align-items: flex-start;
  gap: var(--bew-space-2);
  max-height: min(40vh, 320px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: var(--bew-space-1);
}
.pinned-manager__selected {
  display: grid;
}
.pinned-manager__row {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1);
  min-height: 36px;
  max-width: 100%;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  button:not(.bew-segment-control__item) {
    flex: none;
    min-width: 24px;
    min-height: 24px;
    padding: var(--bew-space-1);
  }
}
.pinned-manager__name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.pinned-manager__handle {
  display: grid;
  place-items: center;
  flex: none;
  min-width: 24px;
  min-height: 24px;
  cursor: grab;
  touch-action: none;
}
.pinned-manager__hint {
  color: var(--bew-text-2);
}
.pinned-manager__picker {
  padding: var(--bew-space-3);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-panel-radius);
  gap: var(--bew-space-3);
}
.pinned-manager__search {
  flex-wrap: nowrap;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  input {
    width: 100%;
    min-width: 0;
    min-height: var(--bew-control-height);
    padding: var(--bew-space-2);
    background: transparent;
    &::-webkit-search-cancel-button {
      display: none;
    }
  }
}
.pinned-manager__categories {
  flex-wrap: wrap;
  height: auto;
  justify-self: start;
}
.pinned-manager__candidates {
  button:not(.bew-segment-control__item) {
    max-width: 100%;
    border-radius: var(--bew-radius-full);
    padding-inline: var(--bew-space-3);
    background: var(--bew-fill-1);
    &[aria-pressed="true"] {
      background: var(--bew-theme-color-20);
    }
    &:hover {
      background: var(--bew-fill-2);
    }
    display: flex;
    align-items: center;
    gap: var(--bew-space-2);
    text-align: start;
  }
}
.pinned-manager__check {
  flex: none;
  width: 1em;
  color: var(--bew-theme-color);
}
.pinned-manager__empty {
  width: 100%;
}
</style>
