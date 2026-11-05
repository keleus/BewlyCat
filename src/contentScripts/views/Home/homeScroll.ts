import { settings } from '~/logic'

/** 栏目内容起点的滚动位置；搜索页模式下位于搜索区域下方。 */
export function getHomeContentScrollTop(): number {
  return settings.value.useSearchPageModeOnHomePage ? 510 : 0
}

/** 是否未滚过栏目内容起点；1px 容差覆盖小数滚动位置。 */
export function isWithinHomeContentStart(scrollTop: number): boolean {
  return scrollTop <= getHomeContentScrollTop() + 1
}
