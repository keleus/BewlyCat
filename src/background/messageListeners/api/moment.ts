import type { APIMAP } from '../../utils'
import { AHS } from '../../utils'

function serializeMomentVoteBody(body: Record<string, any>) {
  // 动态 id 已超过 JS 安全整数范围，必须以未丢失精度的 JSON 整数发送。
  const dynamicId = String(body.dynamic_id ?? '')
  const serializedDynamicId = /^\d+$/.test(dynamicId) ? dynamicId : '0'
  const { dynamic_id: _dynamicId, ...rest } = body
  const serializedRest = JSON.stringify(rest)
  return `${serializedRest.slice(0, -1)},"dynamic_id":${serializedDynamicId}}`
}

const API_MOMENT = {
  getTopBarNewMomentsCount: {
    url: 'https://api.bilibili.com/x/web-interface/dynamic/entrance',
    _fetch: {
      method: 'get',
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  getTopBarMoments: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/nav',
    _fetch: {
      method: 'get',
    },
    params: {
      type: 'video',
      update_baseline: '',
      offset: '',
    },
    afterHandle: AHS.J_D,
  },
  getTopBarLiveMoments: {
    url: 'https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/FeedList',
    _fetch: {
      method: 'get',
    },
    params: {
      page: 1,
      pagesize: 10,
    },
    afterHandle: AHS.J_D,
  },
  getMoments: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all',
    _fetch: {
      method: 'get',
    },
    params: {
      type: 'all',
      offset: '',
      update_baseline: '',
      // itemOpusStyle: 图文/纯文字走 opus 结构；listOnlyfans: 充电专属列表字段
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard',
    },
    afterHandle: AHS.J_D,
  },
  getMomentsPortal: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/portal',
    _fetch: {
      method: 'get',
    },
    params: {
      up_list_more: 1,
      web_location: '333.1365',
    },
    afterHandle: AHS.J_D,
  },
  getMomentDetail: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail',
    _fetch: {
      method: 'get',
    },
    params: {
      id: '',
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,htmlNewStyle',
    },
    afterHandle: AHS.J_D,
  },
  setMomentLike: {
    url: 'https://api.bilibili.com/x/dynamic/feed/dyn/thumb',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        dyn_id_str: '',
        up: 1,
        spmid: '333.1369.0.0',
        from_spmid: '333.999.0.0',
      },
    },
    params: {
      csrf: '',
    },
    afterHandle: AHS.J_D,
  },
  getMomentVote: {
    url: 'https://api.bilibili.com/x/vote/vote_info',
    _fetch: {
      method: 'get',
    },
    params: {
      vote_id: '',
    },
    afterHandle: AHS.J_D,
  },
  submitMomentVote: {
    url: 'https://api.bilibili.com/x/vote/do_vote',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        vote_id: 0,
        votes: [] as number[],
        voter_uid: 0,
        status: 0,
        op_bit: 0,
        dynamic_id: '',
        csrf: '',
        csrf_token: '',
      },
      bodySerializer: serializeMomentVoteBody,
    },
    params: {
      csrf: '',
    },
    afterHandle: AHS.J_D,
  },
  reserveMoment: {
    url: 'https://api.bilibili.com/x/space/reserve',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        sid: '',
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
  cancelMomentReservation: {
    url: 'https://api.bilibili.com/x/space/reserve/cancel',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        sid: '',
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
  getMomentsByUp: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all',
    _fetch: {
      method: 'get',
    },
    params: {
      host_mid: '',
      type: 'all',
      offset: '',
      update_baseline: '',
      page: 1,
      platform: 'web',
      // itemOpusStyle: 图文/纯文字走 opus 结构；listOnlyfans: 充电专属列表字段
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard',
      web_location: '333.1365',
    },
    afterHandle: AHS.J_D,
  },
  getUserMoments: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space',
    _fetch: {
      method: 'get',
    },
    params: {
      host_mid: '',
      offset: '',
      features: 'itemOpusStyle',
    },
    afterHandle: AHS.J_D,
  },
  getMomentsUpdate: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all/update',
    _fetch: {
      method: 'get',
    },
    params: {
      type: 'video',
      offset: '',
      update_baseline: '0',
    },
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_MOMENT
