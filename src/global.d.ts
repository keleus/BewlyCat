declare const __DEV__: boolean
declare const __BUILD_COMMIT__: string

declare module '*.vue' {
  const component: any
  export default component
}
