import { createPinia } from 'pinia'
import type { App } from 'vue'
import Toast, { POSITION, TYPE } from 'vue-toastification'

import components from '~/components'
import { i18n } from '~/utils/i18n'

const pinia = createPinia()

export async function setupApp(app: App) {
  // Inject a globally available `$app` object in template
  app.config.globalProperties.$app = { context: '' }

  // Provide access to `app` in script setup with `const app = inject('app')`
  app.provide('app', app.config.globalProperties.$app)

  // Here you can install additional plugins for all contexts: popup, options page and content-script.
  // example: app.use(i18n)
  // example excluding content-script context: if (context !== 'content-script') app.use(i18n)
  app.use(i18n)
  app
    .use(Toast, {
      transition: {
        enter: 'bewly-toast-enter-active',
        leave: 'bewly-toast-leave-active',
        move: 'bewly-toast-move',
      },
      containerClassName: 'bewly-toast-container',
      toastClassName: 'bewly-toast',
      bodyClassName: 'bewly-toast__body',
      closeButtonClassName: 'bewly-toast__close',
      maxToasts: 4,
      newestOnTop: true,
      position: POSITION.TOP_RIGHT,
      timeout: 4000,
      hideProgressBar: false,
      closeOnClick: false,
      showCloseButtonOnHover: false,
      toastDefaults: {
        [TYPE.SUCCESS]: { timeout: 3000 },
        [TYPE.INFO]: { timeout: 4000 },
        [TYPE.WARNING]: { timeout: 5000 },
        [TYPE.ERROR]: { timeout: 6500 },
      },
    })
  app.use(components)
  app.use(pinia)
}
