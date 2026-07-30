<script setup lang="ts">
import { computed, ref } from 'vue'

import { settings } from '~/logic'
import { calcTimeSince, numFormatter } from '~/utils/dataFormatter'

import VideoWatchedTag from '../../VideoWatchedTag.vue'
import type { Video } from '../types'
import { getTagSearchUrl } from '../utils'
import VideoCardAuthorAvatar from '../VideoCardAuthor/components/VideoCardAuthorAvatar.vue'
import VideoCardAuthorName from '../VideoCardAuthor/components/VideoCardAuthorName.vue'

interface Props {
  skeleton?: boolean
  video?: Video
  layout: 'modern' | 'old'
  horizontal?: boolean
  videoUrl?: string
  moreBtn: boolean
  showVideoOptions: boolean
  titleFontSizeClass: string
  titleStyle: Record<string, string | number>
  authorFontSizeClass: string
  metaFontSizeClass: string
  highlightTags: string[]
  hideAuthor?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  moreBtnClick: [event: MouseEvent]
}>()

const moreBtnRef = ref<HTMLDivElement | null>(null)

defineExpose({
  moreBtnRef,
})

const MAX_LEADING_TAG_COUNT = 2

// 将卡片内容开关集中到单个响应式计算，避免每张卡片为同一组设置创建大量 computed。
const content = computed(() => {
  const video = props.video
  const currentSettings = settings.value
  const rawTag = video?.tag
  const primaryTags = !rawTag
    ? []
    : Array.isArray(rawTag)
      ? rawTag.filter(Boolean)
      : [rawTag]
  const visiblePrimaryTags = currentSettings.showVideoCardVideoTag
    ? primaryTags.slice(0, MAX_LEADING_TAG_COUNT)
    : []
  const remainingHighlightCount = MAX_LEADING_TAG_COUNT - visiblePrimaryTags.length
  const visibleHighlightTags = currentSettings.showVideoCardRecommendTag && remainingHighlightCount > 0
    ? props.highlightTags.slice(0, remainingHighlightCount)
    : []
  const authorAvatarEnabled = !props.hideAuthor && currentSettings.showVideoCardAuthorAvatar
  const authorNameEnabled = !props.hideAuthor && currentSettings.showVideoCardAuthorName
  const showAuthorAvatar = authorAvatarEnabled && Boolean(video?.author)
  const showAuthorName = authorNameEnabled && Boolean(video?.author)
  const showPublishTime = currentSettings.showVideoCardPublishTime
    && (Boolean(video?.publishedTimestamp) || Boolean(video?.capsuleText))
  const showVideoType = video?.type === 'vertical' || video?.type === 'bangumi'
  const showLegacyViewCount = currentSettings.showVideoCardViewCount
    && (Boolean(video?.view) || Boolean(video?.viewStr))
  const showLegacyDanmakuCount = currentSettings.showVideoCardDanmakuCount
    && (Boolean(video?.danmaku) || Boolean(video?.danmakuStr))
  const metaPlaceholderEnabled = currentSettings.showVideoCardVideoTag
    || currentSettings.showVideoCardRecommendTag
    || currentSettings.showVideoCardPublishTime
    || Boolean(video?.type)
  const statsPlaceholderEnabled = currentSettings.showVideoCardViewCount
    || currentSettings.showVideoCardDanmakuCount
  const hasVisibleMeta = visiblePrimaryTags.length > 0
    || visibleHighlightTags.length > 0
    || showPublishTime
    || showVideoType

  return {
    authorAvatarEnabled,
    authorNameEnabled,
    hasLegacyStats: showLegacyViewCount || showLegacyDanmakuCount,
    hasVisibleMeta,
    isModernLayout: props.layout === 'modern',
    metaPlaceholderEnabled,
    showAuthorAvatar,
    showAuthorName,
    showLegacyDanmakuCount,
    showLegacyViewCount,
    showPublishTime,
    showVideoType,
    showWatchedBadge: currentSettings.showVideoWatchedBadge && !video?.roomid,
    statsPlaceholderEnabled,
    visibleHighlightTags,
    visiblePrimaryTags,
  }
})
</script>

<template>
  <div
    :style="{
      width: horizontal ? '100%' : 'unset',
      marginTop: horizontal ? '0' : content.isModernLayout ? '0.5rem' : '1rem',
    }"
    flex="~"
  >
    <!-- Skeleton mode -->
    <template v-if="skeleton">
      <!-- Old layout skeleton: Avatar on left -->
      <div
        v-if="layout === 'old' && !horizontal && content.authorAvatarEnabled"
        m="r-4" w="34px" h="34px" rounded="1/2" bg="$bew-skeleton"
        shrink-0
      />

      <div class="group/desc" flex="~ col" :class="content.isModernLayout ? 'gap-2' : ''" w="full" align="items-start">
        <!-- Title skeleton -->
        <div flex="~ gap-1 justify-between items-start" w="full">
          <!-- 使用与真实标题完全相同的样式和高度 -->
          <div
            class="keep-two-lines" :class="[
              content.isModernLayout ? 'w-[calc(100%-40px)]' : 'w-full',
              content.isModernLayout ? 'video-card-title' : '',
            ]"
            :style="titleStyle"
            text="overflow-ellipsis $bew-text-1 lg"
          >
            <!-- 使用与真实文本相同的行高填充，考虑 line-height -->
            <div w-full bg="$bew-skeleton" rounded="$bew-radius-sm" style="height: 1em; margin-bottom: calc((var(--bew-title-line-height, 1.35) - 1) * 0.5em);" />
            <div w="3/4" bg="$bew-skeleton" rounded="$bew-radius-sm" style="height: 1em;" />
          </div>
          <div
            v-if="content.isModernLayout" shrink-0 w-8 h-8 rounded="1/2"
            bg="$bew-skeleton"
          />
        </div>

        <!-- Modern layout: Author info skeleton -->
        <div
          v-if="layout === 'modern' && (content.authorAvatarEnabled || content.authorNameEnabled)"
          class="video-card-meta"
          flex="~ gap-2 items-center"
          w="full"
        >
          <div
            v-if="content.authorAvatarEnabled"
            w="34px" h="34px" rounded="1/2" bg="$bew-skeleton" shrink-0
          />
          <div v-if="content.authorNameEnabled || content.metaPlaceholderEnabled" flex="~ col gap-1" w="[calc(100%-50px)]">
            <!-- 作者名称骨架：使用与真实文本相同的字体大小和行高 -->
            <div
              v-if="content.authorNameEnabled"
              w="60%" bg="$bew-skeleton" rounded="$bew-radius-sm"
              :class="authorFontSizeClass"
              style="height: 1em;"
            />
            <!-- 标签骨架：使用与真实标签相同的高度，包括 padding -->
            <div
              v-if="content.metaPlaceholderEnabled"
              w="80%" bg="$bew-skeleton" rounded="$bew-radius-sm"
              :class="metaFontSizeClass"
              style="height: calc(1em + 0.24em);"
            />
          </div>
        </div>

        <!-- Modern layout with hideAuthor: Tags skeleton -->
        <div
          v-if="layout === 'modern' && !content.authorAvatarEnabled && !content.authorNameEnabled && content.metaPlaceholderEnabled"
          class="video-card-meta-row"
          flex="~ items-center gap-2"
          :class="metaFontSizeClass"
        >
          <div
            w="60px" bg="$bew-skeleton" rounded="$bew-radius"
            style="height: calc(1em + 0.24em);"
          />
        </div>

        <!-- Old layout: Info skeleton -->
        <template v-else-if="layout === 'old'">
          <!-- Old layout with hideAuthor: Only tags skeleton -->
          <div
            v-if="hideAuthor && content.metaPlaceholderEnabled"
            mt-2
            flex="~ gap-1"
            :class="metaFontSizeClass"
          >
            <div
              bg="$bew-skeleton" rounded="$bew-radius"
              lh-6 p="x-2" w="60px"
              style="height: calc(1em + 0.24em);"
            />
          </div>

          <!-- Old layout with author info: Full skeleton -->
          <template v-else-if="!hideAuthor">
            <!-- Author name skeleton -->
            <div
              v-if="content.authorNameEnabled || (horizontal && content.authorAvatarEnabled)"
              text="$bew-text-2"
              w-fit
              m="t-2"
              flex="~ items-center"
              :class="authorFontSizeClass"
            >
              <!-- Horizontal mode avatar -->
              <div
                v-if="horizontal && content.authorAvatarEnabled"
                w="34px" h="34px" rounded="1/2" bg="$bew-skeleton"
                shrink-0 m-r-2
              />
              <div v-if="content.authorNameEnabled" w="100px" bg="$bew-skeleton" rounded="$bew-radius-sm" style="height: 1em;" />
            </div>

            <!-- View & Danmaku skeleton -->
            <div v-if="content.statsPlaceholderEnabled" flex="~ items-center gap-1">
              <div
                :class="metaFontSizeClass"
                text="$bew-text-2"
              >
                <div w="150px" bg="$bew-skeleton" rounded="$bew-radius-sm" style="height: 1em; display: inline-block;" />
              </div>
            </div>

            <!-- Tags skeleton -->
            <div
              v-if="content.metaPlaceholderEnabled"
              mt-2
              flex="~ gap-1"
              :class="metaFontSizeClass"
            >
              <div
                bg="$bew-skeleton" rounded="$bew-radius"
                lh-6 p="x-2" w="60px"
                style="height: calc(1em + 0.24em);"
              />
            </div>
          </template>
        </template>
      </div>
    </template>

    <!-- Normal mode -->
    <template v-else-if="video">
      <!-- Old layout: Author Avatar (left side) -->
      <VideoCardAuthorAvatar
        v-if="layout === 'old' && !horizontal && content.showAuthorAvatar && video.author"
        :author="video.author"
        :is-live="video.liveStatus === 1"
      />

      <div class="group/desc" flex="~ col" :class="content.isModernLayout ? 'gap-2' : ''" w="full" align="items-start">
        <div flex="~ gap-1 justify-between items-start" w="full" pos="relative">
          <h3
            :class="[
              video.liveStatus === 1 ? 'keep-one-line' : 'keep-two-lines',
              content.isModernLayout ? 'video-card-title' : '',
              titleFontSizeClass,
            ]"
            text="overflow-ellipsis $bew-text-1"
            :style="titleStyle"
            cursor="pointer"
            :title="video.title"
          >
            <a :href="videoUrl" target="_blank">
              <VideoWatchedTag
                v-if="content.showWatchedBadge"
                :aid="video.aid ?? video.id"
                :bvid="video.bvid"
              />
              {{ video.title }}
            </a>
          </h3>

          <div
            v-if="moreBtn"
            ref="moreBtnRef"
            class="video-card__more-btn"
            :class="[
              { 'more-active': showVideoOptions },
              content.isModernLayout ? 'overflow-hidden rounded-full' : '',
            ]"
            bg="hover:$bew-fill-2 active:$bew-fill-3"
            shrink-0 w-32px h-32px m="t--3px r--4px"
            grid place-items-center cursor-pointer rounded="50%"
            @click.stop.prevent="emit('moreBtnClick', $event)"
          >
            <div i-mingcute:more-2-line text="lg" />
          </div>
        </div>

        <!-- Modern layout with hideAuthor: Tags directly under title -->
        <div
          v-if="layout === 'modern' && !content.showAuthorAvatar && !content.showAuthorName && content.hasVisibleMeta"
          class="video-card-meta-row"
          flex="~ items-center gap-2 wrap"
          :class="metaFontSizeClass"
        >
          <a
            v-for="primaryTag in content.visiblePrimaryTags"
            :key="`primary-${primaryTag}`"
            class="video-card-meta__chip"
            un-text="$bew-theme-color"
            p="x-2"
            lh-6
            rounded="$bew-radius"
            bg="$bew-theme-color-20 hover:$bew-theme-color-30"
            :href="getTagSearchUrl(primaryTag)"
            target="_blank"
            @click.stop=""
          >
            {{ primaryTag }}
          </a>

          <span
            v-for="extraTag in content.visibleHighlightTags"
            :key="`highlight-${extraTag}`"
            class="video-card-meta__chip"
            text="$bew-theme-color"
            p="x-2"
            lh-6
            rounded="$bew-radius"
            bg="$bew-theme-color-20"
          >
            {{ extraTag }}
          </span>

          <span
            v-if="content.showPublishTime"
            class="video-card-meta__chip"
            bg="$bew-fill-1"
            p="x-2"
            lh-6
            rounded="$bew-radius"
            text="$bew-text-3"
          >
            {{ video.publishedTimestamp ? calcTimeSince(video.publishedTimestamp * 1000) : video.capsuleText?.trim() }}
          </span>

          <span
            v-if="content.showVideoType"
            text="$bew-text-2"
            grid="~ place-items-center"
          >
            <div v-if="video.type === 'vertical'" i-mingcute:cellphone-2-line />
            <div v-else-if="video.type === 'bangumi'" i-mingcute:movie-line />
          </span>
        </div>

        <!-- Modern layout: Author info -->
        <div
          v-if="layout === 'modern' && (content.showAuthorAvatar || content.showAuthorName)"
          class="video-card-meta"
          flex="~ gap-2 items-center"
          w="full"
        >
          <VideoCardAuthorAvatar
            v-if="content.showAuthorAvatar && video.author"
            :author="video.author"
            :is-live="video.liveStatus === 1"
            compact
          />

          <div v-if="content.showAuthorName || content.hasVisibleMeta" flex="~ col gap-1" w="full">
            <div
              v-if="content.showAuthorName"
              flex="~ items-center gap-2"
              text="$bew-text-2"
              :class="authorFontSizeClass"
            >
              <VideoCardAuthorName :author="video.author" />
            </div>

            <div
              v-if="content.hasVisibleMeta"
              class="video-card-meta-row"
              flex="~ items-center gap-2 wrap"
              :class="metaFontSizeClass"
            >
              <a
                v-for="primaryTag in content.visiblePrimaryTags"
                :key="`primary-${primaryTag}`"
                class="video-card-meta__chip"
                un-text="$bew-theme-color"
                p="x-2"
                lh-6
                rounded="$bew-radius"
                bg="$bew-theme-color-20 hover:$bew-theme-color-30"
                :href="getTagSearchUrl(primaryTag)"
                target="_blank"
                @click.stop=""
              >
                {{ primaryTag }}
              </a>

              <span
                v-for="extraTag in content.visibleHighlightTags"
                :key="`highlight-${extraTag}`"
                class="video-card-meta__chip"
                text="$bew-theme-color"
                p="x-2"
                lh-6
                rounded="$bew-radius"
                bg="$bew-theme-color-20"
              >
                {{ extraTag }}
              </span>

              <span
                v-if="content.showPublishTime"
                class="video-card-meta__chip"
                bg="$bew-fill-1"
                p="x-2"
                lh-6
                rounded="$bew-radius"
                text="$bew-text-3"
              >
                {{ video.publishedTimestamp ? calcTimeSince(video.publishedTimestamp * 1000) : video.capsuleText?.trim() }}
              </span>

              <span
                v-if="content.showVideoType"
                text="$bew-text-2"
                grid="~ place-items-center"
              >
                <div v-if="video.type === 'vertical'" i-mingcute:cellphone-2-line />
                <div v-else-if="video.type === 'bangumi'" i-mingcute:movie-line />
              </span>
            </div>
          </div>
        </div>

        <!-- Old layout: Traditional info display -->
        <template v-else-if="layout === 'old'">
          <!-- Old layout with hideAuthor: Only tags -->
          <div
            v-if="hideAuthor && content.hasVisibleMeta"
            class="video-card-meta-row"
            mt-2
            flex="~ gap-1 wrap"
            :class="metaFontSizeClass"
          >
            <!-- Tag -->
            <a
              v-for="primaryTag in content.visiblePrimaryTags"
              :key="`legacy-primary-${primaryTag}`"
              un-text="$bew-theme-color" lh-6 p="x-2" rounded="$bew-radius" bg="$bew-theme-color-20 hover:$bew-theme-color-30"
              :href="getTagSearchUrl(primaryTag)"
              target="_blank"
              @click.stop=""
            >
              {{ primaryTag }}
            </a>
            <span
              v-for="extraTag in content.visibleHighlightTags"
              :key="`highlight-${extraTag}`"
              text="$bew-theme-color"
              lh-6
              p="x-2"
              rounded="$bew-radius"
              bg="$bew-theme-color-20"
            >
              {{ extraTag }}
            </span>
            <span
              v-if="content.showPublishTime"
              bg="$bew-fill-1" p="x-2" rounded="$bew-radius" text="$bew-text-3" lh-6
              mr-1
            >
              {{ video.publishedTimestamp ? calcTimeSince(video.publishedTimestamp * 1000) : video.capsuleText?.trim() }}
            </span>
            <!-- Video type -->
            <span v-if="content.showVideoType" text="$bew-text-2" grid="~ place-items-center">
              <div v-if="video.type === 'vertical'" i-mingcute:cellphone-2-line />
              <div v-else-if="video.type === 'bangumi'" i-mingcute:movie-line />
            </span>
          </div>

          <!-- Old layout with author info -->
          <template v-else>
            <div
              v-if="content.showAuthorName || (horizontal && content.showAuthorAvatar)"
              text="$bew-text-2"
              w-fit
              m="t-2"
              flex="~ items-center wrap"
              :class="authorFontSizeClass"
            >
              <!-- Author Avatar (horizontal mode) -->
              <span
                :style="{
                  marginBottom: horizontal ? '0.5rem' : '0',
                }"
                flex="inline items-center"
              >
                <VideoCardAuthorAvatar
                  v-if="horizontal && content.showAuthorAvatar && video.author"
                  :author="video.author"
                  :is-live="video.liveStatus === 1"
                />
                <VideoCardAuthorName
                  v-if="content.showAuthorName"
                  :author="video.author"
                />
              </span>
            </div>

            <div v-if="content.hasLegacyStats" flex="~ items-center gap-1 wrap">
              <!-- View & Danmaku Count -->
              <div
                text="$bew-text-2"
                rounded="$bew-radius"
                inline-block
                :class="metaFontSizeClass"
              >
                <span v-if="content.showLegacyViewCount">
                  {{ video.view ? $t('common.view', { count: numFormatter(video.view) }, video.view) : `${numFormatter(video.viewStr || '0')}${$t('common.viewWithoutNum')}` }}
                </span>
                <template v-if="content.showLegacyDanmakuCount">
                  <span v-if="content.showLegacyViewCount" text-xs font-light mx-4px>•</span>
                  <span>{{ video.danmaku ? $t('common.danmaku', { count: numFormatter(video.danmaku) }, video.danmaku) : `${numFormatter(video.danmakuStr || '0')}${$t('common.danmakuWithoutNum')}` }}</span>
                </template>
                <br>
              </div>
            </div>

            <div
              v-if="content.hasVisibleMeta"
              class="video-card-meta-row"
              mt-2
              flex="~ gap-1 wrap"
              :class="metaFontSizeClass"
            >
              <!-- Tag -->
              <a
                v-for="primaryTag in content.visiblePrimaryTags"
                :key="`legacy-primary-${primaryTag}`"
                un-text="$bew-theme-color" lh-6 p="x-2" rounded="$bew-radius" bg="$bew-theme-color-20 hover:$bew-theme-color-30"
                :href="getTagSearchUrl(primaryTag)"
                target="_blank"
                @click.stop=""
              >
                {{ primaryTag }}
              </a>
              <span
                v-for="extraTag in content.visibleHighlightTags"
                :key="`highlight-${extraTag}`"
                text="$bew-theme-color"
                lh-6
                p="x-2"
                rounded="$bew-radius"
                bg="$bew-theme-color-20"
              >
                {{ extraTag }}
              </span>
              <span
                v-if="content.showPublishTime"
                bg="$bew-fill-1" p="x-2" rounded="$bew-radius" text="$bew-text-3" lh-6
                mr-1
              >
                {{ video.publishedTimestamp ? calcTimeSince(video.publishedTimestamp * 1000) : video.capsuleText?.trim() }}
              </span>
              <!-- Video type -->
              <span v-if="content.showVideoType" text="$bew-text-2" grid="~ place-items-center">
                <div v-if="video.type === 'vertical'" i-mingcute:cellphone-2-line />
                <div v-else-if="video.type === 'bangumi'" i-mingcute:movie-line />
              </span>
            </div>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.video-card-title {
  &.keep-two-lines {
    min-height: calc(var(--bew-title-line-height, 1.35) * 2em);
  }
  &.keep-one-line {
    min-height: auto;
  }
}

.video-card__more-btn {
  position: relative;
  border-radius: 50%;
  overflow: hidden;
  transition:
    opacity var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease),
    background-color var(--bew-duration-moderate, 300ms) var(--bew-ease-standard, ease);
}

.video-card__more-btn::before,
.video-card__more-btn::after {
  border-radius: inherit;
}

.more-active {
  --uno: "opacity-100";
}

.video-card-meta {
  min-height: 46px;
  max-height: 46px;
  overflow: hidden;
}

.video-card-meta > div:last-child {
  min-width: 0;
}

.video-card-meta > div:last-child > div:last-child {
  flex-wrap: nowrap;
  overflow: hidden;
  max-width: 100%;
}

.video-card-meta-row {
  flex-wrap: nowrap;
  overflow: hidden;
  max-width: 100%;
  min-height: 24px;
  max-height: 24px;
}

.video-card-meta__chip {
  display: inline-flex;
  align-items: center;
  font-size: inherit;
  line-height: inherit;
  padding-block: calc(var(--bew-base-font-size) * 0.12);
  flex: 0 0 auto;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
