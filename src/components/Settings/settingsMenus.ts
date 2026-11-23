import About from './About/About.vue'
import Appearance from './Appearance/Appearance.vue'
import Ambilight from './BilibiliFeaturesEnhancement/Ambilight/Ambilight.vue'
import AutoPlay from './BilibiliFeaturesEnhancement/AutoPlay/AutoPlay.vue'
import Comments from './BilibiliFeaturesEnhancement/Comments/Comments.vue'
import FavoriteOrganizer from './BilibiliFeaturesEnhancement/FavoriteOrganizer/Favorites.vue'
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
import type { SettingsMenuDefinition, SettingsSecondaryPage } from './settingsMenuDefinitions'
import { createSettingsMenus } from './settingsMenuDefinitions'
import Shortcuts from './Shortcuts/Shortcuts.vue'

export type { SettingsMenuDefinition, SettingsSecondaryPage }

// 内容脚本内的设置浮层使用同步引入，切换时不会出现空白帧；
// 独立设置页通过 vite.config.options.ts 替换为按需分包的 src/options/settingsMenus.ts。
export const settingsMenus: SettingsMenuDefinition[] = createSettingsMenus({
  About,
  Appearance,
  Ambilight,
  AutoPlay,
  Comments,
  FavoriteOrganizer,
  OriginalMoments,
  VideoPlayback,
  VipFeatures,
  VolumeBalance,
  Compatibility,
  Data,
  DockAndSidebar,
  General,
  Home,
  Interaction,
  Moments,
  SearchPage,
  TopBar,
  VideoCard,
  Shortcuts,
})
