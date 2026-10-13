<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MomentRichText from './MomentRichText.vue'
import type { DisplayRichTextSegment } from './types'

const { id, segments, text = '', href = '', resetKey } = defineProps<{
  /** 正文元素 id，供展开按钮 aria-controls 关联 */
  id: string
  segments: DisplayRichTextSegment[]
  /** 无富文本片段时展示的纯文本 */
  text?: string
  /** 正文点击落点，通常为动态详情 */
  href?: string
  /** 变化时恢复折叠状态，用于虚拟列表复用组件实例 */
  resetKey?: string
}>()

const emit = defineEmits<{
  linkClick: [event: MouseEvent, url: string]
  textClick: [event: MouseEvent]
}>()

const { t } = useI18n()
const descriptionRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const canToggle = ref(false)

function updateOverflow() {
  const description = descriptionRef.value
  if (!description) {
    canToggle.value = false
    return
  }

  // 展开后 clientHeight 等于完整高度，保留既有可收起状态；折叠时再按
  // 实际滚动高度判断，避免短正文也出现展开按钮。
  canToggle.value = expanded.value
    || description.scrollHeight > description.clientHeight + 1
}

function toggle() {
  expanded.value = !expanded.value
  void nextTick(updateOverflow)
}

useResizeObserver(descriptionRef, updateOverflow)
onMounted(() => void nextTick(updateOverflow))
watch(() => resetKey, () => {
  expanded.value = false
  void nextTick(updateOverflow)
})
</script>

<template>
  <p
    :id="id"
    ref="descriptionRef"
    class="moment-card__desc"
    :class="{ 'moment-card__desc--expanded': expanded }"
  >
    <MomentRichText
      v-if="segments.length"
      :segments="segments"
      :href="href"
      @link-click="(event, url) => emit('linkClick', event, url)"
      @text-click="event => emit('textClick', event)"
    />
    <a
      v-else
      :href="href"
      class="moment-card__text-link"
      draggable="false"
      tabindex="-1"
      @click="emit('textClick', $event)"
    >
      {{ text }}
    </a>
  </p>
  <button
    v-if="canToggle"
    type="button"
    class="moment-card__desc-toggle"
    :aria-controls="id"
    :aria-expanded="expanded"
    @click.stop="toggle"
  >
    {{ t(expanded ? 'moment_card.collapse_text' : 'moment_card.expand_text') }}
    <span
      :class="expanded ? 'i-mingcute:up-line' : 'i-mingcute:down-line'"
      aria-hidden="true"
    />
  </button>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__desc {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 7;
  white-space: pre-wrap;
  word-break: break-word;
}

.moment-card__desc.moment-card__desc--expanded {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
}

.moment-card__text-link {
  @include mixins.interactive-layer;
  @include mixins.text-link;
}

.moment-card__desc-toggle {
  @include mixins.interactive-layer;
  @include mixins.desc-toggle;
}
</style>
