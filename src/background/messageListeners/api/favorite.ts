import type { APIMAP } from '../../utils'
import { AHS } from '../../utils'

const API_FAVORITE = {
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/info.md#%E8%8E%B7%E5%8F%96%E6%8C%87%E5%AE%9A%E7%94%A8%E6%88%B7%E5%88%9B%E5%BB%BA%E7%9A%84%E6%89%80%E6%9C%89%E6%94%B6%E8%97%8F%E5%A4%B9%E4%BF%A1%E6%81%AF
  getFavoriteCategories: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/created/list-all',
    _fetch: {
      method: 'get',
    },
    params: {
      up_mid: '',
    },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/list.md#%E8%8E%B7%E5%8F%96%E6%94%B6%E8%97%8F%E5%A4%B9%E5%86%85%E5%AE%B9%E6%98%8E%E7%BB%86%E5%88%97%E8%A1%A8
  getFavoriteResources: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/list',
    _fetch: {
      method: 'get',
    },
    params: {
      media_id: -1,
      pn: 1,
      ps: 20,
      keyword: '',
      order: 'mtime',
      type: 0,
      tid: 0,
      platform: 'web',
    },
    afterHandle: AHS.J_D,
  },
  getCollectedFavoriteSeasons: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/collected/list',
    _fetch: {
      method: 'get',
    },
    params: {
      pn: 1,
      ps: 50,
      up_mid: '',
      platform: 'web',
      web_location: '333.1387',
    },
    afterHandle: AHS.J_D,
  },
  getFavoriteSeasonResources: {
    url: 'https://api.bilibili.com/x/space/fav/season/list',
    _fetch: {
      method: 'get',
    },
    params: {
      season_id: -1,
      pn: 1,
      ps: 40,
      web_location: '333.1387',
    },
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/action.md#%E6%89%B9%E9%87%8F%E5%88%A0%E9%99%A4%E5%86%85%E5%AE%B9
  patchDelFavoriteResources: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/batch-del',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        resources: '',
        media_id: 0,
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  moveFavoriteResources: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/move',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        resources: '',
        src_media_id: 0,
        tar_media_id: 0,
        mid: '',
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  copyFavoriteResources: {
    url: 'https://api.bilibili.com/x/v3/fav/resource/copy',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        resources: '',
        src_media_id: 0,
        tar_media_id: 0,
        mid: '',
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  // https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/fav/action.md#%E4%BF%AE%E6%94%B9%E6%94%B6%E8%97%8F%E5%A4%B9
  editFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/edit',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        media_id: 0,
        title: '',
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  // 删除收藏夹，media_ids 支持逗号拼接批量删除
  delFavoriteFolder: {
    url: 'https://api.bilibili.com/x/v3/fav/folder/del',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        media_ids: '',
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
  // 取消收藏合集（他人合集只能整体取消收藏）
  unfavFavoriteSeason: {
    url: 'https://api.bilibili.com/x/v3/fav/season/unfav',
    _fetch: {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        season_id: 0,
        platform: 'web',
        csrf: '',
      },
    },
    params: {},
    afterHandle: AHS.J_D,
  },
} satisfies APIMAP

export default API_FAVORITE
