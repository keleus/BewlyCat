import type { AttributifyAttributes } from 'unocss'

declare module '@vue/runtime-dom' {
  interface HTMLAttributes extends AttributifyAttributes {}
}
