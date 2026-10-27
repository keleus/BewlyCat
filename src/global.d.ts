declare const __DEV__: boolean
declare const __BUILD_COMMIT__: string

declare module '*.vue' {
  const component: any
  export default component
}

declare module 'virtual:bewly-inject-messages' {
  /** `inject:` section of each locale file, keyed by locale then message key. */
  const messages: Record<string, Record<string, string>>
  export default messages
}
