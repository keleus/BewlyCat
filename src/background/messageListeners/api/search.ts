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
} satisfies APIMAP

export default API_SEARCH
