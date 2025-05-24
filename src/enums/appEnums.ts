export enum LanguageType {
  English = 'en',
  Mandarin_CN = 'cmn-CN',
  Mandarin_TW = 'cmn-TW',
  Cantonese = 'jyut', // Hakadao: jyut 爲「粵」之粵拼，我覺得保留這一點作爲彩蛋或冷知識也不錯
}

export enum AppPage {
  Home = 'Home',
  Search = 'Search',
  Anime = 'Anime',
  History = 'History',
  Favorites = 'Favorites',
  WatchLater = 'WatchLater',
  Moments = 'Moments',
}

export enum TopBarPopup {
  FavoritesPop = 'FavoritesPop',
  HistoryPop = 'HistoryPop',
  MomentsPop = 'MomentsPop',
  NotificationsPop = 'NotificationsPop',
  UploadPop = 'UploadPop',
  WatchLaterPop = 'WatchLaterPop',
}

export enum VideoPageTopBarConfig {
  AlwaysShow = 'alwaysShow', // 总是显示
  AlwaysHide = 'alwaysHide', // 总是隐藏
  ShowOnMouse = 'showOnMouse', // 鼠标显示
  ShowOnScroll = 'showOnScroll', // 滚动显示
}
