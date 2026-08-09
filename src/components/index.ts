import type { App, Plugin } from 'vue'

const componentModules: Record<string, { default: Component }> = import.meta.glob(['./*/*.vue', './*.vue'], { eager: true })

export default {
  install: (app: App) => {
    for (const path in componentModules) {
      const splitPath = path.split('/')
      const name = splitPath[splitPath.length - 1].replace('.vue', '').replace('.ts', '')
      app.component(name, componentModules[path].default)
    }
  },
} as Plugin
