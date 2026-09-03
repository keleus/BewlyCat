<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { CommentReplyAvatarAnchor, CommentReplyTreeBranch } from '~/utils/commentReplyTree'
import { getCommentReplyBranchExpandedToggleY, getCommentReplyBranchPath, getCommentReplyBranchToggleY } from '~/utils/commentReplyTree'

import type { CommentRow, PreviewComment } from './commentPreview'

const props = defineProps<{ rows: CommentRow[], enabled: boolean }>()
const emit = defineEmits<{ toggle: [comment: PreviewComment] }>()
const { t } = useI18n()
const container = ref<HTMLElement>()
const indentStep = ref(24)
const guides = ref<Array<{ row: CommentRow, path: string, x: number, y: number }>>([])
const size = ref({ width: 1, height: 1 })
const toggleOffsets = new Map<string, number>()
let frame = 0

function updateGuides() {
  frame = 0
  const element = container.value
  if (!element)
    return
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height)
    return
  const depth = Math.max(1, ...props.rows.map(row => Math.min(row.depth, 10)))
  // 与原生评论相同：优先保留正文宽度，同时给父子头像之间的圆弧留出空间。
  const step = Math.max(16, Math.min(24, Math.floor((rect.width - 150 - 36) / depth)))
  if (indentStep.value !== step) {
    indentStep.value = step
    return
  }
  if (size.value.width !== rect.width || size.value.height !== rect.height)
    size.value = { width: rect.width, height: rect.height }
  if (!props.enabled) {
    if (guides.value.length)
      guides.value = []
    return
  }

  const anchors = new Map<string, CommentReplyAvatarAnchor>()
  for (const rowElement of Array.from(element.querySelectorAll<HTMLElement>('[data-comment-id]'))) {
    const avatar = rowElement.querySelector<HTMLElement>('[data-comment-avatar]')
    if (!avatar)
      continue
    const avatarRect = avatar.getBoundingClientRect()
    const footer = rowElement.querySelector('footer')?.getBoundingClientRect()
    const row = props.rows.find(row => row.comment.id === rowElement.dataset.commentId)
    const centerY = avatarRect.top + avatarRect.height / 2 - rect.top
    anchors.set(rowElement.dataset.commentId!, {
      bottom: row?.hideBody ? centerY : avatarRect.bottom - rect.top,
      centerX: avatarRect.left + avatarRect.width / 2 - rect.left,
      centerY,
      left: avatarRect.left - rect.left,
      toggleY: footer ? footer.top + footer.height / 2 - rect.top : centerY,
    })
  }
  const nextGuides: typeof guides.value = []
  for (const row of props.rows) {
    const parentAnchor = anchors.get(row.comment.id)
    if (!row.hasChildren || !parentAnchor)
      continue
    const childAnchors = props.rows
      .filter(child => child.parentId === row.comment.id)
      .map(child => anchors.get(child.comment.id))
      .filter((anchor): anchor is CommentReplyAvatarAnchor => Boolean(anchor && anchor.left > parentAnchor.centerX))
    const branch: CommentReplyTreeBranch = {
      key: row.comment.id,
      parentAuthorName: row.comment.author,
      parentAnchor,
      childAnchors,
      collapsed: row.collapsed,
      collapseParentBody: row.hideBody,
    }
    if (!row.collapsed)
      toggleOffsets.set(row.comment.id, getCommentReplyBranchExpandedToggleY(parentAnchor, childAnchors, 12) - parentAnchor.bottom)
    const offset = toggleOffsets.get(row.comment.id)
    const cachedY = offset === undefined ? undefined : parentAnchor.bottom + offset
    const path = getCommentReplyBranchPath(branch, 12, 12, cachedY)
    if (path)
      nextGuides.push({ row, path, x: parentAnchor.centerX, y: getCommentReplyBranchToggleY(branch, 12, cachedY) })
  }
  // onUpdated 同时覆盖插槽内的属地/性别、图片、换行变化；几何不变时不触发下一轮更新。
  const geometry = (items: typeof guides.value) => items.map(guide => [guide.row.comment.id, guide.row.collapsed, guide.path, guide.x, guide.y])
  if (JSON.stringify(geometry(nextGuides)) !== JSON.stringify(geometry(guides.value)))
    guides.value = nextGuides
}

function scheduleGuides() {
  if (!frame)
    frame = requestAnimationFrame(updateGuides)
}

useResizeObserver(container, scheduleGuides)
watch(() => [props.rows, props.enabled], scheduleGuides, { deep: true, flush: 'post' })
onMounted(scheduleGuides)
onUpdated(scheduleGuides)
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <section
    ref="container"
    class="moment-comment-tree"
    :style="{ '--bew-comment-reply-indent-step': `${indentStep}px` }"
    @load.capture="scheduleGuides"
  >
    <slot />
    <svg
      v-if="enabled"
      class="bewly-comment-reply-tree-guides"
      :viewBox="`0 0 ${size.width} ${size.height}`"
      preserveAspectRatio="none"
      focusable="false"
    >
      <g
        v-for="guide in guides"
        :key="guide.row.comment.id"
        class="bewly-comment-reply-branch"
        role="button"
        tabindex="0"
        :aria-expanded="!guide.row.collapsed"
        :aria-label="t(guide.row.collapsed ? 'moment_card.expand_comment_thread' : 'moment_card.collapse_comment_thread')"
        @click.stop.prevent="emit('toggle', guide.row.comment)"
        @keydown.enter.stop.prevent="emit('toggle', guide.row.comment)"
        @keydown.space.stop.prevent="emit('toggle', guide.row.comment)"
      >
        <path class="bewly-comment-reply-branch__line" :d="guide.path" />
        <path class="bewly-comment-reply-branch__hit" :d="guide.path" />
        <circle class="bewly-comment-reply-branch__node-hit" :cx="guide.x" :cy="guide.y" r="12" />
        <circle class="bewly-comment-reply-branch__focus" :cx="guide.x" :cy="guide.y" r="10" />
        <circle class="bewly-comment-reply-branch__node" :cx="guide.x" :cy="guide.y" r="6" />
        <path
          class="bewly-comment-reply-branch__symbol"
          :d="`M ${guide.x - 3} ${guide.y} H ${guide.x + 3}${guide.row.collapsed ? ` M ${guide.x} ${guide.y - 3} V ${guide.y + 3}` : ''}`"
        />
      </g>
    </svg>
  </section>
</template>

<style src="../../styles/commentReplyTree.scss" lang="scss" />

<style scoped lang="scss">
.moment-comment-tree {
  position: relative;
  --bg1: var(--bew-elevated);
}
</style>
