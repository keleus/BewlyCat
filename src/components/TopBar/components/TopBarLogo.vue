<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import bilibiliBrandLogoUrl from '~/assets/branding/bilibili-brand-logo.png'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import BewlyOrBiliPageSwitcher from './BewlyOrBiliPageSwitcher.vue'
import ChannelsPop from './pops/ChannelsPop.vue'
import TopBarPinnedChannels from './TopBarPinnedChannels.vue'

defineProps<{
  forceWhiteIcon: boolean
}>()

const { handleClickTopBarItem, setupTopBarItemHoverEvent } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { popupVisible } = storeToRefs(topBarStore)
const logo = ref<HTMLElement | null>(null)

const channels = setupTopBarItemHoverEvent('channels')
</script>

<template>
  <div
    flex="inline xl:1 items-center gap-2"
    pos="relative"
    z-1
    class="top-bar-logo"
  >
    <div
      flex="~ items-center gap-2 shrink-0"
      z-1
    >
      <div
        ref="channels"
        relative w-fit
      >
        <a
          ref="logo"
          href="//www.bilibili.com"
          target="_top"
          class="group logo top-bar-brand-button"
          :class="{
            'activated': popupVisible.channels,
            'top-bar-brand-button--white': forceWhiteIcon,
          }"
          aria-label="Bilibili"
          @click="(event: MouseEvent) => handleClickTopBarItem(event, 'channels')"
        >
          <span
            class="top-bar-brand-button__logo"
            :style="{
              maskImage: `url(${bilibiliBrandLogoUrl})`,
              WebkitMaskImage: `url(${bilibiliBrandLogoUrl})`,
            }"
            aria-hidden="true"
          />
        </a>

        <Transition name="slide-in">
          <ChannelsPop
            v-if="popupVisible.channels"
            class="bew-popover"
            pos="!absolute !left-0 !top-50px"
            transform="!translate-x-0"
            z="!999"
          />
        </Transition>
      </div>

      <!-- 首页按钮（仅在触屏模式下显示） -->
      <a
        v-if="settings.touchScreenOptimization && settings.showHomeButtonInTouchMode"
        href="//www.bilibili.com"
        target="_top"
        class="group home-button"
        grid="~ place-items-center"
        rounded="46px"
        duration-300
        w-46px h-46px
        bg="hover:$bew-theme-color"
        shrink-0
      >
        <div
          class="i-mingcute:home-3-fill home-icon"
          w="24px" h="24px"
          :style="{
            color: forceWhiteIcon ? 'white' : 'var(--bew-theme-color)',
            filter: forceWhiteIcon
              ? 'drop-shadow(0 0 4px rgba(0, 0, 0, 0.6))'
              : 'drop-shadow(0 0 4px var(--bew-theme-color-60))',
          }"
        />
      </a>
    </div>

    <BewlyOrBiliPageSwitcher
      v-if="settings.showBewlyOrBiliPageSwitcher"
      :force-white-icon="forceWhiteIcon"
      z-1
    />

    <TopBarPinnedChannels :force-white-icon="forceWhiteIcon" />
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";

.bew-popover {
  position: fixed;
  z-index: 999;
}

.logo {
  &.activated {
    background-color: var(--bew-theme-color);
    color: white;
  }
}

.home-button {
  .home-icon {
    transition: all 0.3s;
  }

  &:hover .home-icon {
    color: white !important;
    filter: none !important;
  }
}

.top-bar-brand-button {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  height: 46px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--bew-top-bar-control-radius);
  background: transparent;
  color: var(--bew-theme-color);
  backdrop-filter: none;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;

  &:hover {
    background: var(--bew-theme-color);
    color: white;
  }

  &--white {
    background: transparent;
    color: white;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }

  &__logo {
    width: 84px;
    height: 28px;
    flex: none;
    background: currentColor;
    mask-position: center;
    mask-repeat: no-repeat;
    mask-size: contain;
    -webkit-mask-position: center;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    filter: drop-shadow(0 0 4px currentColor);
  }
}

.top-bar-logo {
  min-width: 0;
  flex: 0 1 auto;
}

@media (max-width: 1100px) {
  .top-bar-brand-button {
    height: 46px;
    padding: 0 7px;

    &__logo {
      width: 72px;
      height: 24px;
    }
  }
}

@media (max-width: 767px) {
  .top-bar-brand-button {
    width: 46px;
    height: 46px;
    padding: 0 8px;

    &__logo {
      width: 24px;
      height: 24px;
      mask-position: left center;
      mask-size: auto 24px;
      -webkit-mask-position: left center;
      -webkit-mask-size: auto 24px;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .top-bar-brand-button {
    transition: none;
  }
}
</style>
