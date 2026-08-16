export interface SearchApiDefinition {
  url: string
  params: Record<string, unknown>
}

type WidenSearchParam<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T

type WidenSearchParams<T extends Record<string, unknown>> = {
  [K in keyof T]: WidenSearchParam<T[K]>
}

function defineSearchParams<T extends Record<string, unknown>>(params: T): WidenSearchParams<T> {
  return params as WidenSearchParams<T>
}

export const SEARCH_PAGE_SIZES = {
  all: 42,
  video: 42,
  pgc: 12,
  user: 36,
  live: 42,
  article: 20,
} as const

const SEARCH_ALL_PARAMS = {
  __refresh__: true,
  _extra: '',
  context: '',
  page: 1,
  page_size: SEARCH_PAGE_SIZES.all,
  order: '',
  pubtime_begin_s: 0,
  pubtime_end_s: 0,
  duration: '',
  from_source: '',
  from_spmid: '333.337',
  platform: 'pc',
  highlight: 1,
  single_column: 0,
  keyword: '',
  qv_id: '',
  ad_resource: 5646,
  source_tag: 3,
  web_roll_page: 1,
  web_location: 1430654,
}

const SEARCH_TYPE_PARAMS = {
  category_id: '',
  search_type: '',
  ad_resource: 5646,
  __refresh__: true,
  _extra: '',
  context: '',
  page: 1,
  page_size: SEARCH_PAGE_SIZES.video,
  order: '',
  pubtime_begin_s: 0,
  pubtime_end_s: 0,
  duration: '',
  from_source: '',
  from_spmid: '333.337',
  platform: 'pc',
  highlight: 1,
  single_column: 0,
  keyword: '',
  qv_id: '',
  source_tag: 3,
  gaia_vtoken: '',
  web_location: 1430654,
}

export const SEARCH_API_DEFINITIONS = {
  searchAll: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2',
    params: defineSearchParams(SEARCH_ALL_PARAMS),
  },
  searchVideo: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: defineSearchParams({
      ...SEARCH_TYPE_PARAMS,
      search_type: 'video',
      ad_resource: 5654,
      page_size: SEARCH_PAGE_SIZES.video,
      duration: 0,
      dynamic_offset: 0,
      web_roll_page: 1,
    }),
  },
  searchBangumi: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: defineSearchParams({
      ...SEARCH_TYPE_PARAMS,
      search_type: 'media_bangumi',
      page_size: SEARCH_PAGE_SIZES.pgc,
    }),
  },
  searchMediaFt: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: defineSearchParams({
      ...SEARCH_TYPE_PARAMS,
      search_type: 'media_ft',
      page_size: SEARCH_PAGE_SIZES.pgc,
    }),
  },
  searchUser: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: defineSearchParams({
      ...SEARCH_TYPE_PARAMS,
      search_type: 'bili_user',
      page_size: SEARCH_PAGE_SIZES.user,
      order_sort: 0,
      user_type: 0,
      dynamic_offset: 0,
    }),
  },
  searchLive: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: defineSearchParams({
      ...SEARCH_TYPE_PARAMS,
      search_type: 'live',
      page_size: SEARCH_PAGE_SIZES.live,
      order: 'online',
      dynamic_offset: 0,
    }),
  },
  searchLiveRoom: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: defineSearchParams({
      ...SEARCH_TYPE_PARAMS,
      // 原站的“直播间”标签仍请求 live，再从组合响应中读取 live_room。
      search_type: 'live',
      page_size: SEARCH_PAGE_SIZES.live,
      order: 'online',
      dynamic_offset: 0,
    }),
  },
  searchLiveUser: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: defineSearchParams({
      ...SEARCH_TYPE_PARAMS,
      search_type: 'live_user',
      page_size: SEARCH_PAGE_SIZES.live,
      order: 'online',
      dynamic_offset: 0,
    }),
  },
  searchArticle: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: defineSearchParams({
      ...SEARCH_TYPE_PARAMS,
      search_type: 'article',
      page_size: SEARCH_PAGE_SIZES.article,
      order: 'totalrank',
      category_id: 0,
    }),
  },
} satisfies Record<string, SearchApiDefinition>

export type SearchApiMethod = keyof typeof SEARCH_API_DEFINITIONS
