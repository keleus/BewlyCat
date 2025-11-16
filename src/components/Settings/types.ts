export enum MenuType {
  General = 'General',
  Appearance = 'Appearance',
  VideoAndPlayback = 'VideoAndPlayback',
  DesktopAndDock = 'DesktopAndDock',
  BewlyPages = 'BewlyPages',
  Shortcuts = 'Shortcuts',
  VolumeBalance = 'VolumeBalance',
  Compatibility = 'Compatibility',
  BilibiliSettings = 'BilibiliSettings',
  About = 'About',
}

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
