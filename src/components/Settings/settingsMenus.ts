// @unocss-include
import type { Component } from 'vue'

import { settings } from '~/logic'
import { shouldShowBewlyTopBar } from '~/utils/bilibiliTopBar'

import About from './About/About.vue'
import Appearance from './Appearance/Appearance.vue'
import Ambilight from './BilibiliFeaturesEnhancement/Ambilight/Ambilight.vue'
import AutoPlay from './BilibiliFeaturesEnhancement/AutoPlay/AutoPlay.vue'
import Comments from './BilibiliFeaturesEnhancement/Comments/Comments.vue'
import FavoriteOrganizer from './BilibiliFeaturesEnhancement/FavoriteOrganizer/Favorites.vue'
import ListenVideo from './BilibiliFeaturesEnhancement/ListenVideo/ListenVideo.vue'
import OriginalMoments from './BilibiliFeaturesEnhancement/OriginalMoments/OriginalMoments.vue'
import VideoPlayback from './BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue'
import VipFeatures from './BilibiliFeaturesEnhancement/VipFeatures/VipFeatures.vue'
import VolumeBalance from './BilibiliFeaturesEnhancement/VolumeBalance/VolumeBalance.vue'
import Compatibility from './Compatibility/Compatibility.vue'
import Data from './Data/Data.vue'
import DockAndSidebar from './PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue'
import General from './PluginComponentsAndPages/General/General.vue'
import Home from './PluginComponentsAndPages/Home/Home.vue'
import Interaction from './PluginComponentsAndPages/Interaction/Interaction.vue'
import Moments from './PluginComponentsAndPages/Moments/Moments.vue'
import SearchPage from './PluginComponentsAndPages/SearchPage/SearchPage.vue'
import TopBar from './PluginComponentsAndPages/TopBar/TopBar.vue'
import VideoCard from './PluginComponentsAndPages/VideoCard/VideoCard.vue'
import Shortcuts from './Shortcuts/Shortcuts.vue'
import type { MenuItem } from './types'
import { MenuType } from './types'

export interface SettingsSecondaryPage {
  value: string
  titleKey: string
  descriptionKey?: string
  icon: string
  iconActivated: string
  component: Component
  groupKey?: string
  /** 依赖的模块关闭时隐藏；未提供时始终显示。 */
  available?: () => boolean
}

export interface SettingsMenuDefinition extends MenuItem {
  /** 没有二级页的菜单直接显示该组件。 */
  component?: Component
  pages?: SettingsSecondaryPage[]
  /** 记录当前二级页的 sessionStorage 键，searchCatalog 也用它定位二级页。 */
  storageKey?: string
  /** 依赖的模块关闭时隐藏；未提供时始终显示。 */
  available?: () => boolean
}

const isBewlyPagesEnabled = () => !settings.value.useOriginalBilibiliHomepage
const isTopBarModuleEnabled = () => settings.value.enableTopBarModule
const isBewlyTopBarEnabled = () => shouldShowBewlyTopBar(settings.value.enableTopBarModule, settings.value.enableTopBar, settings.value.useOriginalBilibiliTopBar)
const isDockOrSideBarEnabled = () => settings.value.enableDock || settings.value.enableSideBar
const isPlayerEnabled = () => settings.value.enablePlayerEnhancements
const isCommentsEnabled = () => settings.value.enableCommentEnhancements

// 设置页只存在于独立页面中，组件都已打进同一个文件，同步引入可以避免切换时出现空白帧。
export const settingsMenus: SettingsMenuDefinition[] = [
  {
    value: MenuType.General,
    icon: 'i-mingcute:settings-3-line',
    iconActivated: 'i-mingcute:settings-3-fill',
    titleKey: 'settings.menu_general',
    component: General,
  },
  {
    value: MenuType.BewlyPages,
    icon: 'i-mingcute:web-line',
    iconActivated: 'i-mingcute:web-fill',
    titleKey: 'settings.menu_bewly_pages',
    storageKey: 'bewly-settings-bewly-pages-page',
    available: isBewlyPagesEnabled,
    pages: [
      {
        value: 'home',
        titleKey: 'settings.plugin.home',
        descriptionKey: 'settings.category_browsing_home_desc',
        icon: 'i-mingcute:home-5-line',
        iconActivated: 'i-mingcute:home-5-fill',
        component: Home,
      },
      {
        value: 'moments',
        titleKey: 'settings.plugin.moments',
        descriptionKey: 'settings.category_navigation_moments_desc',
        icon: 'i-mingcute:moment-line',
        iconActivated: 'i-mingcute:moment-fill',
        component: Moments,
      },
      {
        value: 'search',
        titleKey: 'settings.plugin.search',
        descriptionKey: 'settings.category_navigation_search_desc',
        icon: 'i-mingcute:search-2-line',
        iconActivated: 'i-mingcute:search-2-fill',
        component: SearchPage,
      },
    ],
  },
  {
    value: MenuType.BewlyComponents,
    icon: 'i-mingcute:tool-line',
    iconActivated: 'i-mingcute:tool-fill',
    titleKey: 'settings.menu_bewly_components',
    storageKey: 'bewly-settings-bewly-components-page',
    pages: [
      {
        value: 'video-card',
        titleKey: 'settings.plugin.video_card',
        descriptionKey: 'settings.category_browsing_video_card_desc',
        icon: 'i-mingcute:video-camera-line',
        iconActivated: 'i-mingcute:video-camera-fill',
        component: VideoCard,
        // 视频卡片只在 Bewly 页面中使用。
        available: isBewlyPagesEnabled,
      },
      {
        value: 'topbar',
        titleKey: 'settings.plugin.topbar',
        descriptionKey: 'settings.category_navigation_topbar_desc',
        icon: 'i-mingcute:layout-top-line',
        iconActivated: 'i-mingcute:layout-top-fill',
        component: TopBar,
        // 顶栏类型和可见性也在这里设置，模块开启时不论当前类型都要能进入。
        available: isTopBarModuleEnabled,
      },
      {
        value: 'dock',
        titleKey: 'settings.plugin.dock_and_sidebar',
        descriptionKey: 'settings.category_navigation_dock_desc',
        icon: 'i-mingcute:navigation-line',
        iconActivated: 'i-mingcute:navigation-fill',
        component: DockAndSidebar,
        available: isDockOrSideBarEnabled,
      },
      {
        value: 'interaction',
        titleKey: 'settings.plugin.interaction',
        descriptionKey: 'settings.category_navigation_interaction_desc',
        icon: 'i-mingcute:cursor-line',
        iconActivated: 'i-mingcute:cursor-fill',
        component: Interaction,
        // 链接打开方式和抽屉只在 Bewly 页面与 Bewly 顶栏中使用。
        available: () => isBewlyPagesEnabled() || isBewlyTopBarEnabled(),
      },
    ],
  },
  {
    value: MenuType.Bilibili,
    icon: 'i-mingcute:sparkles-2-line',
    iconActivated: 'i-mingcute:sparkles-2-fill',
    titleKey: 'settings.menu_bilibili',
    sectionStart: true,
    storageKey: 'bewly-settings-bilibili-page',
    // 播放相关的子页与站内功能分开列出，避免这一分类变成无序的杂项列表。
    pages: [
      {
        value: 'player',
        groupKey: 'settings.category_group_playback',
        titleKey: 'settings.bilibili_features.video_playback',
        descriptionKey: 'settings.category_playback_player_desc',
        icon: 'i-mingcute:play-circle-line',
        iconActivated: 'i-mingcute:play-circle-fill',
        component: VideoPlayback,
        available: isPlayerEnabled,
      },
      {
        value: 'listen-video',
        groupKey: 'settings.category_group_playback',
        titleKey: 'settings.bilibili_features.listen_video',
        descriptionKey: 'settings.category_bilibili_listen_video_desc',
        icon: 'i-mingcute:headphone-line',
        iconActivated: 'i-mingcute:headphone-fill',
        component: ListenVideo,
        available: isPlayerEnabled,
      },
      {
        value: 'volume-balance',
        groupKey: 'settings.category_group_playback',
        titleKey: 'settings.bilibili_features.volume_balance',
        descriptionKey: 'settings.category_bilibili_volume_balance_desc',
        icon: 'i-mingcute:volume-line',
        iconActivated: 'i-mingcute:volume-fill',
        component: VolumeBalance,
        available: isPlayerEnabled,
      },
      {
        value: 'ambilight',
        groupKey: 'settings.category_group_playback',
        titleKey: 'settings.bilibili_features.ambilight',
        descriptionKey: 'settings.category_bilibili_ambilight_desc',
        icon: 'i-mingcute:light-line',
        iconActivated: 'i-mingcute:light-fill',
        component: Ambilight,
        available: isPlayerEnabled,
      },
      {
        value: 'auto-play',
        groupKey: 'settings.category_group_playback',
        titleKey: 'settings.bilibili_features.auto_play',
        descriptionKey: 'settings.category_playback_autoplay_desc',
        icon: 'i-mingcute:list-check-line',
        iconActivated: 'i-mingcute:list-check-fill',
        component: AutoPlay,
        available: isPlayerEnabled,
      },
      {
        value: 'comments',
        groupKey: 'settings.category_group_site',
        titleKey: 'settings.bilibili_features.comments',
        descriptionKey: 'settings.category_bilibili_comments_desc',
        icon: 'i-mingcute:comment-line',
        iconActivated: 'i-mingcute:comment-fill',
        component: Comments,
        available: isCommentsEnabled,
      },
      {
        value: 'moments',
        groupKey: 'settings.category_group_site',
        titleKey: 'settings.bilibili_features.moments',
        descriptionKey: 'settings.category_bilibili_moments_desc',
        icon: 'i-mingcute:moment-line',
        iconActivated: 'i-mingcute:moment-fill',
        component: OriginalMoments,
      },
      {
        value: 'vip-features',
        groupKey: 'settings.category_group_site',
        titleKey: 'settings.bilibili_features.vip_features',
        descriptionKey: 'settings.category_bilibili_vip_desc',
        icon: 'i-mingcute:vip-1-line',
        iconActivated: 'i-mingcute:vip-1-fill',
        component: VipFeatures,
      },
      {
        value: 'favorite-organizer',
        groupKey: 'settings.category_group_site',
        titleKey: 'settings.bilibili_features.favorite_organizer',
        descriptionKey: 'settings.category_browsing_favorites_desc',
        icon: 'i-mingcute:folder-line',
        iconActivated: 'i-mingcute:folder-fill',
        component: FavoriteOrganizer,
      },
      {
        value: 'compatibility',
        groupKey: 'settings.category_group_site',
        titleKey: 'settings.menu_compatibility',
        descriptionKey: 'settings.category_advanced_compatibility_desc',
        icon: 'i-mingcute:shield-line',
        iconActivated: 'i-mingcute:shield-fill',
        component: Compatibility,
      },
    ],
  },
  {
    value: MenuType.Appearance,
    titleKey: 'settings.menu_appearance',
    icon: 'i-mingcute:paint-brush-line',
    iconActivated: 'i-mingcute:paint-brush-fill',
    component: Appearance,
  },
  {
    value: MenuType.Shortcuts,
    icon: 'i-mingcute:keyboard-line',
    iconActivated: 'i-mingcute:keyboard-fill',
    titleKey: 'settings.shortcuts.title',
    sectionStart: true,
    component: Shortcuts,
  },
  {
    value: MenuType.Data,
    icon: 'i-mingcute:save-2-line',
    iconActivated: 'i-mingcute:save-2-fill',
    titleKey: 'settings.menu_data',
    sectionStart: true,
    component: Data,
  },
  {
    value: MenuType.About,
    icon: 'i-mingcute:information-line',
    iconActivated: 'i-mingcute:information-fill',
    titleKey: 'settings.menu_about',
    component: About,
  },
]
