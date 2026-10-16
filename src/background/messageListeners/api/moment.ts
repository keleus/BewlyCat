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

// 评论接口按 Web 端只提交非空字段，空 root/parent 会被视为非法楼层。
function serializeCommentForm(body: Record<string, any>) {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null && value !== '')
      form.append(key, String(value))
  }
  return form
}

// 与 Web 端一致：三点菜单删除项附带的 params 原样提交，再以当前动态 id 覆盖。
function serializeMomentRemoveBody(body: Record<string, any>) {
  return JSON.stringify({ ...body.extra, dyn_id_str: String(body.dyn_id_str || '') })
}

// 运行时消息只能传可序列化数据，图片以 data URL 进入后台后再还原为 multipart 文件。
function serializeImageUpload(body: Record<string, any>) {
  const match = /^data:([^;,]+);base64,([\w+/=]+)$/.exec(String(body.file_up || ''))
  if (!match)
    throw new Error('Invalid image data')
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  const form = new FormData()
  form.append('file_up', new Blob([bytes], { type: match[1] }), String(body.file_name || 'image'))
  form.append('category', String(body.category || 'daily'))
  form.append('biz', String(body.biz || 'new_dyn'))
  form.append('csrf', String(body.csrf || ''))
  return form
}

const API_MOMENT = {
  getMomentComments: {
    url: 'https://api.bilibili.com/x/v2/reply',
    _fetch: { method: 'get' },
    params: { type: 17, oid: '', sort: 0, nohot: 1, pn: 1, ps: 20 },
    afterHandle: AHS.J_D,
  },
  getMomentCommentReplies: {
    url: 'https://api.bilibili.com/x/v2/reply/reply',
    _fetch: { method: 'get' },
    params: { type: 17, oid: '', root: '', pn: 1, ps: 20 },
    afterHandle: AHS.J_D,
  },
  setMomentCommentLike: {
    url: 'https://api.bilibili.com/x/v2/reply/action',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: { type: 17, oid: '', rpid: '', action: 1, csrf: '' },
    },
    afterHandle: AHS.J_D,
  },
  // 与动态页 Web 评论框提交的字段保持一致；sync_to_dynamic=1 即“评论并转发”。
  addMomentComment: {
    url: 'https://api.bilibili.com/x/v2/reply/add',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: {
        type: 17,
        oid: '',
        root: '',
        parent: '',
        message: '',
        plat: 1,
        at_name_to_mid: '',
        pictures: '',
        sync_to_dynamic: '' as 1 | '',
        gaia_source: 'main_web',
        statistics: JSON.stringify({ appId: 100, platform: 5 }),
        csrf: '',
      },
      bodySerializer: serializeCommentForm,
    },
    afterHandle: AHS.J_D,
  },
  deleteMomentComment: {
    url: 'https://api.bilibili.com/x/v2/reply/del',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: { type: 17, oid: '', rpid: '', csrf: '' },
    },
    afterHandle: AHS.J_D,
  },
  uploadMomentCommentImage: {
    url: 'https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs',
    _fetch: {
      method: 'post',
      body: { file_up: '', file_name: '', category: 'daily', biz: 'new_dyn', csrf: '' },
      bodySerializer: serializeImageUpload,
    },
    afterHandle: AHS.J_D,
  },
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
  removeMoment: {
    url: 'https://api.bilibili.com/x/dynamic/feed/operate/remove',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: { dyn_id_str: '', extra: {} as Record<string, unknown> },
      bodySerializer: serializeMomentRemoveBody,
    },
    params: { csrf: '', platform: 'web' },
    afterHandle: AHS.J_D,
  },
  reportMoment: {
    url: 'https://api.bilibili.com/x/dynamic/feed/dynamic_report/add',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      // reason_type 为 0（其他）时才提交说明，其余理由与 Web 端一致传 null。
      body: { accused_uid: 0, dynamic_id: '', reason_type: 0, reason_desc: null as string | null },
    },
    params: { csrf: '' },
    afterHandle: AHS.J_D,
  },
  getRepostConfig: {
    url: 'https://api.bilibili.com/x/dynamic/feed/create/init_check',
    _fetch: { method: 'get' },
    params: { scene: 2 },
    afterHandle: AHS.J_D,
  },
  getRepostEmotes: {
    url: 'https://api.bilibili.com/x/emote/user/panel/web',
    _fetch: { method: 'get' },
    params: { business: 'reply' },
    afterHandle: AHS.J_D,
  },
  searchRepostMentions: {
    url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/mention/search',
    _fetch: { method: 'get' },
    params: { keyword: '' },
    afterHandle: AHS.J_D,
  },
  searchRepostTopics: {
    url: 'https://api.bilibili.com/x/topic/pub/search',
    _fetch: { method: 'get' },
    params: { keywords: '', page_size: 20, page_num: 1 },
    afterHandle: AHS.J_D,
  },
  getRepostCommercialOrders: {
    url: 'https://cm.bilibili.com/commercialorder/api/web_api/v1/upper/order_dynamic/list',
    _fetch: { method: 'get' },
    params: { cooperationType: 3 },
    afterHandle: AHS.J_D,
  },
  checkRepost: {
    url: 'https://api.bilibili.com/x/dynamic/feed/create/submit_check',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: { content: {} as Record<string, unknown>, scene: 4, attach_card: undefined as Record<string, unknown> | undefined },
    },
    params: { csrf: '' },
    afterHandle: AHS.J_D,
  },
  submitRepost: {
    url: 'https://api.bilibili.com/x/dynamic/feed/create/dyn',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: { dyn_req: {} as Record<string, unknown>, web_repost_src: { dyn_id_str: '' } },
    },
    params: { csrf: '', platform: 'web' },
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
