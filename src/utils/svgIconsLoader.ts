let svgIconsPromise: Promise<string> | undefined

/** 按需动态加载 156 kB 的频道/小组件 SVG 雪碧图，避免打入内容脚本与设置页首屏主包。 */
export function loadSvgIcons(): Promise<string> {
  svgIconsPromise ??= import('~/utils/svgIcons')
    .then((mod) => mod.SVG_ICONS)
    .catch((error) => {
      svgIconsPromise = undefined
      throw error
    })
  return svgIconsPromise
}
