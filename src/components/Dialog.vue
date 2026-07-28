<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'

import Button from '~/components/Button.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'

const props = withDefaults(defineProps<{
  title?: string
  desc?: string
  center?: boolean
  frostedGlass?: boolean
  appendToBewlyBody?: boolean
  width?: string | number
  maxWidth?: string | number
  /** 对话框整体高度（含 header/footer） */
  height?: string | number
  contentHeight?: string | number
  contentMaxHeight?: string | number
  /** 顶部偏移；设置后改为顶部对齐（类似小红书 note 详情），不再垂直居中 */
  topOffset?: string | number
  /** 去掉内容区内边距（保留顶部 header），用于 iframe 详情等贴边场景 */
  contentFlush?: boolean
  /** 是否显示对话框顶栏 */
  showHeader?: boolean
  /** Vue Transition 名称；可为需要避免缩放的详情弹窗指定独立过渡 */
  transitionName?: string
  /** 是否显示边框和边缘光 */
  showBorder?: boolean
  showFooter?: boolean
  centerFooter?: boolean
  loading?: boolean
  preventCloseWhenLoading?: boolean
}>(), {
  preventCloseWhenLoading: true,
  frostedGlass: true,
  showHeader: true,
  showBorder: true,
  showFooter: true,
  contentFlush: false,
  transitionName: 'modal',
})

const emit = defineEmits(['close', 'confirm'])

const showShortcut = ref<boolean>(false)
const { mainAppRef } = useBewlyApp()
const showDialog = ref<boolean>(false)

onKeyStroke('Enter', (e: KeyboardEvent) => {
  e.preventDefault()
  if (!props.loading)
    handleConfirm()
})
onKeyStroke('Escape', (e: KeyboardEvent) => {
  console.log('[Dialog] ESC key pressed!')
  console.log('[Dialog] showDialog.value:', showDialog.value)

  // Only handle when dialog is shown
  if (!showDialog.value) {
    console.log('[Dialog] Dialog not shown, ignoring ESC')
    return
  }

  console.log('[Dialog] Processing ESC key')
  e.preventDefault()
  if (props.loading && props.preventCloseWhenLoading) {
    console.log('[Dialog] Prevented close due to loading')
    return
  }
  console.log('[Dialog] Closing dialog')
  handleClose()
})

const dialogWidth = computed(() => {
  return typeof props.width === 'number' ? `${props.width}px` : props.width || '400px'
})
const dialogMaxWidth = computed(() => {
  return typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth || 'unset'
})
const dialogHeight = computed(() => {
  if (props.height === undefined || props.height === null || props.height === '')
    return undefined
  return typeof props.height === 'number' ? `${props.height}px` : props.height
})
const dialogTopOffset = computed(() => {
  if (props.topOffset === undefined || props.topOffset === null || props.topOffset === '')
    return undefined
  return typeof props.topOffset === 'number' ? `${props.topOffset}px` : props.topOffset
})
const dialogContentHeight = computed(() => {
  return typeof props.contentHeight === 'number' ? `${props.contentHeight}px` : props.contentHeight || 'auto'
})
const dialogContentMaxHeight = computed(() => {
  return typeof props.contentMaxHeight === 'number' ? `${props.contentMaxHeight}px` : props.contentMaxHeight || 'auto'
})
const frostedGlassEnabled = computed(() => settings.value.enableFrostedGlass && props.frostedGlass !== false)
const dialogPanelStyle = computed(() => {
  const topAligned = dialogTopOffset.value !== undefined
  return {
    width: dialogWidth.value,
    maxWidth: dialogMaxWidth.value,
    height: dialogHeight.value,
    top: topAligned ? dialogTopOffset.value : '50%',
    left: '50%',
    transform: topAligned ? 'translateX(-50%)' : 'translate(-50%, -50%)',
    transition: 'transform 0.4s, width 0.4s, height 0.4s',
    overflow: topAligned ? 'visible' : 'hidden',
    border: props.showBorder ? undefined : '0',
    backdropFilter: frostedGlassEnabled.value ? 'var(--bew-filter-glass-2)' : 'none',
    WebkitBackdropFilter: frostedGlassEnabled.value ? 'var(--bew-filter-glass-2)' : 'none',
    backgroundColor: frostedGlassEnabled.value ? 'var(--bew-elevated-alt)' : 'var(--bew-elevated-alt-solid)',
    boxShadow: props.showBorder ? 'var(--bew-shadow-4), var(--bew-shadow-edge-glow-2)' : 'var(--bew-shadow-4)',
  }
})

onKeyStroke('Alt', (e: KeyboardEvent) => {
  e.preventDefault()
  showShortcut.value = true
}, { eventName: 'keydown' })
onKeyStroke('Alt', (e: KeyboardEvent) => {
  e.preventDefault()
  showShortcut.value = false
}, { eventName: 'keyup' })

onMounted(() => {
  showDialog.value = true
})

onBeforeUnmount(() => {
  handleClose()
})

function handleClose() {
  if (props.loading && props.preventCloseWhenLoading)
    return

  showDialog.value = false
  nextTick(() => {
    emit('close')
  })
}

function handleConfirm() {
  emit('confirm')
  if (!props.loading) {
    nextTick(() => {
      handleClose()
    })
  }
}
</script>

<template>
  <Teleport :to="mainAppRef" :disabled="!appendToBewlyBody">
    <Transition :name="transitionName">
      <div
        v-if="showDialog"
        class="dialog"
        pos="fixed top-0 left-0" w-full h-full z-10002
        pointer-events-auto
      >
        <div
          bg="black opacity-40 dark:opacity-40"
          pos="absolute top-0 left-0" w-full h-full z-0
          @click="handleClose"
        />
        <slot name="floating-actions" />
        <div
          :style="dialogPanelStyle"
          pos="absolute" rounded="$bew-modal-radius" border="1 $bew-border-color"
          z-2
          antialiased
          class="dialog__panel"
        >
          <!-- loading masking -->
          <Transition name="fade">
            <div
              v-if="loading"
              pos="absolute top-0 left-0" w-full h-full bg="white dark:black opacity-60 dark:opacity-60" flex="~ justify-center items-center"
              rounded="$bew-modal-radius"
              z-2
            >
              <div i-svg-spinners-ring-resize text="size-$bew-icon-size-xl" />
            </div>
          </Transition>

          <header
            v-if="showHeader"
            style="
              text-shadow: 0 0 10px var(--bew-elevated-solid), 0 0 15px var(--bew-elevated-solid)
            "
            pos="sticky top-0 left-0" w-full h-70px px-8 flex
            items-center justify-between
            rounded="t-$bew-modal-radius" z-1
          >
            <div
              pos="absolute top-0 left-0" w-inherit h-inherit pointer-events-none
              :style="{
                maskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)',
                backdropFilter: frostedGlassEnabled ? 'blur(3px) saturate(180%)' : 'none',
                WebkitBackdropFilter: frostedGlassEnabled ? 'blur(3px) saturate(180%)' : 'none',
              }"
              z--1 rounded-inherit
            />
            <div
              :style="{ textAlign: center ? 'center' : 'left' }"
              w-full
            >
              <slot name="title">
                <p class="dialog__title">
                  {{ title }}
                </p>
              </slot>
              <p class="dialog__description" text="$bew-text-2">
                <slot name="desc">
                  {{ desc }}
                </slot>
              </p>
            </div>

            <button
              type="button"
              aria-label="Close"
              class="dialog__close"
              style="
                backdrop-filter: var(--bew-filter-glass-1);
                box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
              "
              text="!16px hover:$bew-theme-color" w="32px" h="32px"
              flex="~ items-center justify-center shrink-0"
              bg="$bew-elevated dark:$bew-fill-1 hover:$bew-theme-color-30"
              ml-8 rounded="$bew-interactive-radius" cursor="pointer" border="1 $bew-border-color"
              box-border
              duration-300
              @click="handleClose"
            >
              <div i-ic-baseline-clear />
            </button>
          </header>

          <main
            :style="{
              height: dialogContentHeight,
              maxHeight: dialogContentMaxHeight,
              flex: dialogHeight ? '1 1 auto' : undefined,
              minHeight: dialogHeight ? '0' : undefined,
              ...(contentFlush
                ? { padding: '0' }
                : { paddingBottom: !showFooter ? '1.5rem' : '0.5rem' }),
            }"
            :p="contentFlush ? undefined : 'x-8 y-2'"
            relative
            :overflow="contentFlush ? 'hidden' : 'x-hidden y-overlay'"
          >
            <!-- <div h-80px mt--8 /> -->
            <slot />
          </main>
          <footer
            v-if="showFooter"
            :style="{ justifyContent: centerFooter || center ? 'center' : 'flex-end' }"
            flex="~ gap-2" p="x-8 t-2 b-6"
          >
            <Button type="tertiary" @click="handleClose">
              <div>
                {{ $t('common.operation.cancel') }}
                <span
                  v-show="showShortcut"
                  text="xs $bew-text-2 lh-0" p="x-1" rounded="$bew-radius-sm" bg="$bew-fill-1"
                  border="1 $bew-border-color"
                  mix-blend-color-dodge
                >
                  ESC
                </span>
              </div>
            </Button>
            <Button type="primary" @click="handleConfirm">
              <div>
                {{ $t('common.operation.confirm') }}
                <span
                  v-show="showShortcut"
                  text="xs $bew-text-2 lh-0" p="x-1" rounded="$bew-radius-sm" bg="$bew-fill-1"
                  border="1 $bew-border-color"
                  mix-blend-color-dodge
                >
                  ENTER
                </span>
              </div>
            </Button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.dialog__panel {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.dialog__title {
  margin: 0;
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
}

.dialog__description {
  margin: var(--bew-space-0-5) 0 0;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
}

.dialog__close {
  appearance: none;
  padding: 0;

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: var(--bew-space-0-5);
  }
}

.moments-dialog-enter-active,
.moments-dialog-leave-active {
  transition: opacity 140ms var(--bew-ease-standard, ease);
}

.moments-dialog-enter-from,
.moments-dialog-leave-to {
  opacity: 0;
}
</style>
