<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { isComponentVisible } from '~/utils/topBarBadge'

import { getPinnedVisibleCount, pinnedChannelLayout, validPinnedChannelKeys } from '../composables/usePinnedChannels'
import { useTopBarPanel } from '../composables/useTopBarPanel'
import { allChannelConfigs } from '../constants/channels'
import ChannelIcon from './ChannelIcon.vue'
import TopBarItemEditor from './TopBarItemEditor.vue'

const props = defineProps<{ forceWhiteIcon: boolean, availableWidth: number, compact: boolean }>()
const { t, locale } = useI18n()
const { openSettings } = useBewlyApp()
const { isLayoutEditing } = useLayoutEditMode()
const store = useTopBarStore()
const anchor = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const measurement = ref<HTMLElement | null>(null)
const visibleCount = ref(0)
const open = computed({ get: () => store.popupVisible.pinnedChannels, set: value => store.popupVisible.pinnedChannels = value })
const channels = computed(() => validPinnedChannelKeys.value.map(key => allChannelConfigs.find(channel => channel.key === key)!))
const visible = computed(() => channels.value.slice(0, visibleCount.value))
const overflow = computed(() => channels.value.slice(visibleCount.value))
const enabled = computed(() => isLayoutEditing.value || (isComponentVisible('pinnedChannels') && channels.value.length > 0))

function close(restoreFocus = false) {
  if (!open.value)
    return
  open.value = false
  if (restoreFocus)
    trigger.value?.focus()
}
const { panelStyle, position } = useTopBarPanel(anchor, panel, open, close, { width: 'content', minWidth: 160, maxWidth: 240, align: 'end', trigger })
function toggle() {
  if (isLayoutEditing.value)
    return
  if (open.value) {
    close(true)
  }
  else {
    store.closeAllPopups()
    open.value = true
  }
}
function manage() {
  close()
  openSettings({ menu: 'BewlyComponents', secondaryPage: 'topbar', targetTitleKey: 'settings.topbar_pinned_channels_title' })
}
let frame = 0
let disposed = false
function measure() {
  if (disposed)
    return
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const el = measurement.value
    if (!el || !enabled.value) {
      pinnedChannelLayout.value = null
      return
    }
    const style = getComputedStyle(el)
    const inset = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
    const itemWidths = Array.from(el.querySelectorAll<HTMLElement>('[data-measure-item]'), item => item.getBoundingClientRect().width)
    const moreWidths = [0, ...Array.from(el.querySelectorAll<HTMLElement>('[data-measure-more]'), item => item.getBoundingClientRect().width)]
    let count = props.compact ? 0 : getPinnedVisibleCount(props.availableWidth, itemWidths, moreWidths, Number.parseFloat(style.columnGap) || 0, inset, visibleCount.value)
    const collapsedWidth = Number.parseFloat(style.getPropertyValue('--bew-top-bar-pinned-collapsed-width')) || 96
    // Before reducing search below its preferred width, fold the whole group.
    if (count < channels.value.length && props.availableWidth < collapsedWidth)
      count = 0
    const root = anchor.value?.getRootNode() as ShadowRoot | undefined
    const focusedKey = root?.activeElement?.getAttribute('data-channel-key')
    visibleCount.value = count
    const nextLayout = {
      visibleKeys: validPinnedChannelKeys.value.slice(0, count),
      overflowKeys: validPinnedChannelKeys.value.slice(count),
      collapsed: count === 0,
    }
    if (JSON.stringify(nextLayout) !== JSON.stringify(pinnedChannelLayout.value))
      pinnedChannelLayout.value = nextLayout
    if (focusedKey && !validPinnedChannelKeys.value.slice(0, count).includes(focusedKey))
      void nextTick(() => trigger.value?.focus())
    if (!overflow.value.length) {
      const hadFocus = panel.value?.contains(root?.activeElement ?? null) || root?.activeElement === trigger.value
      close()
      if (hadFocus)
        void nextTick(() => anchor.value?.querySelector<HTMLElement>('[data-channel-key]')?.focus())
    }
    position()
  })
}
watch([() => props.availableWidth, () => props.compact, channels, locale, enabled], async () => {
  await nextTick()
  measure()
}, { immediate: true })
watch([enabled, isLayoutEditing], () => close())
useResizeObserver(measurement, measure)
onMounted(() => {
  void document.fonts.ready.then(measure)
  document.fonts.addEventListener('loadingdone', measure)
})
onBeforeUnmount(() => {
  disposed = true
  document.fonts.removeEventListener('loadingdone', measure)
  cancelAnimationFrame(frame)
  store.popupVisible.pinnedChannels = false
  pinnedChannelLayout.value = null
})
</script>

<template>
  <TopBarItemEditor component-key="pinnedChannels" :title="t('settings.topbar_pinned_channels_title')">
    <div v-if="enabled" ref="anchor" class="pinned-channels-anchor" data-top-bar-editor-anchor>
      <div
        class="pinned-channels bew-segment-control bew-segment-control--surface"
        :class="{ 'white-theme': forceWhiteIcon && settings.enableFrostedGlass, 'bew-segment-control--solid': !settings.enableFrostedGlass, 'pinned-channels--collapsed': !visible.length && !compact }"
      >
        <ALink
          v-for="channel in visible" :key="channel.key" :href="channel.href" type="topBar"
          class="pinned-channels__item bew-segment-control__item bew-segment-control__item--icon"
          :title="t(channel.nameKey)" :aria-label="t(channel.nameKey)" :data-channel-key="channel.key"
          :custom-click-event="isLayoutEditing" :custom-click-event-includes-modifiers="isLayoutEditing"
          @auxclick="isLayoutEditing && $event.preventDefault()"
        >
          <ChannelIcon :icon="channel.icon" :color="forceWhiteIcon ? undefined : channel.color" />
        </ALink>
        <button
          v-if="overflow.length || !channels.length" ref="trigger" type="button"
          class="bew-segment-control__item" :class="{ 'bew-segment-control__item--icon': compact || !channels.length }"
          :aria-label="t('settings.pinned_manager.open', { count: overflow.length })"
          :aria-expanded="open" aria-controls="pinned-channels-panel"
          :title="t('settings.topbar_pinned_channels_title')" @click="toggle"
        >
          <i v-if="compact || !channels.length" i-mingcute:pin-line aria-hidden="true" />
          <template v-else>
            {{ visible.length ? `+${overflow.length}` : t('settings.pinned_manager.channels') }}
          </template>
        </button>
      </div>
      <div
        v-if="open" id="pinned-channels-panel" ref="panel"
        class="pinned-panel bew-popover bew-popover-surface" :style="panelStyle"
        :aria-label="t('settings.topbar_pinned_channels_title')" @focusout="(event) => { if (event.relatedTarget && !anchor?.contains(event.relatedTarget as Node)) close() }"
      >
        <ALink v-for="channel in overflow" :key="channel.key" :href="channel.href" type="topBar" class="pinned-panel__row">
          <ChannelIcon :icon="channel.icon" :color="channel.color" />{{ t(channel.nameKey) }}
        </ALink>
        <button type="button" class="pinned-panel__row pinned-panel__manage" @click="manage">
          {{ t('settings.pinned_manager.manage') }}
        </button>
      </div>
      <div ref="measurement" class="pinned-measure bew-segment-control" aria-hidden="true" inert>
        <span v-for="channel in channels" :key="channel.key" data-measure-item class="bew-segment-control__item bew-segment-control__item--icon" />
        <span v-for="count in channels.length" :key="`more-${count}`" data-measure-more class="bew-segment-control__item">+{{ count }}</span>
      </div>
    </div>
  </TopBarItemEditor>
</template>

<style scoped lang="scss">
.pinned-channels-anchor {
  position: relative;
  flex: none;
  min-width: var(--bew-control-height);
}
.pinned-channels {
  --bew-segment-item-color: var(--bew-text-1);
  &--collapsed {
    width: var(--bew-top-bar-pinned-collapsed-width);
    justify-content: center;
  }
  &.bew-segment-control--solid {
    --bew-segment-surface-background: var(--bew-elevated-solid);
  }
  &.white-theme {
    --bew-segment-item-color: white;
    --bew-segment-item-hover-current-color: white;
    --bew-segment-item-hover-current-bg: var(--bew-segment-item-hover-bg-white);
    --bew-segment-surface-background: var(--bew-control-background-white);
  }
}
.pinned-measure {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  width: 0;
  height: 0;
  overflow: hidden;
  top: 0;
  left: 0;
}
.pinned-panel {
  position: absolute;
  z-index: 999;
  box-sizing: border-box;
  padding: var(--bew-space-2);
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  color: var(--bew-text-1);
}
.pinned-panel__row {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  width: 100%;
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  text-align: start;
  white-space: normal;
  overflow-wrap: anywhere;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  &:hover {
    background: var(--bew-fill-2);
  }
}
.pinned-panel__manage {
  margin-top: var(--bew-space-2);
  color: var(--bew-theme-color);
}
</style>
