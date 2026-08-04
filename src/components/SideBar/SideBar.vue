<script setup lang="ts">
import { Icon } from '@iconify/vue'

import { useDark } from '~/composables/useDark'
import { useDelayedHover } from '~/composables/useDelayedHover'
import type { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'

import PageModeSwitcherButton from '../PageModeSwitcherButton.vue'
import Tooltip from '../Tooltip.vue'
import type { HoveringDockItem } from './types'

const props = defineProps<{
  activatedPage: AppPage
}>()
const emit = defineEmits(['settingsVisibilityChange'])
const { isDark, toggleDark } = useDark()

const tooltipPlacement = computed<'left' | 'right'>(() => {
  return settings.value.sidebarPosition === 'left' ? 'right' : 'left'
})

const hideSidebar = ref<boolean>(false)
const sideBarContentHover = ref<boolean>(false)
const sideBarContentRef = useDelayedHover({
  enterDelay: 100,
  leaveDelay: 600,
  enter: () => {
    sideBarContentHover.value = true
    toggleHideSidebar(false)
  },
  leave: () => {
    sideBarContentHover.value = false
    toggleHideSidebar(true)
  },
})

const hoveringDockItem = reactive<HoveringDockItem>({
  themeMode: false,
  settings: false,
})

watch(() => settings.value.autoHideSidebar, (newValue) => {
  if (newValue)
    hideSidebar.value = true
  else
    hideSidebar.value = false
}, {
  immediate: true,
})

function toggleHideSidebar(hide: boolean) {
  if (settings.value.autoHideSidebar)
    hideSidebar.value = hide
  else
    hideSidebar.value = false
}
</script>

<template>
  <div
    :class="{
      'left-side': settings.sidebarPosition === 'left',
      'right-side': settings.sidebarPosition === 'right',
      'hide': hideSidebar,
    }"
    pos="fixed top-0" h-full flex items-center px-6px
    z-10 pointer-events-none
  >
    <!-- Edge Div -->
    <div
      v-if="settings.autoHideSidebar && hideSidebar"
      class="sidebar-edge"
      :class="`sidebar-edge-${settings.sidebarPosition}`"
      pointer-events-auto
      @mouseenter="toggleHideSidebar(false)"
      @mouseleave="toggleHideSidebar(true)"
    />

    <div
      ref="sideBarContentRef"
      class="sidebar-content"
      :class="{
        hover: sideBarContentHover,
      }"
      flex="~ gap-2 col justify-center items-center"
      pointer-events-auto
      duration-300
    >
      <PageModeSwitcherButton
        v-if="settings.showBewlyOrBiliPageSwitcher"
        :activated-page="props.activatedPage"
        :placement="tooltipPlacement"
        variant="sidebar"
      />
      <Tooltip :content="isDark ? $t('dock.dark_mode') : $t('dock.light_mode')" :placement="tooltipPlacement">
        <Button
          class="ctrl-btn"
          style="backdrop-filter: var(--bew-filter-glass-1);"
          center size="small" round
          @click="toggleDark"
          @mouseenter="hoveringDockItem.themeMode = true"
          @mouseleave="hoveringDockItem.themeMode = false"
        >
          <Transition name="fade">
            <div v-show="hoveringDockItem.themeMode" absolute flex>
              <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-loop-transition" />
              <Icon v-else icon="line-md:moon-alt-to-sunny-outline-loop-transition" />
            </div>
          </Transition>
          <Transition name="fade">
            <div v-show="!hoveringDockItem.themeMode" absolute flex>
              <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-transition" />
              <Icon v-else icon="line-md:moon-to-sunny-outline-transition" />
            </div>
          </Transition>
        </Button>
      </Tooltip>
      <Tooltip :content="$t('dock.settings')" :placement="tooltipPlacement">
        <Button
          class="ctrl-btn group"
          style="backdrop-filter: var(--bew-filter-glass-1);"
          center size="small" round
          @click="emit('settingsVisibilityChange')"
        >
          <div mt--2px>
            <i
              i-mingcute:settings-3-line w-20px h-20px group-hover:rotate-180
              transition="transform duration-400 ease-out"
            />
          </div>
        </Button>
      </Tooltip>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ctrl-btn {
  --b-button-width: var(--bew-floating-control-size);
  --b-button-height: var(--bew-floating-control-size);
  --b-button-border-width: 1px;
  --b-button-color: var(--bew-elevated);
  --b-button-color-hover: var(--bew-elevated-hover);
  --b-button-shadow: var(--bew-shadow-1);
  --b-button-shadow-hover: var(--bew-shadow-2);
  --b-button-shadow-active: var(--bew-shadow-1);

  svg {
    width: var(--bew-floating-control-icon-size);
    height: var(--bew-floating-control-icon-size);
    flex-shrink: 0;
  }

  &::after {
    // safety area
    --uno: "content-empty absolute w-[calc(100%+12px)] h-[calc(100%+12px)] left--6px right--6px z--1";
  }
}

.ctrl-btn.ctrl-btn {
  transition:
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    border-color var(--bew-duration-moderate) var(--bew-ease-standard),
    box-shadow var(--bew-duration-moderate) var(--bew-ease-standard),
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-emphasized);

  &:hover {
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.9);
  }
}

.left-side {
  --uno: "left-0";
}

.right-side {
  --uno: "right-0";
}

.sidebar-edge {
  --uno: "absolute top-0 w-14px h-full hover:w-60px duration-300";

  &-left {
    --uno: "left-0";
  }

  &-right {
    --uno: "right-0";
  }
}

.left-side .sidebar-content {
  --uno: "translate-x-[calc(-50%-6px)] opacity-60";
}

.left-side .sidebar-content.hover {
  --uno: "translate-x-0 opacity-100";
}

.hide.left-side .sidebar-content {
  --uno: "translate-x--100% opacity-0 pointer-events-none";
}

.right-side .sidebar-content {
  --uno: "translate-x-[calc(50%+6px)] opacity-60";
}

.right-side .sidebar-content.hover {
  --uno: "translate-x-0 opacity-100";
}

.hide.right-side .sidebar-content {
  --uno: "translate-x-100% opacity-0 pointer-events-none";
}
</style>
