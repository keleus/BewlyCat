// 构建时替换为常量，非 Firefox 包中相关分支会被摇树移除
// eslint-disable-next-line node/prefer-global/process
export const isFirefoxBuild = Boolean(process.env.FIREFOX)
