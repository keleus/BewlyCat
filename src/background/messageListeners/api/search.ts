import { SEARCH_API_DEFINITIONS } from '~/constants/searchApi'

import type { APIMAP } from '../../utils'
import { AHS } from '../../utils'

const API_SEARCH = {
  getSearchSuggestion: {
    url: 'https://s.search.bilibili.com/main/suggest',
    _fetch: {
      method: 'get',
    },
    params: {
      term: '',
      highlight: '',
    },
    afterHandle: AHS.J_D,
  },
  getDefaultSearchRecommendation: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/default',
    _fetch: {
      method: 'get',
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  getHotSearchList: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/square',
    _fetch: {
      method: 'get',
    },
    params: {
      limit: 50,
      platform: 'web',
    },
    afterHandle: AHS.J_D,
  },
  // 综合搜索
  searchAll: {
    ...SEARCH_API_DEFINITIONS.searchAll,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 视频搜索
  searchVideo: {
    ...SEARCH_API_DEFINITIONS.searchVideo,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 番剧搜索
  searchBangumi: {
    ...SEARCH_API_DEFINITIONS.searchBangumi,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 影视搜索
  searchMediaFt: {
    ...SEARCH_API_DEFINITIONS.searchMediaFt,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 用户搜索
  searchUser: {
    ...SEARCH_API_DEFINITIONS.searchUser,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 直播搜索
  searchLive: {
    ...SEARCH_API_DEFINITIONS.searchLive,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 直播间搜索（仅直播间）
  searchLiveRoom: {
    ...SEARCH_API_DEFINITIONS.searchLiveRoom,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 主播搜索
  searchLiveUser: {
    ...SEARCH_API_DEFINITIONS.searchLiveUser,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 专栏搜索
  searchArticle: {
    ...SEARCH_API_DEFINITIONS.searchArticle,
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_SEARCH
