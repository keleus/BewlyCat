import type { APIMAP } from '../../utils'
import { AHS } from '../../utils'

const COMMENT_MAIN_URL = 'https://api.bilibili.com/x/v2/reply/wbi/main'
const COMMENT_REPLIES_URL = 'https://api.bilibili.com/x/v2/reply/reply'

const COMMENT_MAIN_PARAMS = {
  mode: 2,
  oid: '' as string | number,
  pagination_str: '',
  plat: 1,
  seek_rpid: '' as string | number,
  type: 1 as string | number,
  web_location: 1315875,
}

const COMMENT_REPLIES_PARAMS = {
  oid: '' as string | number,
  pn: 0,
  root: '' as string | number,
  sort: 0,
  type: 1 as string | number,
}

const API_COMMENT = {
  getCommentMain: {
    url: COMMENT_MAIN_URL,
    _fetch: {
      method: 'get',
    },
    params: COMMENT_MAIN_PARAMS,
    afterHandle: AHS.J_D,
  },
  getNoCookieCommentMain: {
    url: COMMENT_MAIN_URL,
    _fetch: {
      method: 'get',
      credentials: 'omit',
    },
    params: COMMENT_MAIN_PARAMS,
    afterHandle: AHS.J_D,
  },
  getCommentReplies: {
    url: COMMENT_REPLIES_URL,
    _fetch: {
      method: 'get',
    },
    params: COMMENT_REPLIES_PARAMS,
    afterHandle: AHS.J_D,
  },
  getNoCookieCommentReplies: {
    url: COMMENT_REPLIES_URL,
    _fetch: {
      method: 'get',
      credentials: 'omit',
    },
    params: COMMENT_REPLIES_PARAMS,
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_COMMENT
