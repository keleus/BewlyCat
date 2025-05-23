export enum MenuType {
  General = 'General',
  DesktopAndDock = 'DesktopAndDock',
  Appearance = 'Appearance',
  BewlyPages = 'BewlyPages',
  Shortcuts = 'Shortcuts',
  Compatibility = 'Compatibility',
  VolumeBalance = 'VolumeBalance',
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
}
