export interface TopBarChannelConfig {
  key: string
  nameKey: string
  icon: string
  href: string
  color?: string
}

export const genreChannelConfigs: TopBarChannelConfig[] = [
  { key: 'anime', nameKey: 'topbar.logo_dropdown.anime', icon: '#channel-anime', href: 'https://www.bilibili.com/anime' },
  { key: 'movies', nameKey: 'topbar.logo_dropdown.movies', icon: '#channel-movie', href: 'https://www.bilibili.com/movie' },
  { key: 'chinese_anime', nameKey: 'topbar.logo_dropdown.chinese_anime', icon: '#channel-guochuang', href: 'https://www.bilibili.com/guochuang' },
  { key: 'tv_shows', nameKey: 'topbar.logo_dropdown.tv_shows', icon: '#channel-teleplay', href: 'https://www.bilibili.com/tv' },
  { key: 'variety_shows', nameKey: 'topbar.logo_dropdown.variety_shows', icon: '#channel-zongyi', href: 'https://www.bilibili.com/variety' },
  { key: 'documentary_films', nameKey: 'topbar.logo_dropdown.documentary_films', icon: '#channel-documentary', href: 'https://www.bilibili.com/documentary' },
  { key: 'animations', nameKey: 'topbar.logo_dropdown.animations', icon: '#channel-douga', href: 'https://www.bilibili.com/c/douga' },
  { key: 'gaming', nameKey: 'topbar.logo_dropdown.gaming', icon: '#channel-game', href: 'https://www.bilibili.com/c/game' },
  { key: 'kichiku', nameKey: 'topbar.logo_dropdown.kichiku', icon: '#channel-kichiku', href: 'https://www.bilibili.com/c/kichiku' },
  { key: 'music', nameKey: 'topbar.logo_dropdown.music', icon: '#channel-music', href: 'https://www.bilibili.com/c/music' },
  { key: 'dance', nameKey: 'topbar.logo_dropdown.dance', icon: '#channel-dance', href: 'https://www.bilibili.com/c/dance' },
  { key: 'cinephile', nameKey: 'topbar.logo_dropdown.cinephile', icon: '#channel-cinephile', href: 'https://www.bilibili.com/c/cinephile' },
  { key: 'showbiz', nameKey: 'topbar.logo_dropdown.showbiz', icon: '#channel-ent', href: 'https://www.bilibili.com/c/ent' },
  { key: 'knowledge', nameKey: 'topbar.logo_dropdown.knowledge', icon: '#channel-knowledge', href: 'https://www.bilibili.com/c/knowledge' },
  { key: 'technology', nameKey: 'topbar.logo_dropdown.technology', icon: '#channel-tech', href: 'https://www.bilibili.com/c/tech' },
  { key: 'news', nameKey: 'topbar.logo_dropdown.news', icon: '#channel-information', href: 'https://www.bilibili.com/c/information' },
  { key: 'foods', nameKey: 'topbar.logo_dropdown.foods', icon: '#channel-food', href: 'https://www.bilibili.com/c/food' },
  { key: 'shortplay', nameKey: 'topbar.logo_dropdown.shortplay', icon: '#channel-shortplay', href: 'https://www.bilibili.com/c/shortplay' },
  { key: 'cars', nameKey: 'topbar.logo_dropdown.cars', icon: '#channel-car', href: 'https://www.bilibili.com/c/car' },
  { key: 'fashion', nameKey: 'topbar.logo_dropdown.fashion', icon: '#channel-fashion', href: 'https://www.bilibili.com/c/fashion' },
  { key: 'sports', nameKey: 'topbar.logo_dropdown.sports', icon: '#channel-sports', href: 'https://www.bilibili.com/c/sports' },
  { key: 'animals', nameKey: 'topbar.logo_dropdown.animals', icon: '#channel-animal', href: 'https://www.bilibili.com/c/animal' },
  { key: 'vlog', nameKey: 'topbar.logo_dropdown.vlog', icon: '#channel-vlog', href: 'https://www.bilibili.com/c/vlog' },
  { key: 'painting', nameKey: 'topbar.logo_dropdown.painting', icon: '#channel-painting', href: 'https://www.bilibili.com/c/painting' },
  { key: 'ai', nameKey: 'topbar.logo_dropdown.ai', icon: '#channel-ai', href: 'https://www.bilibili.com/c/ai' },
  { key: 'home', nameKey: 'topbar.logo_dropdown.home', icon: '#channel-home', href: 'https://www.bilibili.com/c/home' },
  { key: 'outdoors', nameKey: 'topbar.logo_dropdown.outdoors', icon: '#channel-outdoors', href: 'https://www.bilibili.com/c/outdoors' },
  { key: 'gym', nameKey: 'topbar.logo_dropdown.gym', icon: '#channel-gym', href: 'https://www.bilibili.com/c/gym' },
  { key: 'handmake', nameKey: 'topbar.logo_dropdown.handmake', icon: '#channel-handmake', href: 'https://www.bilibili.com/c/handmake' },
  { key: 'travel', nameKey: 'topbar.logo_dropdown.travel', icon: '#channel-travel', href: 'https://www.bilibili.com/c/travel' },
  { key: 'rural', nameKey: 'topbar.logo_dropdown.rural', icon: '#channel-rural', href: 'https://www.bilibili.com/c/rural' },
  { key: 'parenting', nameKey: 'topbar.logo_dropdown.parenting', icon: '#channel-parenting', href: 'https://www.bilibili.com/c/parenting' },
  { key: 'health', nameKey: 'topbar.logo_dropdown.health', icon: '#channel-health', href: 'https://www.bilibili.com/c/health' },
  { key: 'emotion', nameKey: 'topbar.logo_dropdown.emotion', icon: '#channel-emotion', href: 'https://www.bilibili.com/c/emotion' },
  { key: 'life_joy', nameKey: 'topbar.logo_dropdown.life_joy', icon: '#channel-life-joy', href: 'https://www.bilibili.com/c/life_joy' },
  { key: 'life_experience', nameKey: 'topbar.logo_dropdown.life_experience', icon: '#channel-life-experience', href: 'https://www.bilibili.com/c/life_experience' },
  { key: 'charitable_events', nameKey: 'topbar.logo_dropdown.charitable_events', icon: '#channel-love', href: 'https://love.bilibili.com' },
]

export const otherChannelConfigs: TopBarChannelConfig[] = [
  { key: 'articles', nameKey: 'topbar.logo_dropdown.articles', icon: '#channel-read', href: 'https://www.bilibili.com/read/home' },
  { key: 'live', nameKey: 'topbar.logo_dropdown.live', icon: '#channel-live', href: 'https://live.bilibili.com' },
  { key: 'activities', nameKey: 'topbar.logo_dropdown.activities', icon: '#channel-activity', href: 'https://www.bilibili.com/blackboard/activity-list.html' },
  { key: 'paid_courses', nameKey: 'topbar.logo_dropdown.paid_courses', icon: '#channel-zhishi', href: 'https://www.bilibili.com/cheese' },
  { key: 'community', nameKey: 'topbar.logo_dropdown.community', icon: '#channel-blackroom', href: 'https://www.bilibili.com/blackboard/activity-5zJxM3spoS.html' },
  { key: 'music_plus', nameKey: 'topbar.logo_dropdown.music_plus', icon: '#channel-musicplus', href: 'https://www.bilibili.com/c/musicplus' },
  { key: 'game_center', nameKey: 'topbar.logo_dropdown.game_center', icon: 'i-mingcute:game-2-fill', href: 'https://game.bilibili.com/platform', color: '#69B1DD' },
  { key: 'comic_con_and_goods', nameKey: 'topbar.logo_dropdown.comic_con_and_goods', icon: 'i-mingcute:store-fill', href: 'https://show.bilibili.com/platform/home.html', color: '#E4C081' },
  { key: 'manga', nameKey: 'topbar.logo_dropdown.manga', icon: 'i-mingcute:cat-fill', href: 'https://manga.bilibili.com', color: '#FFC1CC' },
  { key: 'game_competitions', nameKey: 'topbar.logo_dropdown.game_competitions', icon: 'i-mingcute:sword-fill', href: 'https://www.bilibili.com/match/home', color: '#C8D3DF' },
]

export const allChannelConfigs: TopBarChannelConfig[] = [
  ...genreChannelConfigs,
  ...otherChannelConfigs,
]
