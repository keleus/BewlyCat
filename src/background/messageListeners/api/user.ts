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
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/user/info.md#%E7%94%A8%E6%88%B7%E5%90%8D%E7%89%87%E4%BF%A1%E6%81%AF
  getUserCard: {
    url: 'https://api.bilibili.com/x/web-interface/card',
    _fetch: {
      method: 'get',
    },
    params: {
      mid: '',
      photo: false,
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
      // 只保留 fids 的字面逗号，其他字符和参数仍使用标准 URL 编码。
      querySerializer: params => [...params].map(([key, value]) => {
        const encoded = new URLSearchParams({ [key]: value }).toString()
        return key === 'fids' ? encoded.replace(/%2C/gi, ',') : encoded
      }).join('&'),
    },
    params: {
      fids: '', // 用户 mid 列表，用逗号分隔；分批数量由调用方控制
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
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/user/relation.md#查询关注分组列表
  getFollowingGroups: {
    url: 'https://api.bilibili.com/x/relation/tags',
    _fetch: {
      method: 'get',
    },
    afterHandle: AHS.J_D,
  },
  // 分组管理：同文档的创建分组、重命名分组、删除分组、复制关注到分组。
  createFollowingGroup: {
    url: 'https://api.bilibili.com/x/relation/tag/create',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: { tag: '', csrf: '' },
    },
    afterHandle: AHS.J_D,
  },
  renameFollowingGroup: {
    url: 'https://api.bilibili.com/x/relation/tag/update',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: { tagid: '', name: '', csrf: '' },
    },
    afterHandle: AHS.J_D,
  },
  deleteFollowingGroup: {
    url: 'https://api.bilibili.com/x/relation/tag/del',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: { tagid: '', csrf: '' },
    },
    afterHandle: AHS.J_D,
  },
  copyFollowingUsers: {
    url: 'https://api.bilibili.com/x/relation/tags/copyUsers',
    _fetch: {
      method: 'post',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: { fids: '', tagids: '', csrf: '' },
    },
    afterHandle: AHS.J_D,
  },
  // bilibili-API-collect/docs/user/relation.md#移动关注到分组
  moveFollowingUsers: {
    url: 'https://api.bilibili.com/x/relation/tags/moveUsers',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: {
        beforeTagids: '',
        afterTagids: '',
        fids: '',
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
      ps: 30, // 每页项数
      pn: 1, // 页码
      order: 'pubdate', // 排序方式：pubdate最新发布，click最多播放
      tid: 0, // 不筛选分区
    },
    afterHandle: AHS.J_D,
  },
  // https://socialsisteryi.github.io/bilibili-API-collect/docs/login/login_notice.html
  getLoginLog: {
    url: 'https://api.bilibili.com/x/member/web/login/log',
    _fetch: {
      method: 'get',
    },
    params: {
      jsonp: 'jsonp',
    },
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_USER
