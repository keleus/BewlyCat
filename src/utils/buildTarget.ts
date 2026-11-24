// 构建时替换为常量，非 Firefox 包中相关分支会被摇树移除
export const isFirefoxBuild = Boolean(process.env.FIREFOX)
