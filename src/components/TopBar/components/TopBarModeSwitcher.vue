<script setup lang="ts">
import { useMutationObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import Tooltip from '~/components/Tooltip.vue'
import { useLayoutEditMode } from '~/composables/useLayoutEditMode'
import { settings } from '~/logic'

import TopBarItemEditor from './TopBarItemEditor.vue'

const props = withDefaults(defineProps<{
  forceWhiteIcon?: boolean
  native?: boolean
}>(), {
  forceWhiteIcon: false,
  native: false,
})

const { t } = useI18n()
const { isLayoutEditing } = useLayoutEditMode()
const nativeTarget = shallowRef<Element | null>(null)
const nativeObserverTarget = computed(() => props.native ? document.body : null)

const actionLabel = computed(() => settings.value.useOriginalBilibiliTopBar
  ? t('topbar.switch_to_bewly_top_bar')
  : t('topbar.switch_to_bilibili_top_bar'))

function updateNativeTarget() {
  if (!props.native) {
    nativeTarget.value = null
    return
  }

  if (nativeTarget.value?.isConnected)
    return

  nativeTarget.value = document.querySelector(
    '.bili-header .bili-header__bar .right-entry, .bili-header__bar .right-entry',
  )
}

function toggleTopBar() {
  if (isLayoutEditing.value)
    return

  settings.value.useOriginalBilibiliTopBar = !settings.value.useOriginalBilibiliTopBar
}

watch(() => props.native, updateNativeTarget, { immediate: true })

useMutationObserver(
  nativeObserverTarget,
  updateNativeTarget,
  { childList: true, subtree: true },
)
</script>

<template>
  <Teleport v-if="props.native && nativeTarget" :to="nativeTarget">
    <li class="top-bar-mode-switcher top-bar-mode-switcher--native">
      <Tooltip :content="actionLabel" placement="bottom-right">
        <button
          type="button"
          class="top-bar-mode-switcher__button"
          :aria-label="actionLabel"
          @click.stop="toggleTopBar"
        >
          <span class="i-mingcute:refresh-2-line" aria-hidden="true" />
        </button>
      </Tooltip>
    </li>
  </Teleport>

  <div
    v-else-if="!props.native"
    class="top-bar-mode-switcher"
  >
    <TopBarItemEditor
      component-key="topBarSwitcher"
      settings-target-title-key="settings.use_original_bilibili_topbar"
    >
      <Tooltip :content="actionLabel" placement="bottom-right">
        <button
          type="button"
          class="top-bar-mode-switcher__button"
          :class="{ 'top-bar-mode-switcher__button--white': props.forceWhiteIcon }"
          :aria-label="actionLabel"
          @click="toggleTopBar"
        >
          <span class="i-mingcute:refresh-2-line" aria-hidden="true" />
        </button>
      </Tooltip>
    </TopBarItemEditor>
  </div>
</template>

<style scoped lang="scss">
.top-bar-mode-switcher {
  position: absolute;
  top: 0;
  right: calc(-1 * (var(--bew-control-height) + var(--bew-space-1)));
  display: flex;
  flex: none;
  align-items: center;
}

.top-bar-mode-switcher__button {
  display: grid;
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: var(--bew-control-radius);
  outline-offset: var(--bew-space-0-5);
  background: transparent;
  color: var(--bew-text-1);
  font-size: var(--bew-control-icon-size);
  cursor: pointer;
  filter: drop-shadow(0 0 4px var(--bew-bg));
  transition:
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard);

  &:hover,
  &:active {
    background: var(--bew-fill-2);
  }

  &--white {
    color: white;
    filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.6));

    &:hover,
    &:active {
      background: rgba(255, 255, 255, 0.2);
    }
  }
}

// 原版顶栏的右侧入口本身是 flex 容器；作为最后一个子项追加即可保持最右侧位置。
.top-bar-mode-switcher--native {
  position: relative;
  top: auto;
  right: auto;
  margin-left: var(--bew-space-1);
  list-style: none;
  transform: translateX(var(--bew-space-2));
}

.top-bar-mode-switcher--native .top-bar-mode-switcher__button {
  color: #18191c;
  filter: none;
}

.top-bar-mode-switcher :deep(.b-tooltip--placement-bottom-right) {
  right: 0;
}

// 窄屏右侧留白不足以容纳额外按钮，回到普通流内以保证点击区域完整可用。
@media (max-width: 1279px) {
  .top-bar-mode-switcher:not(.top-bar-mode-switcher--native) {
    position: relative;
    top: auto;
    right: auto;
  }
}
</style>
