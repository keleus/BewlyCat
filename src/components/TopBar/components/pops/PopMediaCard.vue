<script setup lang="ts">
/**
 * 顶栏各弹窗（稍后再看 / 收藏 / 历史 / 动态）共用的横向媒体卡。
 * 只负责统一骨架：16:9 封面框 + 标题 + 作者行与角标插槽；
 * 业务差异（删除钮、进度、直播角标、稍后再看按钮、头像作者行等）一律走插槽。
 *
 * 注意：
 * - 四个弹窗的原始布局都是封面在左；封面列常驻底色为 --bew-skeleton。
 * - 本组件只渲染 <section> 骨架，外层卡片链接（<a>）由各弹窗提供，
 *   必须显式块级化（ALink 上加 block）：inline 的 a 包 flex 子元素时
 *   padding 失效且 hover 背景只在左上角行盒局部绘制。
 */
withDefaults(defineProps<{
  title: string
  /** 已由调用方加工好的封面图 URL（含 @尺寸后缀） */
  cover: string
  alt?: string
  /** 作者名；与 authorHref 同时提供时渲染默认作者链接行 */
  authorName?: string
  authorHref?: string
  /** 窄封面 120px（收藏 / 动态）；默认 160px（稍后再看 / 历史） */
  narrow?: boolean
  /** 交叉轴拉伸（动态弹窗需要文案区与封面列同高，把作者行压到底部） */
  stretch?: boolean
  /** 封面图按 contain 展示（历史的专栏封面） */
  contain?: boolean
  /** 追加到封面列 / 文案区 / 标题的自定义类 */
  coverClass?: string
  copyClass?: string
  titleClass?: string
}>(), {
  alt: '',
  narrow: false,
  stretch: false,
  contain: false,
})
</script>

<template>
  <section
    flex="~ gap-4"
    :items="stretch ? 'stretch' : 'start'"
  >
    <!-- 封面列（默认在左；DOM 顺序与各弹窗原始结构保持一致） -->
    <div
      class="bew-top-bar-media-column"
      :class="[coverClass, {
        'bew-top-bar-media-column--narrow': narrow,
      }]"
      bg="$bew-skeleton"
      pos="relative"
      of="hidden"
    >
      <!-- 左上 / 右上操作覆盖层：封面列直接子级（与各弹窗原始结构一致）；
           操作按钮的文字提示走 Tooltip floating 模式，不受封面列 overflow:hidden 裁切 -->
      <slot name="coverTopLeft" />
      <slot name="coverTopRight" />

      <div class="bew-top-bar-media-frame">
        <img
          w-full h-full
          :src="cover"
          :alt="alt || title"
          object-cover
          :bg="contain ? 'contain' : undefined"
          loading="lazy"
          decoding="async"
        >

        <!-- 封面框内覆盖角标（时长 / 进度 / 直播状态，各自绝对定位） -->
        <slot name="coverOverlay" />
      </div>

      <!-- 封面框下方内容（如观看进度条） -->
      <slot name="coverBelow" />
    </div>

    <!-- 文案区 -->
    <div class="bew-top-bar-media-copy" :class="copyClass">
      <h3
        :title="title"
        class="bew-top-bar-media-title"
        :class="titleClass"
      >
        {{ title }}
      </h3>

      <!-- 动态等弹窗需要完全自定义作者行（头像 / 联合投稿 / 时间） -->
      <slot name="byline">
        <div
          v-if="authorName"
          text="$bew-text-2"
          m="t-2"
          flex="~ items-center min-w-0"
        >
          <ALink
            :href="authorHref"
            type="topBar"
            :stop-propagation="true"
            class="bew-top-bar-media-author"
          >
            {{ authorName }}
          </ALink>
          <!-- 作者行尾部追加内容（如历史直播中的 LIVE 标记） -->
          <slot name="bylineExtra" />
        </div>
      </slot>

      <!-- 作者行下方补充信息（如历史的观看时间） -->
      <slot name="meta" />
    </div>
  </section>
</template>
