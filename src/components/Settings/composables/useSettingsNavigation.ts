import type { SettingsNavigationTarget } from '~/composables/useAppProvider'

import type { SettingsMenuDefinition, SettingsSecondaryPage } from '../settingsMenus'
import { settingsMenus } from '../settingsMenus'
import type { MenuItem } from '../types'
import { MenuType } from '../types'

const SETTINGS_MENU_STORAGE_KEY = 'bewly-settings-active-menu'
const EXPANDED_MENUS_STORAGE_KEY = 'bewly-settings-expanded-menus'

export interface UseSettingsNavigationOptions {
  menus?: SettingsMenuDefinition[]
}

/**
 * 设置壳共用的导航状态。
 *
 * 负责一级菜单、二级页、展开状态和 sessionStorage 同步；只处理状态，不关心
 * 独立设置页的侧栏还是页面内浮层的胶囊导航。
 */
export function useSettingsNavigation(options: UseSettingsNavigationOptions = {}) {
  const menus = options.menus ?? settingsMenus
  const storedMenuItem = sessionStorage.getItem(SETTINGS_MENU_STORAGE_KEY) as MenuType | null

  const activatedMenuItem = ref<MenuType>(
    storedMenuItem && menus.some(menu => menu.value === storedMenuItem)
      ? storedMenuItem as MenuType
      : MenuType.General,
  )

  // 每个一级菜单各自记住当前二级页，切换回来时保持原位。
  const activeSecondaryPages = reactive<Partial<Record<MenuType, string>>>(Object.fromEntries(
    menus.flatMap((menu) => {
      if (!menu.pages)
        return []
      const stored = sessionStorage.getItem(menu.storageKey!)
      return [[menu.value, menu.pages.some(page => page.value === stored) ? stored : menu.pages[0].value]]
    }),
  ))

  // 依赖的模块关闭后，对应菜单和二级页一并隐藏。
  const visibleMenus = computed(() => menus.flatMap((menu) => {
    if (menu.available && !menu.available())
      return []
    if (!menu.pages)
      return [menu]
    const pages = menu.pages.filter(page => !page.available || page.available())
    return pages.length ? [{ ...menu, pages }] : []
  }))

  // 当前页面被隐藏时回到通用页，用户可以在那里重新开启对应模块。
  const activeMenu = computed(() => visibleMenus.value.find(menu => menu.value === activatedMenuItem.value)
    ?? visibleMenus.value.find(menu => menu.value === MenuType.General)!)

  function getSecondaryPage(menu: SettingsMenuDefinition) {
    return menu.pages?.find(page => page.value === activeSecondaryPages[menu.value]) ?? menu.pages?.[0]
  }

  const activeSecondaryPage = computed(() => getSecondaryPage(activeMenu.value))
  const activeContent = computed(() => activeSecondaryPage.value?.component ?? activeMenu.value.component)

  const defaultExpandedMenus = menus.filter(menu => menu.pages?.length).map(menu => menu.value)

  function readExpandedMenus(): MenuType[] {
    try {
      const stored = JSON.parse(localStorage.getItem(EXPANDED_MENUS_STORAGE_KEY) ?? 'null')
      return Array.isArray(stored) ? stored : defaultExpandedMenus
    }
    catch {
      return defaultExpandedMenus
    }
  }

  // 展开与页面选中分别管理，浏览其他分类时保留已展开的菜单，下次打开设置页时也保持。
  const expandedMenus = ref(new Set<MenuType>([...readExpandedMenus(), activatedMenuItem.value]))
  watch(expandedMenus, (value) => {
    localStorage.setItem(EXPANDED_MENUS_STORAGE_KEY, JSON.stringify([...value]))
  }, { deep: true })

  const secondaryGroups = computed(() => new Map(visibleMenus.value.map((menu) => {
    const groups: Array<{ key: string | null, pages: SettingsSecondaryPage[] }> = []
    for (const page of menu.pages ?? []) {
      const groupKey = page.groupKey ?? null
      const lastGroup = groups[groups.length - 1]
      if (lastGroup?.key === groupKey)
        lastGroup.pages.push(page)
      else
        groups.push({ key: groupKey, pages: [page] })
    }
    return [menu.value, groups] as const
  })))

  const settingsMenuItems = computed<MenuItem[]>(() => visibleMenus.value.map(menu => ({
    value: menu.value,
    icon: menu.icon,
    iconActivated: menu.iconActivated,
    titleKey: menu.titleKey,
    badge: menu.badge,
    sectionStart: menu.sectionStart,
  })))

  function toggleMenu(menu: MenuType) {
    if (expandedMenus.value.has(menu))
      expandedMenus.value.delete(menu)
    else
      expandedMenus.value.add(menu)
  }

  function activateSettingsTarget(target: SettingsNavigationTarget) {
    const menu = menus.find(item => item.value === target.menu)
    const secondaryPage = target.secondaryPage
    if (secondaryPage && menu?.pages?.some(page => page.value === secondaryPage))
      activeSecondaryPages[target.menu as MenuType] = secondaryPage

    expandedMenus.value.add(target.menu as MenuType)
    activatedMenuItem.value = target.menu as MenuType
  }

  function setActiveSecondaryPage(menu: MenuType, page: string) {
    if (menus.find(item => item.value === menu)?.pages?.some(item => item.value === page))
      activeSecondaryPages[menu] = page
  }

  watch(activatedMenuItem, (menu) => {
    sessionStorage.setItem(SETTINGS_MENU_STORAGE_KEY, menu)
    expandedMenus.value.add(menu)
  })
  watch(activeSecondaryPages, (pages) => {
    for (const menu of menus) {
      if (menu.storageKey && pages[menu.value])
        sessionStorage.setItem(menu.storageKey, pages[menu.value]!)
    }
  })

  return {
    activatedMenuItem,
    activeContent,
    activeMenu,
    activeSecondaryPage,
    expandedMenus,
    getSecondaryPage,
    secondaryGroups,
    settingsMenuItems,
    setActiveSecondaryPage,
    toggleMenu,
    visibleMenus,
    activateSettingsTarget,
  }
}
