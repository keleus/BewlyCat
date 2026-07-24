export enum MenuType {
  General = 'General',
  Navigation = 'Navigation',
  Playback = 'Playback',
  Appearance = 'Appearance',
  Shortcuts = 'Shortcuts',
  BilibiliFeaturesEnhancement = 'BilibiliFeaturesEnhancement',
  Advanced = 'Advanced',
  About = 'About',
}

export enum PluginPage {
  General = 'General',
  VideoCard = 'VideoCard',
  TopBar = 'TopBar',
  DockAndSidebar = 'DockAndSidebar',
  Home = 'Home',
  Favorites = 'Favorites',
  Search = 'Search',
  VolumeBalance = 'VolumeBalance',
}

export enum BilibiliFeaturesPage {
  Comments = 'Comments',
  VideoPlayback = 'VideoPlayback',
  AutoPlay = 'AutoPlay',
  VipFeatures = 'VipFeatures',
}

// Legacy enum for backward compatibility
export enum BewlyPage {
  Home = 'Home',
  Search = 'Search',
}

export interface MenuItem {
  value: MenuType
  icon: string
  iconActivated: string
  titleKey: string
  badge?: string
  sectionStart?: boolean
}
