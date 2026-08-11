import browser from 'webextension-polyfill'

const SEARCH_BAR_CHARACTER_ASSET_PATH = '/assets/search-bar-characters'
const SEARCH_BAR_CHARACTER_FILENAMES = [
  '22chan-1.png',
  '33chan-1.png',
  '22chan-2.png',
  '33chan-2.png',
] as const

const searchBarCharacterAssetUrls = Object.fromEntries(
  SEARCH_BAR_CHARACTER_FILENAMES.map(filename => [
    filename,
    browser.runtime.getURL(`${SEARCH_BAR_CHARACTER_ASSET_PATH}/${filename}`),
  ]),
) as Record<typeof SEARCH_BAR_CHARACTER_FILENAMES[number], string>

/**
 * Resolve a bundled search-bar character and migrate URLs from older versions.
 *
 * The path check also handles settings restored from another extension ID.
 */
export function resolveSearchBarCharacterUrl(url: string): string {
  const filename = /^(?:https?:)?\/\/cdn\.jsdelivr\.net\/gh\/BewlyBewly\/Imgs\/searchBarCharacters\/([^/?#]+)$/.exec(url)?.[1]
    || /\/assets\/search-bar-characters\/([^/?#]+)$/.exec(url)?.[1]

  if (filename && filename in searchBarCharacterAssetUrls)
    return searchBarCharacterAssetUrls[filename as typeof SEARCH_BAR_CHARACTER_FILENAMES[number]]

  return url
}

export const DEFAULT_SEARCH_BAR_CHARACTER = searchBarCharacterAssetUrls['33chan-1.png']

export const SEARCH_BAR_CHARACTERS: { name: string, url: string }[] = [
  { name: '22 娘', url: searchBarCharacterAssetUrls['22chan-1.png'] },
  { name: '33 娘', url: DEFAULT_SEARCH_BAR_CHARACTER },
  { name: '22 娘', url: searchBarCharacterAssetUrls['22chan-2.png'] },
  { name: '33 娘', url: searchBarCharacterAssetUrls['33chan-2.png'] },
]

export interface wallpaperItem {
  name: string
  url: string
  thumbnail?: string
  // 本地壁纸引用字段
  id?: string
  isLocal?: boolean
}

export const WALLPAPERS: wallpaperItem[] = [
  // {
  //   name: 'Unsplash Random Nature Image',
  //   url: 'https://source.unsplash.com/1920x1080/?nature',
  //   thumbnail: 'https://source.unsplash.com/1920x1080/?nature',
  // },
  // {
  //   name: 'Unsplash Random Building Image',
  //   url: 'https://source.unsplash.com/1920x1080/?building',
  //   thumbnail: 'https://source.unsplash.com/1920x1080/?building',
  // },
  // {
  //   name: 'Unsplash Random Night Scene Image',
  //   url: 'https://source.unsplash.com/1920x1080/?night-scene',
  //   thumbnail: 'https://source.unsplash.com/1920x1080/?night-scene',
  // },
  {
    name: 'LoremPicsum Random Image',
    url: 'https://picsum.photos/2560/1440/?nature',
    thumbnail: 'https://picsum.photos/2560/1440/?nature',
  },
  {
    name: 'Nicolas Lafargue - Rocky Mountain Cloudscape',
    url: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/rocky-mountain-cloudscape.jpg',
    thumbnail: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/rocky-mountain-cloudscape-thumbnail.jpg',
  },
  {
    name: 'Zongnan Bao- Green white mountains',
    url: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/green-white-mountains.jpg',
    thumbnail: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/green-white-mountains-thumbnail.jpg',
  },
  {
    name: 'Colin Watts - Night Sky Stars',
    url: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/night-sky-stars.jpg',
    thumbnail: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/night-sky-stars-thumbnail.jpg',
  },
  {
    name: 'Ryan Geller - Sailboats moored at Land and Sea Park in The Exumas',
    url: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/sailboats-moored-at-the-exumas.jpg',
    thumbnail: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/sailboats-moored-at-the-exumas-thumbnail.jpg',
  },
  {
    name: 'NASA - Outer Space Photo',
    url: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/outer-space-photo.jpg',
    thumbnail: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/outer-space-photo-thumbnail.jpg',
  },
  {
    name: 'BML2019 VR (pid: 74271400)',
    url: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/bml2019-vr.jpg',
    thumbnail: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/bml2019-vr-thumbnail.jpg',
  },
  {
    name: '2020 拜年祭活动',
    url: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/2020-拜年祭活动.jpg',
    thumbnail: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/2020-拜年祭活动-thumbnail.jpg',
  },
  {
    name: '2020 BDF',
    url: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/2020-bdf.jpg',
    thumbnail: 'https://cdn.jsdelivr.net/gh/BewlyBewly/Imgs/wallpapers/2020-bdf-thumbnail.jpg',
  },
]
