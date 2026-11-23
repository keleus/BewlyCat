import { defineAsyncComponent } from 'vue'

import type { SettingsMenuDefinition, SettingsSecondaryPage } from '~/components/Settings/settingsMenuDefinitions'
import { createSettingsMenus } from '~/components/Settings/settingsMenuDefinitions'

export type { SettingsMenuDefinition, SettingsSecondaryPage }

// 独立设置页运行在原生 ESM 环境，将 21 个设置子页拆分为按需加载的独立 chunk，
// 首屏只解析当前打开的分类，同时通过 settingsMenuDefinitions 与内容脚本共用同一份菜单结构。
export const settingsMenus: SettingsMenuDefinition[] = createSettingsMenus({
  About: defineAsyncComponent(() => import('~/components/Settings/About/About.vue')),
  Appearance: defineAsyncComponent(() => import('~/components/Settings/Appearance/Appearance.vue')),
  Ambilight: defineAsyncComponent(() => import('~/components/Settings/BilibiliFeaturesEnhancement/Ambilight/Ambilight.vue')),
  AutoPlay: defineAsyncComponent(() => import('~/components/Settings/BilibiliFeaturesEnhancement/AutoPlay/AutoPlay.vue')),
  Comments: defineAsyncComponent(() => import('~/components/Settings/BilibiliFeaturesEnhancement/Comments/Comments.vue')),
  FavoriteOrganizer: defineAsyncComponent(() => import('~/components/Settings/BilibiliFeaturesEnhancement/FavoriteOrganizer/Favorites.vue')),
  OriginalMoments: defineAsyncComponent(() => import('~/components/Settings/BilibiliFeaturesEnhancement/OriginalMoments/OriginalMoments.vue')),
  VideoPlayback: defineAsyncComponent(() => import('~/components/Settings/BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue')),
  VipFeatures: defineAsyncComponent(() => import('~/components/Settings/BilibiliFeaturesEnhancement/VipFeatures/VipFeatures.vue')),
  VolumeBalance: defineAsyncComponent(() => import('~/components/Settings/BilibiliFeaturesEnhancement/VolumeBalance/VolumeBalance.vue')),
  Compatibility: defineAsyncComponent(() => import('~/components/Settings/Compatibility/Compatibility.vue')),
  Data: defineAsyncComponent(() => import('~/components/Settings/Data/Data.vue')),
  DockAndSidebar: defineAsyncComponent(() => import('~/components/Settings/PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue')),
  General: defineAsyncComponent(() => import('~/components/Settings/PluginComponentsAndPages/General/General.vue')),
  Home: defineAsyncComponent(() => import('~/components/Settings/PluginComponentsAndPages/Home/Home.vue')),
  Interaction: defineAsyncComponent(() => import('~/components/Settings/PluginComponentsAndPages/Interaction/Interaction.vue')),
  Moments: defineAsyncComponent(() => import('~/components/Settings/PluginComponentsAndPages/Moments/Moments.vue')),
  SearchPage: defineAsyncComponent(() => import('~/components/Settings/PluginComponentsAndPages/SearchPage/SearchPage.vue')),
  TopBar: defineAsyncComponent(() => import('~/components/Settings/PluginComponentsAndPages/TopBar/TopBar.vue')),
  VideoCard: defineAsyncComponent(() => import('~/components/Settings/PluginComponentsAndPages/VideoCard/VideoCard.vue')),
  Shortcuts: defineAsyncComponent(() => import('~/components/Settings/Shortcuts/Shortcuts.vue')),
})
