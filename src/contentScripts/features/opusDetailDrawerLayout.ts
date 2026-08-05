import { Icon } from '@iconify/vue'
import { createVNode, render } from 'vue'
import browser from 'webextension-polyfill'

import { isInIframe } from '~/utils/main'

const SPLIT_FLAG = 'bewlyOpusSplit'
const READY_FLAG = 'bewlyOpusReady'
const LAYOUT_MODE_FLAG = 'bewlyOpusLayoutMode'
const LAYOUT_READY_MSG = 'BEWLY_OPUS_LAYOUT_READY'

/** 只从相册/图文主图容器抽图，避免评论、游戏推荐等杂图 */
const ALBUM_SELECTORS = [
  '.horizontal-scroll-album',
  '.bili-album',
  '.opus-module-top__album__cover',
  '.opus-module-top__album__scroll',
  '.bili-dyn-gallery__window',
  '.opus-pic-view',
  '.bili-album__watch',
  '.opus-module-top',
].join(',')

/** 优先使用真正的相册容器；cover 通常只是相册里的缩略/占位节点 */
const PRIMARY_ALBUM_SELECTORS = [
  '.horizontal-scroll-album',
  '.bili-album',
  '.opus-module-top__album__scroll',
  '.bili-dyn-gallery__window',
  '.opus-pic-view',
  '.bili-album__watch',
].join(',')

const CONTENT_READY_SELECTORS = [
  '.opus-module-author',
  '.opus-module-content',
  '.opus-module-title',
  '.author-info',
  '.bili-comment-container',
  '.horizontal-scroll-album',
  '.bili-album',
  '.opus-module-top__album__cover',
].join(',')

/** 明确排除的非图文区域 */
const EXCLUDE_FROM_MEDIA = [
  '.bili-comment-container',
  '.reply-item',
  '.sub-reply-item',
  '.opus-module-stat',
  '.opus-module-bottom',
  '.opus-module-extend',
  '.bili-dyn-card-goods',
  '.bili-dyn-card-common',
  '.bili-dyn-card-reserve',
  '.bili-dyn-card-match',
  '.dyn-card',
  '.goods',
  '.additional-card',
  '.opus-additional',
  '.opus-module-additional',
  '.side-toolbar',
  '.right-sidebar-wrap',
  'header',
  'footer',
].join(',')

type LayoutMode = 'pending' | 'text' | 'article' | 'split' | 'disabled'

let observer: MutationObserver | null = null
let applyTimer: ReturnType<typeof setTimeout> | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let styleEl: HTMLStyleElement | null = null
let loadingEl: HTMLElement | null = null
let appliedSuccessfully = false
let layoutMode: LayoutMode = 'pending'
let disabledSplit = false
let teardownCount = 0
let lastMutationAt = 0
let stableTimer: ReturnType<typeof setTimeout> | null = null
let galleryViewerMessageHandler: ((e: MessageEvent) => void) | null = null
let galleryViewerAckTimer: ReturnType<typeof setTimeout> | null = null
let galleryIconHosts: HTMLElement[] = []
let layoutReadyNotified = false
let setupDomReadyListener: (() => void) | null = null
let setupRootReadyRetryTimer: number | null = null

const BASE_CSS = `
html.momentsPage.drawer.bewly-opus-layout #bili-header-container,
html.momentsPage.drawer.bewly-opus-layout .bili-header,
html.momentsPage.drawer.bewly-opus-layout #biliMainHeader,
html.momentsPage.drawer.bewly-opus-layout .right-sidebar-wrap,
html.momentsPage.drawer.bewly-opus-layout .side-toolbar,
html.momentsPage.drawer.bewly-opus-layout #app .bg,
html.momentsPage.drawer.bewly-opus-layout #app .bgc {
  display: none !important;
}
html.momentsPage.drawer.bewly-opus-layout,
html.momentsPage.drawer.bewly-opus-layout body {
  min-width: 0 !important;
  max-width: 100% !important;
  background: var(--bg1, #fff) !important;
}
html.momentsPage.drawer.bewly-opus-layout #app,
html.momentsPage.drawer.bewly-opus-layout #opus-detail-app {
  min-width: 0 !important;
  max-width: 100% !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
}
html.momentsPage.drawer.bewly-opus-layout,
html.momentsPage.drawer.bewly-opus-layout body {
  overflow-x: hidden !important;
}
html.momentsPage.drawer.bewly-opus-layout #app,
html.momentsPage.drawer.bewly-opus-layout #opus-detail-app,
html.momentsPage.drawer.bewly-opus-layout .opus-detail,
html.momentsPage.drawer.bewly-opus-layout .bili-opus-view,
html.momentsPage.drawer.bewly-opus-layout .bili-opus-view-wrap {
  overflow-x: hidden !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
/* 纯文字 / 未分栏：居中收窄 */
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-text-only .opus-detail,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-text-only .bili-opus-view,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-text-only .bili-opus-view-wrap,
html.momentsPage.drawer.bewly-opus-layout:not(.bewly-opus-split-ready):not(.bewly-opus-article-mode) .opus-detail,
html.momentsPage.drawer.bewly-opus-layout:not(.bewly-opus-split-ready):not(.bewly-opus-article-mode) .bili-opus-view,
html.momentsPage.drawer.bewly-opus-layout:not(.bewly-opus-split-ready):not(.bewly-opus-article-mode) .bili-opus-view-wrap {
  width: min(720px, 100%) !important;
  max-width: 100% !important;
  min-width: 0 !important;
  margin: 0 auto !important;
  box-sizing: border-box !important;
  padding: 12px 16px 32px !important;
}
/* 带目录的长文图文：整体收窄、禁止横向滚动，避免左侧目录被裁切/遮挡 */
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode body {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  height: auto !important;
  max-height: none !important;
}
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode #app,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode #opus-detail-app {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow-x: hidden !important;
}
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .opus-detail,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .bili-opus-view,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .bili-opus-view-wrap {
  width: min(860px, calc(100% - 20px)) !important;
  max-width: 100% !important;
  min-width: 0 !important;
  margin: 0 auto !important;
  padding: 12px 12px 40px !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
}
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode img,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode video,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode iframe,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode table {
  max-width: 100% !important;
}
/* 目录所在侧栏在 article 模式重新显示（基础样式里可能被隐藏） */
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .right-sidebar-wrap:has(.catalog, .catalog-panel, [class*="catalog"], [class*="Catalog"]),
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .right-side-bar:has(.catalog, .catalog-panel, [class*="catalog"], [class*="Catalog"]),
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .side-toolbar:has(.catalog, .catalog-panel, [class*="catalog"], [class*="Catalog"]) {
  display: block !important;
  visibility: visible !important;
  pointer-events: auto !important;
  z-index: 30 !important;
}
/* 目录本身：限制宽度、抬高层级，避免横向撑破 */
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .catalog,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .catalog-panel,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode [class*="catalog"],
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode [class*="Catalog"],
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode [class*="directory"],
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode [class*="Directory"] {
  display: block !important;
  visibility: visible !important;
  max-width: min(180px, 28vw) !important;
  z-index: 31 !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
}
/*
 * 新版专栏目录使用 fixed 定位，原站的 left 会在窄 iframe 中算成负值。
 * 不修改目录内部样式，仅为原生 240px 目录预留空间并修正横向位置。
 */
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .opus-detail:has(.opus-toc) {
  width: min(980px, calc(100% - 20px)) !important;
  padding: 12px 0 40px !important;
}
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .bili-opus-view-wrap:has(> .opus-toc) {
  width: min(708px, calc(100% - 264px)) !important;
  margin-right: 0 !important;
  margin-left: 264px !important;
  padding: 0 !important;
}
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .bili-opus-view-wrap:has(> .opus-toc) > .bili-opus-view {
  width: 100% !important;
  margin: 0 !important;
  padding: 12px 12px 40px !important;
}
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-article-mode .opus-toc {
  left: max(10px, calc((100vw - 980px) / 2 + 20px)) !important;
  right: auto !important;
}
.bewly-opus-iframe-loading {
  position: fixed !important;
  inset: 0 !important;
  z-index: 99999 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  background: var(--bew-bg, var(--bg1, #fff)) !important;
  color: var(--bew-text-2, var(--text2, #666)) !important;
  font-size: 13px !important;
  pointer-events: all !important;
  transition: opacity 0.18s ease !important;
}
.bewly-opus-iframe-loading.is-hide {
  opacity: 0 !important;
  pointer-events: none !important;
}
.bewly-opus-iframe-loading__icon {
  width: 36px !important;
  height: 36px !important;
  object-fit: contain !important;
  flex-shrink: 0 !important;
}
`

/** 左右 4:3；长图宽占满可纵向滚动 */
const SPLIT_CSS = `
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-split-ready,
html.momentsPage.drawer.bewly-opus-layout.bewly-opus-split-ready body {
  overflow: hidden !important;
  height: 100% !important;
  max-height: 100% !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split {
  position: fixed !important;
  inset: 0 !important;
  z-index: 20 !important;
  display: grid !important;
  grid-template-columns: minmax(0, 4fr) minmax(0, 3fr) !important;
  column-gap: 0 !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  background: var(--bg1, #fff) !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  justify-content: flex-start !important;
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  /* 外层不滚动；媒体区统一使用黑色舞台 */
  overflow: hidden !important;
  background: #000 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  background: #000 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery.is-viewer-hosted {
  visibility: hidden !important;
}
/* 仅大图 stage 纵向滚动：滚动条覆盖在图片上，不与缩略图同级 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage {
  position: absolute !important;
  inset: 0 !important;
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  /* 尽量 overlay，减少挤占图片宽度 */
  overflow-y: overlay !important;
  overscroll-behavior: contain !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none !important;
  scrollbar-color: transparent transparent !important;
  background: #000 !important;
  /* 永不预留 gutter：图片始终全宽 */
  scrollbar-gutter: auto !important;
  z-index: 1 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
  background: transparent !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage::-webkit-scrollbar-track {
  background: transparent !important;
  box-shadow: none !important;
  border: 0 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage::-webkit-scrollbar-thumb {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage::-webkit-scrollbar-corner {
  background: transparent !important;
}
/* 原生滚动条始终隐藏：悬停也不改 width，避免图片变窄 + 黑边轨道 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell:hover .bewly-opus-gallery__stage,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage.is-scrolling {
  scrollbar-width: none !important;
  scrollbar-color: transparent transparent !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage::-webkit-scrollbar,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell:hover .bewly-opus-gallery__stage::-webkit-scrollbar,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage.is-scrolling::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
  background: transparent !important;
}
/* 自定义覆盖滚动条：贴近系统原生外观，浮在大图右侧不占宽 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__scroll-rail {
  position: absolute !important;
  top: 8px !important;
  right: 2px !important;
  bottom: 64px !important;
  width: 11px !important;
  z-index: 8 !important;
  border-radius: 0 !important;
  background: transparent !important;
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity 0.15s ease !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell:hover .bewly-opus-gallery__scroll-rail.is-active,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell:focus-within .bewly-opus-gallery__scroll-rail.is-active,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__scroll-rail.is-scrolling.is-active {
  opacity: 1 !important;
  pointer-events: auto !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__scroll-thumb {
  position: absolute !important;
  top: 0 !important;
  left: 2px !important;
  width: 7px !important;
  min-height: 36px !important;
  border-radius: 999px !important;
  /* 黑色舞台上的原生感浅色滑块 */
  background: rgba(255, 255, 255, 0.34) !important;
  border: 0 !important;
  box-shadow: none !important;
  cursor: default !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__scroll-rail:hover .bewly-opus-gallery__scroll-thumb {
  background: rgba(255, 255, 255, 0.48) !important;
  width: 9px !important;
  left: 1px !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__scroll-thumb:active {
  cursor: default !important;
  background: rgba(255, 255, 255, 0.58) !important;
}
/* 横向平移滑轨：三页窗口（左/中/右），切换时整页平移 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__slider {
  position: absolute !important;
  inset: 0 !important;
  flex: none !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  background: #000 !important;
  z-index: 1 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__track {
  display: flex !important;
  width: 300% !important;
  height: 100% !important;
  will-change: transform !important;
  transform: translate3d(-33.3333%, 0, 0);
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__track.is-pos-left {
  transform: translate3d(0, 0, 0);
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__track.is-pos-center {
  transform: translate3d(-33.3333%, 0, 0);
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__track.is-pos-right {
  transform: translate3d(-66.6667%, 0, 0);
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__track.is-animating {
  transition: transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1) !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__slide {
  flex: 0 0 33.3333% !important;
  width: 33.3333% !important;
  height: 100% !important;
  min-width: 0 !important;
  position: relative !important;
  overflow: hidden !important;
  background: #000 !important;
}
/* 每页舞台：长图可纵向滚动 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage {
  position: absolute !important;
  inset: 0 !important;
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overflow-y: overlay !important;
  overscroll-behavior: contain !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none !important;
  scrollbar-color: transparent transparent !important;
  background: #000 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__image {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: none !important;
  margin: 0 auto !important;
  object-fit: contain !important;
  object-position: center top !important;
  border-radius: 0 !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
  pointer-events: auto !important;
  cursor: zoom-in !important;
  vertical-align: top !important;
}
/* 横图不需要纵向滚动，在左侧舞台内垂直居中展示 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage.is-landscape {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow-y: hidden !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage.is-landscape .bewly-opus-gallery__image {
  margin: 0 auto !important;
  object-position: center center !important;
}
/* 舞台壳：承载滑轨 + 固定悬浮切换按钮 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell {
  position: relative !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  background: #000 !important;
  display: block !important;
}
/* 左右切换：固定在图片可视区两侧，不随长图滚动；默认隐藏，悬停显示 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__nav-wrap {
  position: absolute !important;
  inset: 0 !important;
  z-index: 5 !important;
  pointer-events: none !important;
  opacity: 0 !important;
  transition: opacity 0.18s ease !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell:hover .bewly-opus-gallery__nav-wrap,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell:focus-within .bewly-opus-gallery__nav-wrap {
  opacity: 1 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__nav {
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  z-index: 5 !important;
  width: 36px !important;
  height: 36px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: rgba(0, 0, 0, 0.45) !important;
  color: #fff !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  font-size: 20px !important;
  line-height: 1 !important;
  padding: 0 !important;
  transition: background 0.15s ease, opacity 0.15s ease !important;
  pointer-events: auto !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__nav:hover {
  background: rgba(0, 0, 0, 0.72) !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__nav > svg,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav > svg {
  display: block !important;
  width: 18px !important;
  height: 18px !important;
  flex: 0 0 auto !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__nav:disabled {
  opacity: 0.28 !important;
  cursor: default !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__nav--prev {
  left: 10px !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__nav--next {
  right: 10px !important;
}
/* 缩略图直接悬浮在图片上；与左右切换按钮一样，仅在操作舞台时显示 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__footer {
  position: absolute !important;
  left: 12px !important;
  right: 64px !important;
  bottom: 8px !important;
  flex: none !important;
  display: flex !important;
  align-items: center !important;
  width: auto !important;
  min-width: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  z-index: 6 !important;
  opacity: 0 !important;
  transform: translateY(8px) !important;
  transition: opacity 0.18s ease, transform 0.18s ease !important;
  pointer-events: none !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell:hover .bewly-opus-gallery__footer,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__stage-shell:focus-within .bewly-opus-gallery__footer {
  opacity: 1 !important;
  transform: translateY(0) !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__footer > * {
  pointer-events: auto !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__thumbs {
  position: relative !important;
  flex: 1 1 auto !important;
  display: flex !important;
  gap: 8px !important;
  min-width: 0 !important;
  width: auto !important;
  padding: 2px 0 4px !important;
  box-sizing: border-box !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scrollbar-width: none !important;
  background: transparent !important;
  -webkit-overflow-scrolling: touch;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__thumbs:hover {
  scrollbar-width: thin !important;
  scrollbar-color: rgba(255, 255, 255, 0.4) transparent !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__thumbs::-webkit-scrollbar {
  height: 0 !important;
  background: transparent !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__thumbs:hover::-webkit-scrollbar {
  height: 5px !important;
  background: transparent !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__thumbs::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.35) !important;
  border-radius: 999px !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__counter {
  position: absolute !important;
  right: 12px !important;
  bottom: 12px !important;
  margin: 0 !important;
  padding: 4px 8px !important;
  border-radius: 999px !important;
  color: #fff !important;
  background: rgba(0, 0, 0, 0.42) !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25) !important;
  font-size: 12px !important;
  line-height: 1.2 !important;
  white-space: nowrap !important;
  z-index: 7 !important;
  pointer-events: none !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__thumb {
  flex: 0 0 auto !important;
  width: 44px !important;
  height: 44px !important;
  padding: 0 !important;
  border: 2px solid rgba(255, 255, 255, 0.55) !important;
  border-radius: 8px !important;
  overflow: hidden !important;
  background: rgba(0, 0, 0, 0.25) !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28) !important;
  cursor: pointer !important;
  opacity: 0.88 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__thumb.is-active {
  opacity: 1 !important;
  border-color: var(--bew-theme-color, var(--brand_pink, #fb7299)) !important;
  box-shadow: 0 0 0 1px var(--bew-theme-color, var(--brand_pink, #fb7299)) !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__thumb img {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__media .bewly-opus-gallery__source {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  pointer-events: none !important;
  opacity: 0 !important;
}
/* 图片查看器 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer {
  position: fixed !important;
  inset: 0 !important;
  z-index: 100000 !important;
  display: none !important;
  overflow: hidden !important;
  background: rgba(18, 18, 18, 0.72) !important;
  backdrop-filter: blur(14px) !important;
  -webkit-backdrop-filter: blur(14px) !important;
  color: #fff !important;
  touch-action: none !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer.is-open {
  display: block !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__stage {
  position: absolute !important;
  inset: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 24px 72px 96px !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__image {
  display: block !important;
  max-width: 100% !important;
  max-height: 100% !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
  transform-origin: center center !important;
  transition: transform 0.12s ease-out !important;
  cursor: zoom-in !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__image.is-zoomed {
  cursor: grab !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__image.is-dragging {
  cursor: grabbing !important;
  transition: none !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__close,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__tool {
  border: 0 !important;
  color: #fff !important;
  background: rgba(0, 0, 0, 0.48) !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__close:hover,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav:hover,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__tool:hover {
  background: rgba(0, 0, 0, 0.72) !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__close {
  position: absolute !important;
  top: 20px !important;
  left: 20px !important;
  z-index: 4 !important;
  width: 44px !important;
  height: 44px !important;
  border-radius: 50% !important;
  font-size: 28px !important;
  line-height: 1 !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav {
  position: absolute !important;
  top: 50% !important;
  z-index: 4 !important;
  width: 44px !important;
  height: 56px !important;
  border-radius: 10px !important;
  transform: translateY(-50%) !important;
  font-size: 32px !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav > svg {
  width: 24px !important;
  height: 24px !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav:disabled {
  display: none !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav--prev {
  left: 16px !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav--next {
  right: 16px !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__toolbar {
  position: absolute !important;
  left: 50% !important;
  bottom: 24px !important;
  z-index: 4 !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 8px 12px !important;
  border-radius: 999px !important;
  background: rgba(0, 0, 0, 0.55) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.28) !important;
  transform: translateX(-50%) !important;
  white-space: nowrap !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__tool {
  width: 34px !important;
  height: 34px !important;
  border-radius: 50% !important;
  background: transparent !important;
  font-size: 20px !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__counter,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__zoom {
  min-width: 48px !important;
  text-align: center !important;
  font-size: 13px !important;
  font-variant-numeric: tabular-nums !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__divider {
  width: 1px !important;
  height: 24px !important;
  margin: 0 4px !important;
  background: rgba(255, 255, 255, 0.24) !important;
}
@media (max-width: 640px) {
  html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__stage {
    padding: 68px 12px 92px !important;
  }
  html.momentsPage.drawer.bewly-opus-layout .bewly-opus-viewer__nav {
    top: auto !important;
    bottom: 24px !important;
    width: 36px !important;
    height: 42px !important;
    transform: none !important;
  }
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel {
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  background: var(--bg1, #fff) !important;
  padding: 12px 12px 28px !important;
  box-sizing: border-box !important;
  border-left: 1px solid rgba(0, 0, 0, 0.06) !important;
  -webkit-overflow-scrolling: touch;
}
/* 去掉正文与父级左右边距，贴齐右侧面板 */
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-detail,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .bili-opus-view,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-modules,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-module,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-module-content,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-paragraph-children,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-module-title,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-module-author,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-module-topic,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .bili-comment-container {
  max-width: 100% !important;
  width: 100% !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  box-sizing: border-box !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel img,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel video {
  max-width: 100% !important;
}
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .horizontal-scroll-album,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .bili-album,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-module-top__album__cover,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-module-top__album__scroll,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .bili-dyn-gallery__window,
html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel .opus-pic-view {
  display: none !important;
}
@media (max-width: 860px) {
  html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: minmax(220px, 48%) minmax(0, 1fr) !important;
  }
  html.momentsPage.drawer.bewly-opus-layout .bewly-opus-split__panel {
    border-left: 0 !important;
    border-top: 1px solid rgba(0, 0, 0, 0.08) !important;
  }
}
`

function isOpusDetailPage(url: string = location.href): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/opus\/\d+/.test(url)
    || /https?:\/\/t\.bilibili\.com\/\d+/.test(url)
}

function clearDeferredSetup() {
  if (setupDomReadyListener) {
    document.removeEventListener('DOMContentLoaded', setupDomReadyListener)
    setupDomReadyListener = null
  }

  if (setupRootReadyRetryTimer !== null) {
    window.clearTimeout(setupRootReadyRetryTimer)
    setupRootReadyRetryTimer = null
  }
}

function deferSetupUntilDocumentElementReady() {
  if (setupDomReadyListener || setupRootReadyRetryTimer !== null)
    return

  if (document.readyState === 'loading') {
    setupDomReadyListener = () => {
      setupDomReadyListener = null
      setupOpusDetailDrawerLayout()
    }
    document.addEventListener('DOMContentLoaded', setupDomReadyListener, { once: true })
    return
  }

  setupRootReadyRetryTimer = window.setTimeout(() => {
    setupRootReadyRetryTimer = null
    setupOpusDetailDrawerLayout()
  }, 0)
}

function ensureBaseClasses() {
  document.documentElement.classList.add(
    'momentsPage',
    'drawer',
    'bewly-opus-layout',
    'remove-top-bar-without-placeholder',
  )
}

function ensureStyles() {
  if (styleEl?.isConnected)
    return
  styleEl = document.createElement('style')
  styleEl.id = 'bewly-opus-drawer-layout'
  styleEl.textContent = `${BASE_CSS}\n${SPLIT_CSS}`
  document.documentElement.appendChild(styleEl)
}

function showIframeLoading(text = '正在整理动态详情…') {
  if (!loadingEl) {
    loadingEl = document.createElement('div')
    loadingEl.className = 'bewly-opus-iframe-loading'
    let iconHtml = ''
    try {
      const gifUrl = browser.runtime.getURL('/assets/loading.gif')
      iconHtml = `<img class="bewly-opus-iframe-loading__icon" src="${gifUrl}" alt="" aria-hidden="true">`
    }
    catch {
      // ignore extension url resolution failures
    }
    loadingEl.innerHTML = `${iconHtml}<span></span>`
    document.documentElement.appendChild(loadingEl)
  }
  const label = loadingEl.querySelector('span')
  if (label)
    label.textContent = text
  loadingEl.classList.remove('is-hide')
}

function hideIframeLoading() {
  if (!loadingEl)
    return
  loadingEl.classList.add('is-hide')
  window.setTimeout(() => {
    loadingEl?.remove()
    loadingEl = null
  }, 200)
}

function notifyLayoutReady() {
  if (layoutReadyNotified)
    return
  layoutReadyNotified = true
  hideIframeLoading()
  try {
    window.parent.postMessage({ type: LAYOUT_READY_MSG, source: 'bewly-opus' }, '*')
  }
  catch {
    // ignore
  }
}

function findOpusRoot(): HTMLElement | null {
  const candidates = [
    document.querySelector('.opus-detail'),
    document.querySelector('.bili-opus-view'),
    document.querySelector('.bili-opus-view-wrap'),
    document.querySelector('#app .opus-detail'),
    document.querySelector('#opus-detail-app .opus-detail'),
  ]
  for (const node of candidates) {
    if (node instanceof HTMLElement)
      return node
  }
  return null
}

function isRootReady(root: HTMLElement): boolean {
  if (root.dataset[READY_FLAG] === '1')
    return true

  const hasMarker = !!root.querySelector(CONTENT_READY_SELECTORS)
  const textLen = (root.textContent || '').replace(/\s+/g, '').length
  const ready = hasMarker && textLen > 30
  if (ready)
    root.dataset[READY_FLAG] = '1'
  return ready
}

const CATALOG_SELECTORS = [
  '.catalog',
  '.catalog-panel',
  '.opus-toc',
  '.opus-toc__panel',
  '.opus-catalog',
  '.opus-directory',
  '.article-catalog',
  '[class*="catalog"]',
  '[class*="Catalog"]',
  '[class*="directory"]',
  '[class*="Directory"]',
  '[class*="目录"]',
].join(',')

/** 转发动态：不做图片左置分栏（由 Moments 列表通过 query 标记） */
function isPlainOpusRequested(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('bewly_opus_plain') === '1')
      return true
    if (params.get('bewly_opus_layout') === 'plain')
      return true
  }
  catch {
    // ignore
  }
  return false
}

/**
 * 页面内兜底识别转发结构（无 query 时也跳过左置）
 */
function isForwardOpusPage(root?: HTMLElement | null): boolean {
  const scope = root || document
  const selectors = [
    '.bili-dyn-content__orig',
    '.bili-dyn-item__original',
    '.dyn-card-forward',
    '.opus-module-forward',
    '.bili-dyn-forward',
    '.forward-content',
    '[class*="forward"] [class*="orig"]',
  ]
  for (const sel of selectors) {
    try {
      if (scope.querySelector(sel))
        return true
    }
    catch {
      // ignore invalid selector
    }
  }
  // SSR / hydrate 初始态
  try {
    const state = (window as any).__INITIAL_STATE__
    const detail = state?.detail
    const type = detail?.type ?? detail?.basic?.comment_type
    // polymer detail type 1 常见为转发；字符串类型更稳
    if (detail?.type === 'DYNAMIC_TYPE_FORWARD' || detail?.item?.type === 'DYNAMIC_TYPE_FORWARD')
      return true
    if (type === 1 && detail?.orig)
      return true
  }
  catch {
    // ignore
  }
  return false
}

function shouldSkipSplitForForward(root?: HTMLElement | null): boolean {
  return isPlainOpusRequested() || isForwardOpusPage(root)
}

/**
 * 转发/plain：保持原站单栏，不重排左右图文
 */
function applyPlainLayout(root?: HTMLElement | null): boolean {
  // 转发：不重排、不展示整理遮罩，尽快结束
  if (root?.querySelector(':scope > .bewly-opus-split'))
    teardownSplit(root, false)

  markTextOnly(false)
  markArticleMode(false)
  markSplitReady(false)
  if (root)
    root.dataset[LAYOUT_MODE_FLAG] = 'text'
  layoutMode = 'text'
  // 本页永久跳过分栏，避免 mutation 再触发 split
  disabledSplit = true
  appliedSuccessfully = true
  notifyLayoutReady()
  return true
}

/**
 * 是否专栏（ARTICLE）。
 * 只有专栏才会有目录；普通图文/纯文字即使误匹配到 catalog 类名也不走专栏布局。
 */
function isColumnArticleOpus(root?: HTMLElement | null): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('bewly_opus_article') === '1')
      return true
  }
  catch {
    // ignore
  }

  // 专栏阅读页
  if (/\/read\/cv\d+/i.test(location.pathname + location.search))
    return true

  try {
    const state = (window as any).__INITIAL_STATE__
    const detail = state?.detail || state?.item
    const type = detail?.type ?? detail?.item?.type
    if (type === 'DYNAMIC_TYPE_ARTICLE' || type === 'MAJOR_TYPE_ARTICLE')
      return true
    // 专栏 comment_type=12；article_type>0 也视为专栏
    const basic = detail?.basic || detail?.item?.basic || {}
    if (Number(basic.comment_type) === 12)
      return true
    if (Number(basic.article_type) > 0)
      return true
  }
  catch {
    // ignore
  }

  const scope = root || document
  // 专栏专属壳层（目录只作为专栏的辅助特征，不单独判定）
  const articleChrome = scope.querySelector([
    '.article-container',
    '.article-content',
    '#article-content',
    '.bili-article',
    '.read-article',
    '.opus-article',
    '.article-up-info',
    '[class*="article-container"]',
  ].join(','))
  if (!(articleChrome instanceof HTMLElement))
    return false

  // 有专栏壳 + 目录，才按专栏收窄（保留目录）
  try {
    const catalog = document.querySelector(CATALOG_SELECTORS)
    if (catalog instanceof HTMLElement
      && !catalog.closest('.bili-comment-container, .reply-list, .sub-reply-list')) {
      return true
    }
  }
  catch {
    // ignore
  }

  // 仅有专栏壳也按专栏处理
  return true
}

function isExcludedMediaNode(node: Element): boolean {
  return !!node.closest(EXCLUDE_FROM_MEDIA)
}

function collectAlbumNodes(root: HTMLElement, includeCoverFallback = false): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(ALBUM_SELECTORS))
  const primaryNodes = nodes.filter(node => node.matches(PRIMARY_ALBUM_SELECTORS))
  const coverNodes = nodes.filter(node => node.matches('.opus-module-top__album__cover'))
  const sourceNodes = includeCoverFallback && coverNodes.length
    ? coverNodes
    : primaryNodes.length
      ? primaryNodes
      : nodes
  return sourceNodes.filter((node, _index, list) => {
    if (isExcludedMediaNode(node))
      return false
    return !list.some(other => other !== node && other.contains(node))
  })
}

function hasMeaningfulContent(container: HTMLElement): boolean {
  const textLen = (container.textContent || '').replace(/\s+/g, '').length
  return textLen > 20 || !!container.querySelector('img, video, iframe')
}

function isLayoutVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  return rect.width >= 120 && rect.height >= 120
}

function markSplitReady(enabled: boolean) {
  document.documentElement.classList.toggle('bewly-opus-split-ready', enabled)
  if (enabled) {
    document.documentElement.classList.remove('bewly-opus-text-only')
    document.documentElement.classList.remove('bewly-opus-article-mode')
  }
}

function markTextOnly(enabled: boolean) {
  document.documentElement.classList.toggle('bewly-opus-text-only', enabled)
  if (enabled) {
    markSplitReady(false)
    document.documentElement.classList.remove('bewly-opus-article-mode')
  }
}

function markArticleMode(enabled: boolean) {
  document.documentElement.classList.toggle('bewly-opus-article-mode', enabled)
  if (enabled) {
    markSplitReady(false)
    document.documentElement.classList.remove('bewly-opus-text-only')
  }
}

function normalizeImageUrl(url = ''): string {
  const raw = url.trim()
  if (!raw)
    return ''

  let candidate = raw
  if (candidate.startsWith('//'))
    candidate = `https:${candidate}`

  let parsed: URL
  try {
    parsed = new URL(candidate, location.href)
  }
  catch {
    return ''
  }

  if (parsed.username || parsed.password)
    return ''
  if (parsed.protocol === 'http:')
    parsed.protocol = 'https:'
  if (parsed.protocol !== 'https:')
    return ''

  parsed.pathname = parsed.pathname.replace(/@[^/?#]*(?=[?#]|$)/, '')
  // URL.href already canonicalizes URL components. encodeURI additionally keeps
  // any remaining HTML/URL metacharacters from flowing into an image src while
  // the replacement preserves existing percent-encoded octets.
  const next = encodeURI(parsed.href).replace(/%25([0-9a-f]{2})/gi, '%$1')
  // 过滤头像、表情、游戏/推荐小图标等
  if (/\/face\/|\/bfs\/face\/|emoji|emote|static\.hdslb\.com\/images\/|\/garb\/|\/activity-plat\/|\/game\/|icon\.png|icon\.webp|favicon|avatar/i.test(next))
    return ''
  return next
}

function isLikelyContentImage(img: HTMLImageElement): boolean {
  if (isExcludedMediaNode(img))
    return false

  const raw = img.getAttribute('data-src') || img.getAttribute('src') || img.currentSrc || ''
  if (!normalizeImageUrl(raw))
    return false

  // 明确的相册/大图容器内保留
  if (img.closest('.horizontal-scroll-album, .bili-album, .opus-module-top, .opus-pic-view, .bili-dyn-gallery__window'))
    return true

  // 正文零散小图（游戏推荐图标等）排除
  const w = Number(img.getAttribute('width') || img.naturalWidth || 0)
  const h = Number(img.getAttribute('height') || img.naturalHeight || 0)
  if ((w && w < 160) || (h && h < 160))
    return false

  // 额外卡片封面通常有链接父级或 goods 类
  if (img.closest('a[href*="game"], a[href*="app"], .bili-dyn-card-common, .bili-dyn-card-goods'))
    return false

  return false
}

function getImageUrlKey(url: string) {
  const path = url.split(/[?#]/, 1)[0]
  const isGif = /\.gif$/i.test(path)
  return `${path.replace(/\.(?:avif|webp|gif|jpe?g|png)$/i, '').toLowerCase()}|${isGif ? 'gif' : 'static'}`
}

function isOriginalImageUrl(url: string) {
  return /\.(?:gif|jpe?g|png)$/i.test(url.split(/[?#]/, 1)[0])
}

function extractImageUrls(albumNodes: HTMLElement[]): string[] {
  const urls: string[] = []
  const urlIndexes = new Map<string, number>()
  const push = (raw?: string | null) => {
    const url = normalizeImageUrl(raw || '')
    if (!url)
      return
    const key = getImageUrlKey(url)
    const existingIndex = urlIndexes.get(key)
    if (existingIndex !== undefined) {
      // GIF 原图优先于同一资源的 webp/jpg 缩略图，避免详情查看器出现两页相同动图。
      if (isOriginalImageUrl(url) && !isOriginalImageUrl(urls[existingIndex]))
        urls[existingIndex] = url
      return
    }
    urlIndexes.set(key, urls.length)
    urls.push(url)
  }

  albumNodes.forEach((node) => {
    if (node instanceof HTMLImageElement) {
      if (isLikelyContentImage(node))
        push(node.getAttribute('data-src') || node.getAttribute('src') || node.currentSrc)
      return
    }

    node.querySelectorAll('img').forEach((img) => {
      if (!isLikelyContentImage(img))
        return
      push(img.getAttribute('data-src') || img.getAttribute('src') || img.currentSrc)
    })

    node.querySelectorAll('source[srcset], img[srcset]').forEach((el) => {
      if (el instanceof HTMLImageElement && !isLikelyContentImage(el))
        return
      if (isExcludedMediaNode(el))
        return
      const srcset = el.getAttribute('srcset') || ''
      const first = srcset.split(',')[0]?.trim().split(/\s+/)[0]
      push(first)
    })

    node.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach((el) => {
      if (isExcludedMediaNode(el))
        return
      const match = /url\(["']?(.*?)["']?\)/.exec(el.style.backgroundImage || '')
      push(match?.[1])
    })
  })

  return urls
}

function unbindGalleryViewerBridge() {
  if (galleryViewerMessageHandler) {
    window.removeEventListener('message', galleryViewerMessageHandler)
    galleryViewerMessageHandler = null
  }
  if (galleryViewerAckTimer) {
    clearTimeout(galleryViewerAckTimer)
    galleryViewerAckTimer = null
  }
}

/** iframe 内复用项目现有 Iconify 图标组件，不依赖字体基线或页面图标样式 */
function mountGalleryIcon(host: HTMLElement, icon: string) {
  render(createVNode(Icon, {
    icon,
    'aria-hidden': 'true',
  }), host)
  galleryIconHosts.push(host)
}

function unmountGalleryIcons() {
  galleryIconHosts.forEach(host => render(null, host))
  galleryIconHosts = []
}

function createImageGallery(rawUrls: string[]): HTMLElement {
  const urls = rawUrls
    .map(url => normalizeImageUrl(url))
    .filter((url): url is string => Boolean(url))
  unmountGalleryIcons()
  const gallery = document.createElement('div')
  gallery.className = 'bewly-opus-gallery'
  gallery.dataset.bewlyGallery = '1'

  const stageShell = document.createElement('div')
  stageShell.className = 'bewly-opus-gallery__stage-shell'
  stageShell.tabIndex = 0
  stageShell.setAttribute('aria-label', '动态图片画廊，使用左右方向键切换图片')
  stageShell.addEventListener('mouseenter', () => {
    stageShell.focus({ preventScroll: true })
  })
  stageShell.addEventListener('mouseleave', () => {
    if (document.activeElement === stageShell)
      stageShell.blur()
  })

  const slider = document.createElement('div')
  slider.className = 'bewly-opus-gallery__slider'

  const track = document.createElement('div')
  track.className = 'bewly-opus-gallery__track'

  /** 三页窗口：左 / 中 / 右，切换时整轨平移 */
  const slides = [0, 1, 2].map(() => {
    const slide = document.createElement('div')
    slide.className = 'bewly-opus-gallery__slide'
    const stage = document.createElement('div')
    stage.className = 'bewly-opus-gallery__stage'
    const image = document.createElement('img')
    image.className = 'bewly-opus-gallery__image'
    image.alt = '动态图片'
    image.decoding = 'async'
    image.draggable = false
    stage.appendChild(image)
    slide.appendChild(stage)
    track.appendChild(slide)
    return { slide, stage, image }
  })

  const counter = document.createElement('div')
  counter.className = 'bewly-opus-gallery__counter'

  const navWrap = document.createElement('div')
  navWrap.className = 'bewly-opus-gallery__nav-wrap'

  const prevBtn = document.createElement('button')
  prevBtn.type = 'button'
  prevBtn.className = 'bewly-opus-gallery__nav bewly-opus-gallery__nav--prev'
  prevBtn.setAttribute('aria-label', '上一张')
  mountGalleryIcon(prevBtn, 'tabler:chevron-left')

  const nextBtn = document.createElement('button')
  nextBtn.type = 'button'
  nextBtn.className = 'bewly-opus-gallery__nav bewly-opus-gallery__nav--next'
  nextBtn.setAttribute('aria-label', '下一张')
  mountGalleryIcon(nextBtn, 'tabler:chevron-right')

  const footer = document.createElement('div')
  footer.className = 'bewly-opus-gallery__footer'

  const thumbs = document.createElement('div')
  thumbs.className = 'bewly-opus-gallery__thumbs'

  const viewer = document.createElement('div')
  viewer.className = 'bewly-opus-viewer'
  viewer.setAttribute('role', 'dialog')
  viewer.setAttribute('aria-modal', 'true')
  viewer.setAttribute('aria-label', '动态图片查看器')
  viewer.tabIndex = -1

  const viewerStage = document.createElement('div')
  viewerStage.className = 'bewly-opus-viewer__stage'
  const viewerImage = document.createElement('img')
  viewerImage.className = 'bewly-opus-viewer__image'
  viewerImage.alt = '动态图片大图'
  viewerImage.draggable = false
  viewerImage.decoding = 'async'
  viewerStage.appendChild(viewerImage)

  const viewerClose = document.createElement('button')
  viewerClose.type = 'button'
  viewerClose.className = 'bewly-opus-viewer__close'
  viewerClose.setAttribute('aria-label', '关闭图片查看器')
  viewerClose.textContent = '×'

  const viewerPrev = document.createElement('button')
  viewerPrev.type = 'button'
  viewerPrev.className = 'bewly-opus-viewer__nav bewly-opus-viewer__nav--prev'
  viewerPrev.setAttribute('aria-label', '上一张')
  mountGalleryIcon(viewerPrev, 'tabler:chevron-left')

  const viewerNext = document.createElement('button')
  viewerNext.type = 'button'
  viewerNext.className = 'bewly-opus-viewer__nav bewly-opus-viewer__nav--next'
  viewerNext.setAttribute('aria-label', '下一张')
  mountGalleryIcon(viewerNext, 'tabler:chevron-right')

  const viewerToolbar = document.createElement('div')
  viewerToolbar.className = 'bewly-opus-viewer__toolbar'
  const viewerCounter = document.createElement('span')
  viewerCounter.className = 'bewly-opus-viewer__counter'
  const viewerZoom = document.createElement('span')
  viewerZoom.className = 'bewly-opus-viewer__zoom'
  const viewerDivider = document.createElement('span')
  viewerDivider.className = 'bewly-opus-viewer__divider'

  const createViewerTool = (label: string, text: string) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'bewly-opus-viewer__tool'
    button.setAttribute('aria-label', label)
    button.title = label
    button.textContent = text
    return button
  }
  const viewerZoomOut = createViewerTool('缩小', '−')
  const viewerZoomIn = createViewerTool('放大', '+')
  const viewerReset = createViewerTool('适应窗口', '1:1')
  const viewerRotate = createViewerTool('顺时针旋转', '↻')

  viewerToolbar.appendChild(viewerCounter)
  viewerToolbar.appendChild(viewerDivider)
  viewerToolbar.appendChild(viewerZoomOut)
  viewerToolbar.appendChild(viewerZoom)
  viewerToolbar.appendChild(viewerZoomIn)
  viewerToolbar.appendChild(viewerReset)
  viewerToolbar.appendChild(viewerRotate)
  viewer.appendChild(viewerStage)
  viewer.appendChild(viewerClose)
  viewer.appendChild(viewerPrev)
  viewer.appendChild(viewerNext)
  viewer.appendChild(viewerToolbar)

  let index = 0
  let isAnimating = false
  let viewerOpen = false
  let viewerHostedByParent = false
  let viewerIndex = 0
  let viewerScale = 1
  let viewerRotation = 0
  let viewerPanX = 0
  let viewerPanY = 0
  let viewerDragging = false
  let viewerDragStartX = 0
  let viewerDragStartY = 0
  let viewerDragOriginX = 0
  let viewerDragOriginY = 0
  let wheelLockUntil = 0
  let wheelAccum = 0
  let wheelResetTimer: ReturnType<typeof setTimeout> | null = null
  let scrollHideTimer: ReturnType<typeof setTimeout> | null = null
  const WHEEL_THRESHOLD = 96
  const WHEEL_LOCK_MS = 520
  const ANIM_MS = 320
  const preloaded = new Set<string>()

  const setTrackPos = (pos: 'left' | 'center' | 'right', animate: boolean) => {
    track.classList.toggle('is-animating', animate)
    track.classList.toggle('is-pos-left', pos === 'left')
    track.classList.toggle('is-pos-center', pos === 'center')
    track.classList.toggle('is-pos-right', pos === 'right')
  }

  const wrapIndex = (i: number) => {
    const n = urls.length
    return ((i % n) + n) % n
  }

  // 覆盖滚动条（不占布局宽度）
  const scrollRail = document.createElement('div')
  scrollRail.className = 'bewly-opus-gallery__scroll-rail'
  const scrollThumb = document.createElement('div')
  scrollThumb.className = 'bewly-opus-gallery__scroll-thumb'
  scrollRail.appendChild(scrollThumb)

  const getCenterStage = () => slides[1].stage

  const syncOverlayScrollbar = () => {
    const stage = getCenterStage()
    const viewH = stage.clientHeight
    const contentH = stage.scrollHeight
    const maxScroll = contentH - viewH
    if (maxScroll <= 2 || viewH <= 0) {
      scrollRail.classList.remove('is-active')
      return
    }
    scrollRail.classList.add('is-active')
    const railH = scrollRail.clientHeight || Math.max(1, viewH - 20)
    const thumbH = Math.max(28, Math.round((viewH / contentH) * railH))
    const maxThumbTop = Math.max(0, railH - thumbH)
    const thumbTop = maxScroll <= 0 ? 0 : Math.round((stage.scrollTop / maxScroll) * maxThumbTop)
    scrollThumb.style.height = `${thumbH}px`
    scrollThumb.style.transform = `translateY(${thumbTop}px)`
  }

  const markStageScrolling = (stage: HTMLElement) => {
    stage.classList.add('is-scrolling')
    scrollRail.classList.add('is-scrolling')
    syncOverlayScrollbar()
    if (scrollHideTimer)
      clearTimeout(scrollHideTimer)
    scrollHideTimer = setTimeout(() => {
      slides.forEach(({ stage: s }) => s.classList.remove('is-scrolling'))
      scrollRail.classList.remove('is-scrolling')
      scrollHideTimer = null
    }, 900)
  }

  slides.forEach(({ stage, image }) => {
    stage.addEventListener('scroll', () => {
      if (stage === getCenterStage())
        markStageScrolling(stage)
    }, { passive: true })
    image.addEventListener('load', () => {
      stage.classList.toggle('is-landscape', image.naturalWidth > image.naturalHeight)
      if (stage === getCenterStage())
        syncOverlayScrollbar()
    })
  })

  // 拖拽自定义滚动条
  let dragging = false
  let dragStartY = 0
  let dragStartScroll = 0
  scrollThumb.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragging = true
    dragStartY = e.clientY
    dragStartScroll = getCenterStage().scrollTop
    scrollThumb.setPointerCapture(e.pointerId)
    scrollRail.classList.add('is-scrolling')
  })
  scrollThumb.addEventListener('pointermove', (e) => {
    if (!dragging)
      return
    const stage = getCenterStage()
    const viewH = stage.clientHeight
    const contentH = stage.scrollHeight
    const maxScroll = contentH - viewH
    if (maxScroll <= 0)
      return
    const railH = scrollRail.clientHeight || 1
    const thumbH = scrollThumb.clientHeight || 28
    const maxThumbTop = Math.max(1, railH - thumbH)
    const delta = e.clientY - dragStartY
    stage.scrollTop = dragStartScroll + (delta / maxThumbTop) * maxScroll
    syncOverlayScrollbar()
  })
  const endDrag = (e: PointerEvent) => {
    if (!dragging)
      return
    dragging = false
    try {
      scrollThumb.releasePointerCapture(e.pointerId)
    }
    catch {
      // ignore
    }
    markStageScrolling(getCenterStage())
  }
  scrollThumb.addEventListener('pointerup', endDrag)
  scrollThumb.addEventListener('pointercancel', endDrag)
  // 点击轨道跳转
  scrollRail.addEventListener('pointerdown', (e) => {
    if (e.target === scrollThumb)
      return
    e.preventDefault()
    const stage = getCenterStage()
    const rect = scrollRail.getBoundingClientRect()
    const railH = rect.height || 1
    const thumbH = scrollThumb.clientHeight || 28
    const y = e.clientY - rect.top - thumbH / 2
    const maxThumbTop = Math.max(1, railH - thumbH)
    const ratio = Math.min(1, Math.max(0, y / maxThumbTop))
    const maxScroll = stage.scrollHeight - stage.clientHeight
    stage.scrollTop = ratio * maxScroll
    syncOverlayScrollbar()
    markStageScrolling(stage)
  })

  const preloadUrl = (url: string) => {
    if (!url || preloaded.has(url))
      return
    preloaded.add(url)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }

  const preloadAround = (center: number) => {
    if (!urls.length)
      return

    // 预加载相邻与再外侧一张，减少切页白闪
    const neighborIndexes = [center - 2, center - 1, center, center + 1, center + 2]
    neighborIndexes.forEach((i) => {
      preloadUrl(urls[wrapIndex(i)])
    })
  }

  const setSlideImage = (slot: number, urlIndex: number) => {
    const { image, stage } = slides[slot]
    const url = urls[wrapIndex(urlIndex)]
    if (image.src !== url) {
      stage.classList.remove('is-landscape')
      image.src = url
      preloadUrl(url)
    }
    stage.scrollTop = 0
  }

  const fillWindow = () => {
    if (!urls.length)
      return
    if (urls.length === 1) {
      setSlideImage(0, 0)
      setSlideImage(1, 0)
      setSlideImage(2, 0)
    }
    else {
      setSlideImage(0, index - 1)
      setSlideImage(1, index)
      setSlideImage(2, index + 1)
    }
    setTrackPos('center', false)
    // 强制回流，保证下次过渡生效
    void track.offsetWidth
    preloadAround(index)
    requestAnimationFrame(() => syncOverlayScrollbar())
  }

  const syncChrome = () => {
    counter.textContent = `${index + 1}/${urls.length}`
    prevBtn.disabled = urls.length <= 1
    nextBtn.disabled = urls.length <= 1
    Array.from(thumbs.querySelectorAll<HTMLElement>('.bewly-opus-gallery__thumb')).forEach((thumb, i) => {
      thumb.classList.toggle('is-active', i === index)
    })
    const activeThumb = thumbs.querySelector<HTMLElement>('.bewly-opus-gallery__thumb.is-active')
    activeThumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  /**
   * 平移切换
   * @param nextIndex 目标下标
   * @param dir 1=下一张(向左平移) -1=上一张(向右平移) 0=自动判断方向
   */
  const go = (nextIndex: number, dir: -1 | 0 | 1 = 0) => {
    if (!urls.length || isAnimating)
      return
    const target = wrapIndex(nextIndex)
    if (target === index)
      return

    let moveDir: -1 | 0 | 1 = dir
    if (moveDir === 0) {
      const forward = (target - index + urls.length) % urls.length
      const backward = (index - target + urls.length) % urls.length
      moveDir = forward <= backward ? 1 : -1
    }

    // 单图无需动画
    if (urls.length === 1) {
      index = target
      fillWindow()
      syncChrome()
      return
    }

    // 非相邻跳转（缩略图点到远处）：先铺好邻页再滑
    if (moveDir > 0)
      setSlideImage(2, target)
    else
      setSlideImage(0, target)

    isAnimating = true
    wheelAccum = 0
    // 强制当前为 center 无过渡，再开启动画滑到左/右
    setTrackPos('center', false)
    void track.offsetWidth
    setTrackPos(moveDir > 0 ? 'right' : 'left', true)

    window.setTimeout(() => {
      index = target
      fillWindow()
      syncChrome()
      isAnimating = false
    }, ANIM_MS)
  }

  const syncViewerTransform = () => {
    viewerImage.style.transform = `translate3d(${viewerPanX}px, ${viewerPanY}px, 0) scale(${viewerScale}) rotate(${viewerRotation}deg)`
    viewerImage.classList.toggle('is-zoomed', viewerScale > 1)
    viewerZoom.textContent = `${Math.round(viewerScale * 100)}%`
  }

  const resetViewerTransform = () => {
    viewerScale = 1
    viewerRotation = 0
    viewerPanX = 0
    viewerPanY = 0
    syncViewerTransform()
  }

  const setViewerScale = (scale: number) => {
    viewerScale = Math.min(4, Math.max(0.25, scale))
    if (viewerScale <= 1) {
      viewerPanX = 0
      viewerPanY = 0
    }
    syncViewerTransform()
  }

  const showViewerImage = (nextIndex: number) => {
    viewerIndex = wrapIndex(nextIndex)
    viewerImage.src = urls[viewerIndex]
    viewerCounter.textContent = `${viewerIndex + 1}/${urls.length}`
    viewerPrev.disabled = urls.length <= 1
    viewerNext.disabled = urls.length <= 1
    resetViewerTransform()
    preloadAround(viewerIndex)
  }

  const openLocalViewer = (nextIndex: number) => {
    viewerOpen = true
    viewer.classList.add('is-open')
    showViewerImage(nextIndex)
    requestAnimationFrame(() => viewer.focus({ preventScroll: true }))
  }

  const openViewer = (nextIndex: number) => {
    const target = wrapIndex(nextIndex)
    if (window.parent !== window) {
      viewerIndex = target
      viewerHostedByParent = false
      window.parent.postMessage({
        type: 'BEWLY_OPUS_IMAGE_VIEWER_OPEN',
        urls,
        index: target,
      }, '*')
      if (galleryViewerAckTimer)
        clearTimeout(galleryViewerAckTimer)
      // 非动态 Dialog 场景没有父级查看器时，回退到 iframe 内查看
      galleryViewerAckTimer = setTimeout(() => {
        galleryViewerAckTimer = null
        if (!viewerHostedByParent)
          openLocalViewer(target)
      }, 180)
      return
    }
    openLocalViewer(target)
  }

  const closeViewer = () => {
    if (!viewerOpen)
      return
    viewerOpen = false
    viewer.classList.remove('is-open')
    viewerImage.removeAttribute('src')
    resetViewerTransform()
    if (viewerIndex !== index)
      go(viewerIndex, 0)
  }

  slides.forEach(({ image }, slot) => {
    image.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      openViewer(index + slot - 1)
    })
  })

  viewerClose.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    closeViewer()
  })
  viewerPrev.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    showViewerImage(viewerIndex - 1)
  })
  viewerNext.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    showViewerImage(viewerIndex + 1)
  })
  viewerZoomOut.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    setViewerScale(viewerScale - 0.25)
  })
  viewerZoomIn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    setViewerScale(viewerScale + 0.25)
  })
  viewerReset.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    resetViewerTransform()
  })
  viewerRotate.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    viewerRotation = (viewerRotation + 90) % 360
    syncViewerTransform()
  })
  viewerStage.addEventListener('click', (e) => {
    if (e.target === viewerStage)
      closeViewer()
  })
  viewerImage.addEventListener('dblclick', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (viewerScale > 1)
      resetViewerTransform()
    else
      setViewerScale(2)
  })
  viewer.addEventListener('wheel', (e) => {
    e.preventDefault()
    e.stopPropagation()
    setViewerScale(viewerScale * (e.deltaY < 0 ? 1.15 : 0.87))
  }, { passive: false })
  viewerImage.addEventListener('pointerdown', (e) => {
    if (viewerScale <= 1)
      return
    e.preventDefault()
    e.stopPropagation()
    viewerDragging = true
    viewerDragStartX = e.clientX
    viewerDragStartY = e.clientY
    viewerDragOriginX = viewerPanX
    viewerDragOriginY = viewerPanY
    viewerImage.classList.add('is-dragging')
    viewerImage.setPointerCapture(e.pointerId)
  })
  viewerImage.addEventListener('pointermove', (e) => {
    if (!viewerDragging)
      return
    viewerPanX = viewerDragOriginX + e.clientX - viewerDragStartX
    viewerPanY = viewerDragOriginY + e.clientY - viewerDragStartY
    syncViewerTransform()
  })
  const stopViewerDrag = (e: PointerEvent) => {
    if (!viewerDragging)
      return
    viewerDragging = false
    viewerImage.classList.remove('is-dragging')
    try {
      viewerImage.releasePointerCapture(e.pointerId)
    }
    catch {
      // 忽略已释放的指针
    }
  }
  viewerImage.addEventListener('pointerup', stopViewerDrag)
  viewerImage.addEventListener('pointercancel', stopViewerDrag)

  prevBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    go(index - 1, -1)
  })
  nextBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    go(index + 1, 1)
  })

  slider.appendChild(track)
  stageShell.appendChild(slider)
  stageShell.appendChild(scrollRail)
  // 初始同步一次（图片加载后还会再同步）
  requestAnimationFrame(() => syncOverlayScrollbar())

  if (urls.length > 1) {
    navWrap.appendChild(prevBtn)
    navWrap.appendChild(nextBtn)
    stageShell.appendChild(navWrap)

    urls.forEach((url, i) => {
      const thumb = document.createElement('button')
      thumb.type = 'button'
      thumb.className = 'bewly-opus-gallery__thumb'
      thumb.setAttribute('aria-label', `查看第 ${i + 1} 张`)
      const thumbImg = document.createElement('img')
      thumbImg.src = url
      thumbImg.alt = ''
      thumbImg.decoding = 'async'
      thumbImg.loading = i < 6 ? 'eager' : 'lazy'
      thumb.appendChild(thumbImg)
      thumb.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        go(i, 0)
      })
      thumbs.appendChild(thumb)
      // 缩略图也算预加载入口
      if (i < 8)
        preloadUrl(url)
    })

    footer.appendChild(thumbs)
    // 缩略图叠在大图底部，滚动条只属于 stage 大图区域
    stageShell.appendChild(footer)
    // 页码独立于缩略图，常驻右下角
    stageShell.appendChild(counter)
    gallery.appendChild(stageShell)
  }
  else {
    gallery.appendChild(stageShell)
  }
  gallery.appendChild(viewer)

  // 横向滚轮切图：阈值限制 + 阈值阈值阈值阈值阈值阈值阈值
  gallery.addEventListener('wheel', (e) => {
    // 纵向优先交给当前舞台滚动长图
    const centerStage = slides[1].stage
    const deltaX = e.deltaX
    const deltaY = e.deltaY
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absY >= absX) {
      // 纵向：若还能滚则不切图
      const atTop = centerStage.scrollTop <= 0
      const atBottom = centerStage.scrollTop + centerStage.clientHeight >= centerStage.scrollHeight - 1
      if (!(atTop && deltaY < 0) && !(atBottom && deltaY > 0) && centerStage.scrollHeight > centerStage.clientHeight + 2)
        return
      // 长图滚到底/顶后的纵向不用于切图，降低误触
      return
    }

    if (urls.length <= 1)
      return

    e.preventDefault()
    e.stopPropagation()

    const now = Date.now()
    if (now < wheelLockUntil || isAnimating)
      return

    wheelAccum += deltaX
    if (wheelResetTimer)
      clearTimeout(wheelResetTimer)
    wheelResetTimer = setTimeout(() => {
      wheelAccum = 0
      wheelResetTimer = null
    }, 220)

    if (Math.abs(wheelAccum) < WHEEL_THRESHOLD)
      return

    const dir: -1 | 1 = wheelAccum > 0 ? 1 : -1
    wheelAccum = 0
    wheelLockUntil = now + WHEEL_LOCK_MS
    go(index + dir, dir)
  }, { passive: false })

  // 点击舞台空白不切图（仅按钮/缩略图）
  unbindGalleryViewerBridge()
  galleryViewerMessageHandler = (e: MessageEvent) => {
    if (e.source !== window.parent)
      return
    if (e.data?.type === 'BEWLY_OPUS_IMAGE_VIEWER_ACK') {
      viewerHostedByParent = true
      gallery.classList.add('is-viewer-hosted')
      if (galleryViewerAckTimer) {
        clearTimeout(galleryViewerAckTimer)
        galleryViewerAckTimer = null
      }
      return
    }
    if (e.data?.type === 'BEWLY_OPUS_IMAGE_VIEWER_CLOSE') {
      viewerHostedByParent = false
      gallery.classList.remove('is-viewer-hosted')
      const nextIndex = Number(e.data.index)
      if (Number.isFinite(nextIndex)) {
        viewerIndex = wrapIndex(nextIndex)
        if (viewerIndex !== index)
          go(viewerIndex, 0)
      }
    }
  }
  window.addEventListener('message', galleryViewerMessageHandler)
  stageShell.addEventListener('keydown', (e) => {
    if (urls.length <= 1)
      return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1, -1)
    }
    else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(index + 1, 1)
    }
  })

  viewer.addEventListener('keydown', (e) => {
    if (!viewerOpen)
      return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeViewer()
    }
    else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      showViewerImage(viewerIndex - 1)
    }
    else if (e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      showViewerImage(viewerIndex + 1)
    }
    else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      e.stopPropagation()
      setViewerScale(viewerScale + 0.25)
    }
    else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      e.stopPropagation()
      setViewerScale(viewerScale - 0.25)
    }
    else if (e.key === '0') {
      e.preventDefault()
      e.stopPropagation()
      resetViewerTransform()
    }
  })

  fillWindow()
  syncChrome()
  return gallery
}

function teardownSplit(root: HTMLElement, permanent = false) {
  const split = root.querySelector<HTMLElement>(':scope > .bewly-opus-split')
  unbindGalleryViewerBridge()
  unmountGalleryIcons()
  if (!split) {
    markSplitReady(false)
    appliedSuccessfully = false
    layoutMode = permanent ? 'disabled' : 'pending'
    if (permanent)
      disabledSplit = true
    return
  }

  const mediaPane = split.querySelector(':scope > .bewly-opus-split__media')
  const panelPane = split.querySelector(':scope > .bewly-opus-split__panel')
  const source = mediaPane?.querySelector(':scope > .bewly-opus-gallery__source')
  const fragment = document.createDocumentFragment()
  if (source) {
    while (source.firstChild)
      fragment.appendChild(source.firstChild)
  }
  else if (mediaPane) {
    Array.from(mediaPane.childNodes).forEach((node) => {
      if (node instanceof HTMLElement && node.classList.contains('bewly-opus-gallery'))
        return
      fragment.appendChild(node)
    })
  }
  if (panelPane) {
    while (panelPane.firstChild)
      fragment.appendChild(panelPane.firstChild)
  }
  split.remove()
  root.appendChild(fragment)
  delete root.dataset[SPLIT_FLAG]
  delete root.dataset[LAYOUT_MODE_FLAG]
  markSplitReady(false)
  markTextOnly(false)
  markArticleMode(false)
  appliedSuccessfully = false
  layoutMode = permanent ? 'disabled' : 'pending'
  teardownCount += 1
  if (permanent || teardownCount >= 3)
    disabledSplit = true
}

function verifySplitOrRollback(root: HTMLElement, split: HTMLElement, panelPane: HTMLElement, mediaPane: HTMLElement) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const ok = isLayoutVisible(split)
        && (hasMeaningfulContent(panelPane) || hasMeaningfulContent(mediaPane))
        && (panelPane.getBoundingClientRect().height > 40 || mediaPane.getBoundingClientRect().height > 40)

      if (!ok) {
        teardownSplit(root, teardownCount >= 2)
        return
      }

      appliedSuccessfully = true
      layoutMode = 'split'
      markSplitReady(true)
      notifyLayoutReady()
    })
  })
}

function applyTextOnlyLayout(root: HTMLElement): boolean {
  if (!isRootReady(root) || !hasMeaningfulContent(root))
    return false

  markTextOnly(true)
  markArticleMode(false)
  markSplitReady(false)
  root.dataset[LAYOUT_MODE_FLAG] = 'text'
  layoutMode = 'text'
  appliedSuccessfully = true
  notifyLayoutReady()
  return true
}

function applyArticleLayout(root: HTMLElement): boolean {
  if (!isRootReady(root) || !hasMeaningfulContent(root))
    return false

  // 若之前误做了分栏，先拆掉
  if (root.querySelector(':scope > .bewly-opus-split'))
    teardownSplit(root, false)

  markArticleMode(true)
  markTextOnly(false)
  markSplitReady(false)
  root.dataset[LAYOUT_MODE_FLAG] = 'article'
  layoutMode = 'article'
  appliedSuccessfully = true
  notifyLayoutReady()
  return true
}

function applySplitLayout(root: HTMLElement): boolean {
  if (disabledSplit || layoutMode === 'disabled')
    return false

  // 转发动态：不做图片左置
  if (shouldSkipSplitForForward(root))
    return applyPlainLayout(root)

  const existing = root.querySelector<HTMLElement>(':scope > .bewly-opus-split')
  if (existing) {
    const panel = existing.querySelector<HTMLElement>(':scope > .bewly-opus-split__panel')
    const media = existing.querySelector<HTMLElement>(':scope > .bewly-opus-split__media')
    if (panel && media && (hasMeaningfulContent(panel) || hasMeaningfulContent(media)) && isLayoutVisible(existing)) {
      markSplitReady(true)
      markTextOnly(false)
      appliedSuccessfully = true
      layoutMode = 'split'
      notifyLayoutReady()
      return true
    }
    teardownSplit(root, teardownCount >= 2)
    if (disabledSplit)
      return false
  }

  if (!isRootReady(root))
    return false

  if (Date.now() - lastMutationAt < 280)
    return false

  // 仅专栏：整页收窄并保留目录；普通图文不走此分支
  if (isColumnArticleOpus(root))
    return applyArticleLayout(root)

  let albumNodes = collectAlbumNodes(root)
  let imageUrls = extractImageUrls(albumNodes)
  if (!imageUrls.length) {
    albumNodes = collectAlbumNodes(root, true)
    imageUrls = extractImageUrls(albumNodes)
  }

  // 纯文字：不左右分栏
  if (!imageUrls.length)
    return applyTextOnlyLayout(root)

  const originalChildren = Array.from(root.childNodes)
  if (!originalChildren.length)
    return false

  const split = document.createElement('div')
  split.className = 'bewly-opus-split'
  const mediaPane = document.createElement('div')
  mediaPane.className = 'bewly-opus-split__media'
  const panelPane = document.createElement('div')
  panelPane.className = 'bewly-opus-split__panel'

  originalChildren.forEach((node) => {
    panelPane.appendChild(node)
  })

  const source = document.createElement('div')
  source.className = 'bewly-opus-gallery__source'
  albumNodes.forEach((node) => {
    if (panelPane.contains(node))
      source.appendChild(node)
  })
  const gallery = createImageGallery(imageUrls)
  mediaPane.appendChild(gallery)
  mediaPane.appendChild(source)

  if (!hasMeaningfulContent(panelPane) && !imageUrls.length) {
    while (panelPane.firstChild)
      root.appendChild(panelPane.firstChild)
    return false
  }

  split.appendChild(mediaPane)
  split.appendChild(panelPane)
  root.appendChild(split)
  root.dataset[SPLIT_FLAG] = '1'
  root.dataset[LAYOUT_MODE_FLAG] = 'split'

  appliedSuccessfully = true
  layoutMode = 'split'
  markTextOnly(false)
  markSplitReady(true)

  split.style.position = 'fixed'
  split.style.inset = '0'
  split.style.zIndex = '20'
  split.style.display = 'grid'
  split.style.gridTemplateColumns = 'minmax(0, 4fr) minmax(0, 3fr)'
  split.style.columnGap = '0'
  split.style.width = '100%'
  split.style.height = '100%'
  split.style.overflow = 'hidden'
  split.style.background = 'var(--bg1, #fff)'
  mediaPane.style.overflow = 'hidden'
  mediaPane.style.height = '100%'
  mediaPane.style.minHeight = '0'
  panelPane.style.overflowY = 'auto'
  panelPane.style.height = '100%'
  panelPane.style.minHeight = '0'

  verifySplitOrRollback(root, split, panelPane, mediaPane)
  return true
}

function tryApply() {
  if (!isInIframe() || !isOpusDetailPage() || disabledSplit || layoutMode === 'disabled')
    return

  ensureBaseClasses()
  ensureStyles()

  const root = findOpusRoot()
  if (!root)
    return

  if ((layoutMode === 'text' || layoutMode === 'article')
    && (root.dataset[LAYOUT_MODE_FLAG] === 'text' || root.dataset[LAYOUT_MODE_FLAG] === 'article')) {
    notifyLayoutReady()
    return
  }

  if (shouldSkipSplitForForward(root)) {
    applyPlainLayout(root)
    return
  }

  showIframeLoading()
  applySplitLayout(root)
}

function scheduleApply(delay = 160) {
  if (disabledSplit || layoutMode === 'disabled')
    return
  if (applyTimer)
    clearTimeout(applyTimer)
  applyTimer = setTimeout(() => {
    applyTimer = null
    tryApply()
  }, delay)
}

function scheduleStableApply() {
  lastMutationAt = Date.now()
  if (disabledSplit || layoutMode === 'disabled')
    return
  if (layoutMode === 'text' || layoutMode === 'article' || (layoutMode === 'split' && appliedSuccessfully))
    return
  if (stableTimer)
    clearTimeout(stableTimer)
  stableTimer = setTimeout(() => {
    stableTimer = null
    scheduleApply(0)
  }, 320)
}

/**
 * 在 iframe 内把 B 站 opus 详情重排为左右分栏。
 * 纯文字保持单栏；图文左侧相册（可切换/滚动），右侧文字评论独立滚动。
 */
export function disposeOpusDetailDrawerLayout() {
  clearDeferredSetup()

  try {
    observer?.disconnect()
  }
  catch {
    // ignore
  }
  observer = null

  if (applyTimer) {
    clearTimeout(applyTimer)
    applyTimer = null
  }
  if (stableTimer) {
    clearTimeout(stableTimer)
    stableTimer = null
  }
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }

  unbindGalleryViewerBridge()
  hideIframeLoading()

  try {
    const root = findOpusRoot()
    if (root?.querySelector(':scope > .bewly-opus-split'))
      teardownSplit(root, true)
  }
  catch {
    // ignore
  }

  // 释放页面内媒体，降低关闭后内存驻留
  try {
    document.querySelectorAll('video, audio').forEach((el) => {
      const media = el as HTMLMediaElement
      try {
        media.pause()
        media.removeAttribute('src')
        media.load()
      }
      catch {
        // ignore
      }
    })
  }
  catch {
    // ignore
  }

  appliedSuccessfully = false
  layoutMode = 'pending'
  disabledSplit = false
  teardownCount = 0
  layoutReadyNotified = false
  lastMutationAt = 0
  styleEl = null
  loadingEl = null
}

function handleOpusDisposeMessage(event: MessageEvent) {
  if (event.data?.type === 'BEWLY_OPUS_DISPOSE')
    disposeOpusDetailDrawerLayout()
}

export function setupOpusDetailDrawerLayout() {
  if (!isInIframe() || !isOpusDetailPage())
    return

  const documentElement = document.documentElement
  if (!documentElement) {
    deferSetupUntilDocumentElementReady()
    return
  }
  clearDeferredSetup()

  layoutReadyNotified = false
  ensureBaseClasses()
  ensureStyles()

  // 父页关闭 iframe 时销毁内部观察器与媒体
  window.removeEventListener('message', handleOpusDisposeMessage)
  window.addEventListener('message', handleOpusDisposeMessage)
  window.removeEventListener('pagehide', disposeOpusDetailDrawerLayout)
  window.addEventListener('pagehide', disposeOpusDetailDrawerLayout, { once: true })

  // 转发：快速直出，不显示「正在整理动态详情…」，不做分栏重排
  if (isPlainOpusRequested()) {
    applyPlainLayout(findOpusRoot())
    return
  }

  showIframeLoading()
  scheduleStableApply()

  if (!observer) {
    observer = new MutationObserver(() => {
      if (disabledSplit || layoutMode === 'disabled' || layoutMode === 'text' || layoutMode === 'article')
        return

      if (appliedSuccessfully && layoutMode === 'split') {
        const root = findOpusRoot()
        const split = root?.querySelector(':scope > .bewly-opus-split')
        const panel = split?.querySelector(':scope > .bewly-opus-split__panel') as HTMLElement | null
        const media = split?.querySelector(':scope > .bewly-opus-split__media') as HTMLElement | null
        if (root && split && panel && media
          && (hasMeaningfulContent(panel) || !!media.querySelector('.bewly-opus-gallery'))
          && isLayoutVisible(split as HTMLElement)) {
          notifyLayoutReady()
          return
        }
        if (root)
          teardownSplit(root, teardownCount >= 2)
        if (disabledSplit)
          return
      }

      scheduleStableApply()
    })
    observer.observe(documentElement, {
      childList: true,
      subtree: true,
    })
  }

  window.setTimeout(() => scheduleStableApply(), 600)
  window.setTimeout(() => scheduleStableApply(), 1400)
  window.setTimeout(() => scheduleStableApply(), 2800)

  if (stopTimer)
    clearTimeout(stopTimer)
  stopTimer = setTimeout(() => {
    observer?.disconnect()
    observer = null
    if (!appliedSuccessfully)
      disabledSplit = true
    // 无论成功与否都解除遮罩，避免永久 loading
    notifyLayoutReady()
  }, 10000)
}
