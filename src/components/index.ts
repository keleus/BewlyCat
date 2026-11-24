import type { App, Component, Plugin } from 'vue'
import { defineAsyncComponent } from 'vue'

import ALink from './ALink.vue'
import AppBackground from './AppBackground.vue'
import Button from './Button.vue'
import Dialog from './Dialog.vue'
import Dock from './Dock/Dock.vue'
import Empty from './Empty.vue'
import Input from './Input.vue'
import List from './List/List.vue'
import ListItem from './List/ListItem.vue'
import Loading from './Loading.vue'
import Picture from './Picture.vue'
import Progress from './Progress.vue'
import Radio from './Radio.vue'
import SearchBar from './SearchBar/SearchBar.vue'
import Select from './Select.vue'
import SideBar from './SideBar/SideBar.vue'
import Slider from './Slider.vue'
import Tooltip from './Tooltip.vue'
import TopBar from './TopBar/TopBar.vue'

// 仅注册模板中确实依赖全局名称解析的组件：
// - 首屏壳与通用基础控件保持同步注册，避免初始渲染与弹窗闪烁；
// - 仅在条件抽屉、弹窗、设置子页或懒加载视图中使用的全局组件按需拆包；
// - 已被调用方显式 import 的重型业务组件（MomentCard/*、VideoCard*、UserCard、ArticleCard 等）
//   不再全局提前引入，跟随对应视图自然分块。
const globalComponents: Record<string, Component> = {
  ALink,
  AppBackground,
  BangumiCard: defineAsyncComponent(() => import('./BangumiCard/BangumiCard.vue')),
  BangumiCardSkeleton: defineAsyncComponent(() => import('./BangumiCard/BangumiCardSkeleton.vue')),
  Button,
  CodeEditor: defineAsyncComponent(() => import('./CodeEditor.vue')),
  ContextMenu: defineAsyncComponent(() => import('./ContextMenu.vue')),
  Dialog,
  Dock,
  Empty,
  HorizontalScrollView: defineAsyncComponent(() => import('./HorizontalScrollView.vue')),
  IframeDrawer: defineAsyncComponent(() => import('./IframeDrawer.vue')),
  IframePage: defineAsyncComponent(() => import('./IframePage.vue')),
  Input,
  List,
  ListItem,
  Loading,
  Logo: defineAsyncComponent(() => import('./Logo.vue')),
  Picture,
  PipWindow: defineAsyncComponent(() => import('./PipWindow.vue')),
  Progress,
  Radio,
  SearchBar,
  Select,
  SideBar,
  Slider,
  Tooltip,
  TopBar,
  VideoDialog: defineAsyncComponent(() => import('./VideoDialog.vue')),
}

export default {
  install: (app: App) => {
    for (const [name, component] of Object.entries(globalComponents)) app.component(name, component)
  },
} as Plugin
