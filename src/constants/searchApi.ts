export interface SearchApiDefinition {
  url: string
  params: Record<string, unknown>
}

export const SEARCH_API_DEFINITIONS = {
  searchAll: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2',
    params: {
      __refresh__: true,
      _extra: '',
      context: '',
      ad_resource: 5646,
      platform: 'pc',
      highlight: 1,
      source_tag: 3,
      web_roll_page: 1,
      keyword: '',
      page: 1,
      page_size: 20,
      order: '',
      duration: '',
      from_source: '',
    },
  },
  searchVideo: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: {
      search_type: 'video',
      keyword: '',
      page: 1,
      page_size: 20,
      order: '',
      duration: 0,
      category_id: '',
      pubtime_begin_s: 0,
      pubtime_end_s: 0,
      context: '',
    },
  },
  searchBangumi: {
    url: 'https://api.bilibili.com/x/web-interface/search/type',
    params: {
      search_type: 'media_bangumi',
      keyword: '',
      page: 1,
      pagesize: 20,
    },
  },
  searchMediaFt: {
    url: 'https://api.bilibili.com/x/web-interface/search/type',
    params: {
      search_type: 'media_ft',
      keyword: '',
      page: 1,
      pagesize: 20,
    },
  },
  searchUser: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: {
      search_type: 'bili_user',
      keyword: '',
      page: 1,
      pagesize: 20,
      order: '',
      order_sort: 0,
      user_type: 0,
    },
  },
  searchLive: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: {
      search_type: 'live',
      keyword: '',
      page: 1,
      pagesize: 20,
      order: '',
    },
  },
  searchLiveRoom: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: {
      search_type: 'live_room',
      keyword: '',
      page: 1,
      pagesize: 20,
      order: '',
    },
  },
  searchLiveUser: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: {
      search_type: 'live_user',
      keyword: '',
      page: 1,
      page_size: 20,
      order: '',
    },
  },
  searchArticle: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    params: {
      search_type: 'article',
      keyword: '',
      page: 1,
      pagesize: 20,
      order: '',
    },
  },
} satisfies Record<string, SearchApiDefinition>

export type SearchApiMethod = keyof typeof SEARCH_API_DEFINITIONS
