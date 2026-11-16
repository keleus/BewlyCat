import type { App, Plugin } from 'vue'

const componentModules: Record<string, { default: Component }> = import.meta.glob(
  // 设置页在独立扩展页面中显式引入；设置浮层也由内容脚本显式引入，不参与全局组件注册。
  ['./*.vue', './*/*.vue', '!./Settings/*.vue'],
  { eager: true },
)

export default {
  install: (app: App) => {
    for (const path in componentModules) {
      const splitPath = path.split('/')
      const name = splitPath[splitPath.length - 1].replace('.vue', '').replace('.ts', '')
      app.component(name, componentModules[path].default)
    }
  },
} as Plugin
