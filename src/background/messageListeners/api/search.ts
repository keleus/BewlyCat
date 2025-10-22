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
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2',
    _fetch: {
      method: 'get',
    },
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
    afterHandle: AHS.J_D,
  },
  // 视频搜索
  searchVideo: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    _fetch: {
      method: 'get',
    },
    params: {
      search_type: 'video',
      keyword: '',
      page: 1,
      page_size: 20,
      order: '', // 排序: 综合(default)，最多播放(click)，最新发布(pubdate)，最多弹幕(dm)，最多收藏(stow)
      duration: 0, // 时长筛选: 0-全部，1-10分钟以下，2-10-30分钟，3-30-60分钟，4-60分钟以上
      category_id: '',
      pubtime_begin_s: 0,
      pubtime_end_s: 0,
      context: '',
    },
    afterHandle: AHS.J_D,
  },
  // 番剧搜索
  searchBangumi: {
    url: 'https://api.bilibili.com/x/web-interface/search/type',
    _fetch: {
      method: 'get',
    },
    params: {
      search_type: 'media_bangumi',
      keyword: '',
      page: 1,
      pagesize: 20,
    },
    afterHandle: AHS.J_D,
  },
  // 影视搜索
  searchMediaFt: {
    url: 'https://api.bilibili.com/x/web-interface/search/type',
    _fetch: {
      method: 'get',
    },
    params: {
      search_type: 'media_ft',
      keyword: '',
      page: 1,
      pagesize: 20,
    },
    afterHandle: AHS.J_D,
  },
  // 用户搜索
  searchUser: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    _fetch: {
      method: 'get',
    },
    params: {
      search_type: 'bili_user',
      keyword: '',
      page: 1,
      pagesize: 20,
      order: '', // 排序: 默认(default)，粉丝数由高到低(fans)，等级由高到低(level)
      order_sort: 0, // 用户类型: 0-全部，1-UP主，2-普通用户，3-认证用户
      user_type: 0, // 0-全部，1-up主，2-普通用户，3-认证用户
    },
    afterHandle: AHS.J_D,
  },
  // 直播搜索
  searchLive: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    _fetch: {
      method: 'get',
    },
    params: {
      search_type: 'live',
      keyword: '',
      page: 1,
      pagesize: 20,
      order: '', // 排序: 综合(default)，最新开播(live_time)
    },
    afterHandle: AHS.J_D,
  },
  // 直播间搜索（仅直播间）
  searchLiveRoom: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    _fetch: {
      method: 'get',
    },
    params: {
      search_type: 'live_room',
      keyword: '',
      page: 1,
      pagesize: 20,
      order: '', // 排序: 综合(default)，最新开播(live_time)
    },
    afterHandle: AHS.J_D,
  },
  // 主播搜索
  searchLiveUser: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    _fetch: {
      method: 'get',
    },
    params: {
      search_type: 'live_user',
      keyword: '',
      page: 1,
      page_size: 20,
      order: '', // 排序: 在线人数(online)，粉丝数(fans)
    },
    afterHandle: AHS.J_D,
  },
  // 专栏搜索
  searchArticle: {
    url: 'https://api.bilibili.com/x/web-interface/wbi/search/type',
    _fetch: {
      method: 'get',
    },
    params: {
      search_type: 'article',
      keyword: '',
      page: 1,
      pagesize: 20,
      order: '', // 排序: 综合(default)，最多阅读(click)，最新发布(pubdate)，最多喜欢(likes)，最多评论(reply)
    },
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_SEARCH
