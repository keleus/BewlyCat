import { defineAsyncComponent } from 'vue'

import type { SettingsMenuDefinition, SettingsSecondaryPage } from './settingsMenuDefinitions'
import { createSettingsMenus } from './settingsMenuDefinitions'

export type { SettingsMenuDefinition, SettingsSecondaryPage }

// 内容脚本与独立设置页均运行在原生 ESM 环境，将 21 个设置子页拆分为按需加载的独立 chunk，
// 避免首屏解析设置子页及其重型依赖（vuedraggable / sortablejs / qrcode 等）。
export const settingsMenus: SettingsMenuDefinition[] = createSettingsMenus({
  About: defineAsyncComponent(() => import('./About/About.vue')),
  Appearance: defineAsyncComponent(() => import('./Appearance/Appearance.vue')),
  Ambilight: defineAsyncComponent(
    () => import('./BilibiliFeaturesEnhancement/Ambilight/Ambilight.vue'),
  ),
  AutoPlay: defineAsyncComponent(
    () => import('./BilibiliFeaturesEnhancement/AutoPlay/AutoPlay.vue'),
  ),
  Comments: defineAsyncComponent(
    () => import('./BilibiliFeaturesEnhancement/Comments/Comments.vue'),
  ),
  FavoriteOrganizer: defineAsyncComponent(
    () => import('./BilibiliFeaturesEnhancement/FavoriteOrganizer/Favorites.vue'),
  ),
  OriginalMoments: defineAsyncComponent(
    () => import('./BilibiliFeaturesEnhancement/OriginalMoments/OriginalMoments.vue'),
  ),
  VideoPlayback: defineAsyncComponent(
    () => import('./BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue'),
  ),
  VipFeatures: defineAsyncComponent(
    () => import('./BilibiliFeaturesEnhancement/VipFeatures/VipFeatures.vue'),
  ),
  VolumeBalance: defineAsyncComponent(
    () => import('./BilibiliFeaturesEnhancement/VolumeBalance/VolumeBalance.vue'),
  ),
  Compatibility: defineAsyncComponent(() => import('./Compatibility/Compatibility.vue')),
  Data: defineAsyncComponent(() => import('./Data/Data.vue')),
  DockAndSidebar: defineAsyncComponent(
    () => import('./PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue'),
  ),
  General: defineAsyncComponent(() => import('./PluginComponentsAndPages/General/General.vue')),
  Home: defineAsyncComponent(() => import('./PluginComponentsAndPages/Home/Home.vue')),
  Interaction: defineAsyncComponent(
    () => import('./PluginComponentsAndPages/Interaction/Interaction.vue'),
  ),
  Moments: defineAsyncComponent(() => import('./PluginComponentsAndPages/Moments/Moments.vue')),
  SearchPage: defineAsyncComponent(
    () => import('./PluginComponentsAndPages/SearchPage/SearchPage.vue'),
  ),
  TopBar: defineAsyncComponent(() => import('./PluginComponentsAndPages/TopBar/TopBar.vue')),
  VideoCard: defineAsyncComponent(
    () => import('./PluginComponentsAndPages/VideoCard/VideoCard.vue'),
  ),
  Shortcuts: defineAsyncComponent(() => import('./Shortcuts/Shortcuts.vue')),
})
