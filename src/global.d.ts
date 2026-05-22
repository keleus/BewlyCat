/// <reference types="vite/client" />

declare const __DEV__: boolean

declare module '*.vue' {
  const component: any
  export default component
}
