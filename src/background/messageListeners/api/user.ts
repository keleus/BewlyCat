import type { APIMAP } from '../../utils'
import { AHS } from '../../utils'

const API_USER = {
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/e379d904c2753fa30e9083f59016f07e89d19467/docs/login/login_info.md#%E5%AF%BC%E8%88%AA%E6%A0%8F%E7%94%A8%E6%88%B7%E4%BF%A1%E6%81%AF
  getUserInfo: {
    url: 'https://api.bilibili.com/x/web-interface/nav',
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  getUserStat: {
    url: 'https://api.bilibili.com/x/web-interface/nav/stat',
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/ed9ac01b6769430aa3f12ad02c2ed337a96924eb/docs/user/relation.md#操作用户关系
  relationModify: {
    url: 'https://api.bilibili.com/x/relation/modify',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        fid: '',
        act: 1,
        re_src: 11,
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
  // 批量查询用户关系
  getRelations: {
    url: 'https://api.bilibili.com/x/relation/relations',
    _fetch: {
      method: 'get',
    },
    params: {
      fids: '', // 用户mid列表，用逗号分隔，最多40个
    },
    afterHandle: AHS.J_D,
  },
  getPrivilegeInfo: {
    url: 'https://api.bilibili.com/x/vip/privilege/my',
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  exchangeCoupon: {
    url: 'https://api.bilibili.com/x/vip/privilege/receive',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        type: '1',
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
  // 大会员每日经验领取 https://socialsisteryi.github.io/bilibili-API-collect/docs/vip/action.html#%E5%A4%A7%E4%BC%9A%E5%91%98%E6%AF%8F%E6%97%A5%E7%BB%8F%E9%AA%8C
  receiveVipExp: {
    url: 'https://api.bilibili.com/x/vip/experience/add',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        csrf: '',
      },
    },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/user/relation.md#查询用户关注明细
  getUserFollowings: {
    url: 'https://api.bilibili.com/x/relation/followings',
    _fetch: {
      method: 'get',
    },
    params: {
      vmid: '', // 目标用户的mid
      ps: 50, // 每页项数
      pn: 1, // 页码
      order_type: '', // 排序方式：留空按关注顺序，'attention'按经常访问
    },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/user/space.md#查询用户投稿视频明细
  getUserVideos: {
    url: 'https://api.bilibili.com/x/space/wbi/arc/search',
    _fetch: {
      method: 'get',
    },
    params: {
      mid: '', // 目标用户的mid
      ps: 30, // 每页项数，默认30
      pn: 1, // 页码，默认1
      order: 'pubdate', // 排序方式：pubdate最新发布，click最多播放
      index: 1, // 防风控参数
      order_avoided: true, // 防风控参数
      platform: 'web', // 平台标识
      web_location: '333.1387', // 防风控参数（来自B站实际请求）
      dm_img_list: '[]', // 防风控参数
      dm_img_str: 'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ', // WebGL 1.0 (OpenGL ES 2.0 Chromium)的Base64
      dm_cover_img_str: 'QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgUlRYIDQwNjAgTGFwdG9wIEdQVSAoMHgwMDAwMjhFMCkgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoTlZJRElBKQ', // GPU信息的Base64
    },
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_USER
