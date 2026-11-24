import type { App } from 'vue'
import { defineAsyncComponent } from 'vue'

import Button from '~/components/Button.vue'
import ConfirmDialogOverlay from '~/components/ConfirmDialogOverlay.vue'
import Dialog from '~/components/Dialog.vue'
import Input from '~/components/Input.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'
import List from '~/components/List/List.vue'
import ListItem from '~/components/List/ListItem.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import Tooltip from '~/components/Tooltip.vue'

// 仅特定设置项触发时才展示的重型弹窗/编辑器按需拆包，避免把 qrcode 等依赖拉入设置页首屏。
const AppAuthorizationDialog = defineAsyncComponent(
  () => import('~/components/AppAuthorizationDialog.vue'),
)
const CodeEditor = defineAsyncComponent(() => import('~/components/CodeEditor.vue'))

// 设置界面直接在模板中使用、依赖全局注册的组件。内容脚本通过 ~/components 注册全部组件；
// 设置页只注册这部分，避免把首页、动态、播放器等整套界面打包进来。
// 设置组件新使用了未在此列出的全局组件时需要补充，否则设置页会出现 Failed to resolve component 警告。
const settingsComponents = {
  AppAuthorizationDialog,
  Button,
  CodeEditor,
  ConfirmDialogOverlay,
  Dialog,
  Input,
  LiquidSegmentIndicator,
  List,
  ListItem,
  Radio,
  Select,
  Slider,
  Tooltip,
}

export function registerSettingsComponents(app: App) {
  for (const [name, component] of Object.entries(settingsComponents)) app.component(name, component)
}
