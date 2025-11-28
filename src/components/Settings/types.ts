export enum MenuType {
  PluginComponentsAndPages = 'PluginComponentsAndPages',
  BilibiliFeaturesEnhancement = 'BilibiliFeaturesEnhancement',
  Appearance = 'Appearance',
  Shortcuts = 'Shortcuts',
  Compatibility = 'Compatibility',
  About = 'About',
}

export enum PluginPage {
  General = 'General',
  VideoCard = 'VideoCard',
  TopBar = 'TopBar',
  DockAndSidebar = 'DockAndSidebar',
  Home = 'Home',
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
  title: string
  badge?: string
}
