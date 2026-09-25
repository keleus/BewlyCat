<script setup lang="ts">
import { onClickOutside, onKeyStroke, useEventListener } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { settings } from '~/logic'
import { isComponentVisible } from '~/utils/topBarBadge'

import type { TopBarChannelConfig } from '../constants/channels'
import { allChannelConfigs, MAX_PINNED_CHANNELS } from '../constants/channels'
import TopBarItemEditor from './TopBarItemEditor.vue'

const props = defineProps<{
  forceWhiteIcon: boolean
  availableWidth: number
}>()

const { t, locale } = useI18n()
const { isLayoutEditing } = useLayoutEditMode()

const containerRef = ref<HTMLElement | null>(null)
const moreButtonRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuLeft = ref(0)
const menuTop = ref(0)

const channelMap = computed(() => {
  const map = new Map<string, TopBarChannelConfig & { name: string }>()
  allChannelConfigs.forEach((config) => {
    map.set(config.key, {
      ...config,
      name: t(config.nameKey),
    })
  })
  return map
})

const pinnedKeys = computed<string[]>(() => settings.value.topBarPinnedChannels ?? [])

const validPinnedKeys = computed(() => {
  const seen = new Set<string>()
  return pinnedKeys.value.filter((key) => {
    if (seen.has(key))
      return false
    const exists = channelMap.value.has(key)
    if (exists)
      seen.add(key)
    return exists
  })
})

// 34px control: 4px padding per side, 26px items, 4px gap and 2px safety room.
// The overflow button shares the icon item's 26px slot, including for legacy counts.
const displayCount = computed(() => {
  const eligible = Math.min(MAX_PINNED_CHANNELS, validPinnedKeys.value.length)
  if (!eligible)
    return 0
  for (let count = eligible; count > 0; count--) {
    const hasOverflow = validPinnedKeys.value.length > count
    const width = 10 + count * 26 + (count - 1) * 4 + (hasOverflow ? 30 : 0)
    if (width <= props.availableWidth)
      return count
  }
  return 1
})

const displayedChannels = computed(() => {
  return validPinnedKeys.value.slice(0, displayCount.value)
    .map(key => channelMap.value.get(key))
    .filter((channel): channel is TopBarChannelConfig & { name: string } => Boolean(channel))
})

const hiddenChannels = computed(() => {
  return validPinnedKeys.value
    .slice(displayCount.value)
    .map(key => channelMap.value.get(key))
    .filter((channel): channel is TopBarChannelConfig & { name: string } => Boolean(channel))
})

const hiddenCount = computed(() => hiddenChannels.value.length)
watch(hiddenCount, (count) => {
  if (!count)
    menuOpen.value = false
})

function closeMenu(restoreFocus = false) {
  menuOpen.value = false
  if (restoreFocus)
    moreButtonRef.value?.focus()
}

async function toggleMenu() {
  if (menuOpen.value) {
    closeMenu()
    return
  }
  const rect = moreButtonRef.value?.getBoundingClientRect()
  if (!rect)
    return
  const width = Math.min(280, window.innerWidth - 16)
  menuLeft.value = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  menuTop.value = rect.bottom + 8
  menuOpen.value = true
  await nextTick()
  menuRef.value?.querySelector<HTMLAnchorElement>('a')?.focus()
}

onClickOutside(containerRef, () => closeMenu())
useEventListener(window, 'resize', () => closeMenu())
onKeyStroke('Escape', () => {
  if (menuOpen.value)
    closeMenu(true)
})
watch(() => locale.value, () => closeMenu())
watch(() => props.availableWidth, () => closeMenu())
watch(isLayoutEditing, () => closeMenu())

function handleChannelClick(event: MouseEvent) {
  if (!isLayoutEditing.value)
    return

  event.preventDefault()
  event.stopPropagation()
}

function handleMoreClick(event: MouseEvent) {
  if (isLayoutEditing.value) {
    handleChannelClick(event)
    return
  }
  void toggleMenu()
}

function handleMenuClick() {
  // Let the link's default action finish before unmounting its menu.
  window.setTimeout(() => closeMenu(), 0)
}
</script>

<template>
  <TopBarItemEditor
    component-key="pinnedChannels"
    :title="$t('settings.topbar_pinned_channels_title')"
  >
    <div
      v-if="isLayoutEditing || (isComponentVisible('pinnedChannels') && validPinnedKeys.length)"
      ref="containerRef"
      class="pinned-channels-editor-anchor"
      data-top-bar-editor-anchor
    >
      <div
        class="pinned-channels bew-segment-control bew-segment-control--surface"
        :class="{
          'white-theme': props.forceWhiteIcon,
          'bew-segment-control--solid': !settings.enableFrostedGlass,
          'pinned-channels--editing': isLayoutEditing,
          'pinned-channels--editing-empty': isLayoutEditing && !validPinnedKeys.length,
        }"
      >
        <div v-if="validPinnedKeys.length" class="pinned-channels__list">
          <ALink
            v-for="channel in displayedChannels"
            :key="channel.key"
            :href="channel.href"
            type="topBar"
            :custom-click-event="isLayoutEditing"
            class="pinned-channels__item bew-segment-control__item bew-segment-control__item--icon"
            :title="channel.name"
            @click="handleChannelClick"
          >
            <div v-if="channel.icon.startsWith('#')" class="pinned-channels__icon">
              <svg aria-hidden="true">
                <use :xlink:href="channel.icon" />
              </svg>
            </div>
            <div v-else class="pinned-channels__icon">
              <i
                :class="channel.icon"
                :style="props.forceWhiteIcon ? undefined : { color: channel.color }"
              />
            </div>
          </ALink>
        </div>
        <button
          v-if="hiddenCount > 0"
          ref="moreButtonRef"
          type="button"
          class="pinned-channels__more"
          :class="{ 'white-icon': props.forceWhiteIcon }"
          :aria-label="$t('settings.topbar_pinned_channels_more', { count: hiddenCount })"
          :aria-expanded="menuOpen"
          :aria-controls="menuOpen ? 'pinned-channels-menu' : undefined"
          @click="handleMoreClick"
        >
          +{{ hiddenCount }}
        </button>
        <span v-if="isLayoutEditing && !validPinnedKeys.length" class="pinned-channels__placeholder">
          <i i-mingcute:pin-line aria-hidden="true" />
          {{ $t('settings.topbar_pinned_channels_title') }}
        </span>
      </div>
      <div
        v-if="menuOpen && hiddenCount"
        id="pinned-channels-menu"
        ref="menuRef"
        class="pinned-channels-menu bew-popover bew-popover-surface"
        :style="{ left: `${menuLeft}px`, top: `${menuTop}px` }"
        role="menu"
        :aria-label="$t('settings.topbar_pinned_channels_title')"
        @click="handleMenuClick"
      >
        <ALink
          v-for="channel in hiddenChannels"
          :key="channel.key"
          :href="channel.href"
          type="topBar"
          role="menuitem"
          class="pinned-channels-menu__item"
        >
          <span class="pinned-channels__icon">
            <svg v-if="channel.icon.startsWith('#')" aria-hidden="true"><use :xlink:href="channel.icon" /></svg>
            <i v-else :class="channel.icon" :style="{ color: channel.color }" aria-hidden="true" />
          </span>
          {{ channel.name }}
        </ALink>
      </div>
    </div>
  </TopBarItemEditor>
</template>

<style scoped lang="scss">
.pinned-channels {
  --bew-segment-item-color: var(--bew-text-1);

  min-width: 0;
  flex: 0 1 auto;
  overflow: visible;

  &.bew-segment-control--solid {
    --bew-segment-surface-background: var(--bew-elevated-solid);
  }

  &__list {
    display: flex;
    align-items: center;
    gap: var(--bew-control-gap);
    overflow: hidden;
    min-width: 0;
  }

  &__icon {
    width: var(--bew-control-icon-size);
    height: var(--bew-control-icon-size);
    display: grid;
    place-items: center;

    svg {
      width: var(--bew-control-icon-size);
      height: var(--bew-control-icon-size);
      fill: currentColor;
    }

    i {
      font-size: var(--bew-control-icon-size);
    }
  }

  &__more {
    display: grid;
    place-items: center;
    height: var(--bew-control-item-height);
    width: var(--bew-control-item-height);
    padding: 0;
    border: 0;
    border-radius: var(--bew-control-item-radius);
    background: transparent;
    color: var(--bew-text-2);
    font-size: var(--bew-control-label-size);
    font-weight: var(--bew-control-brand-label-weight);
    line-height: var(--bew-control-label-line-height);
    cursor: pointer;
    transition:
      background-color var(--bew-duration-normal, 200ms) ease,
      color var(--bew-duration-normal, 200ms) ease;

    &:hover {
      color: var(--bew-segment-item-hover-color);
      background: var(--bew-segment-item-hover-bg);
    }

    &:focus-visible {
      outline: 2px solid var(--bew-theme-color);
      outline-offset: 2px;
    }

    &.white-icon {
      color: white;
      background: transparent;

      &:hover {
        background: var(--bew-segment-item-hover-bg-white);
      }
    }
  }

  &--editing {
    display: flex !important;
    min-width: 24px;
    min-height: var(--bew-control-height);
    align-items: center;
  }

  &--editing-empty {
    padding-inline: var(--bew-space-2);
  }

  &__placeholder {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-1);
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
    white-space: nowrap;

    i {
      width: var(--bew-icon-size-sm);
      height: var(--bew-icon-size-sm);
      flex: none;
    }
  }

  &.white-theme:not(.bew-segment-control--solid) {
    --bew-segment-surface-background: var(--bew-control-background-white);
    --bew-segment-surface-shadow: none;
    --bew-segment-item-color: white;
    --bew-segment-item-hover-current-color: white;
    --bew-segment-item-hover-current-bg: var(--bew-segment-item-hover-bg-white);
  }
}

.pinned-channels-editor-anchor {
  position: relative;
  min-height: var(--bew-control-height);
  flex: none;
}

.pinned-channels-menu {
  position: fixed;
  z-index: 1002;
  width: min(280px, calc(100vw - 16px));
  max-height: calc(100dvh - var(--bew-top-bar-height) - 16px);
  padding: var(--bew-space-2);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pinned-channels-menu__item {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  text-decoration: none;

  &:hover,
  &:focus-visible {
    background: var(--bew-fill-2);
  }
}
</style>
