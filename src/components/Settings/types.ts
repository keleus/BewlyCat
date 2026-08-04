export enum MenuType {
  General = 'General',
  BewlyPages = 'BewlyPages',
  BewlyComponents = 'BewlyComponents',
  Bilibili = 'Bilibili',
  Appearance = 'Appearance',
  Shortcuts = 'Shortcuts',
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
