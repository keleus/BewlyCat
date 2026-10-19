// 旧版视频分区（tid / tname），整理自 bilibili-API-collect docs/video/video_zone.md。
// 收藏夹相关接口返回的 tid 仍属于旧版分区体系；已下线分区不列出。
export interface VideoZone {
  tid: number
  name: string
  children: { tid: number, name: string }[]
}

export const VIDEO_ZONES: VideoZone[] = [
  { tid: 1, name: '动画', children: [{ tid: 24, name: 'MAD·AMV' }, { tid: 25, name: 'MMD·3D' }, { tid: 47, name: '同人·手书' }, { tid: 257, name: '配音' }, { tid: 210, name: '手办·模玩' }, { tid: 86, name: '特摄' }, { tid: 253, name: '动漫杂谈' }, { tid: 27, name: '综合' }] },
  { tid: 13, name: '番剧', children: [{ tid: 51, name: '资讯' }, { tid: 152, name: '官方延伸' }, { tid: 32, name: '完结动画' }, { tid: 33, name: '连载动画' }] },
  { tid: 167, name: '国创', children: [{ tid: 153, name: '国产动画' }, { tid: 168, name: '国产原创相关' }, { tid: 169, name: '布袋戏' }, { tid: 170, name: '资讯' }, { tid: 195, name: '动态漫·广播剧' }] },
  { tid: 3, name: '音乐', children: [{ tid: 28, name: '原创音乐' }, { tid: 29, name: '音乐现场' }, { tid: 31, name: '翻唱' }, { tid: 59, name: '演奏' }, { tid: 243, name: '乐评盘点' }, { tid: 30, name: 'VOCALOID·UTAU' }, { tid: 193, name: 'MV' }, { tid: 266, name: '音乐粉丝饭拍' }, { tid: 265, name: 'AI音乐' }, { tid: 267, name: '电台' }, { tid: 244, name: '音乐教学' }, { tid: 130, name: '音乐综合' }] },
  { tid: 129, name: '舞蹈', children: [{ tid: 20, name: '宅舞' }, { tid: 198, name: '街舞' }, { tid: 199, name: '明星舞蹈' }, { tid: 200, name: '国风舞蹈' }, { tid: 255, name: '颜值·网红舞' }, { tid: 154, name: '舞蹈综合' }, { tid: 156, name: '舞蹈教程' }] },
  { tid: 4, name: '游戏', children: [{ tid: 17, name: '单机游戏' }, { tid: 171, name: '电子竞技' }, { tid: 172, name: '手机游戏' }, { tid: 65, name: '网络游戏' }, { tid: 173, name: '桌游棋牌' }, { tid: 121, name: 'GMV' }, { tid: 136, name: '音游' }, { tid: 19, name: 'Mugen' }] },
  { tid: 36, name: '知识', children: [{ tid: 201, name: '科学科普' }, { tid: 124, name: '社科·法律·心理' }, { tid: 228, name: '人文历史' }, { tid: 207, name: '财经商业' }, { tid: 208, name: '校园学习' }, { tid: 209, name: '职业职场' }, { tid: 229, name: '设计·创意' }, { tid: 122, name: '野生技术协会' }] },
  { tid: 188, name: '科技', children: [{ tid: 95, name: '数码' }, { tid: 230, name: '软件应用' }, { tid: 231, name: '计算机技术' }, { tid: 232, name: '科工机械' }, { tid: 233, name: '极客DIY' }] },
  { tid: 234, name: '运动', children: [{ tid: 235, name: '篮球' }, { tid: 249, name: '足球' }, { tid: 164, name: '健身' }, { tid: 236, name: '竞技体育' }, { tid: 237, name: '运动文化' }, { tid: 238, name: '运动综合' }] },
  { tid: 223, name: '汽车', children: [{ tid: 258, name: '汽车知识科普' }, { tid: 227, name: '购车攻略' }, { tid: 247, name: '新能源车' }, { tid: 245, name: '赛车' }, { tid: 246, name: '改装玩车' }, { tid: 240, name: '摩托车' }, { tid: 248, name: '房车' }, { tid: 176, name: '汽车生活' }] },
  { tid: 160, name: '生活', children: [{ tid: 138, name: '搞笑' }, { tid: 254, name: '亲子' }, { tid: 250, name: '出行' }, { tid: 251, name: '三农' }, { tid: 239, name: '家居房产' }, { tid: 161, name: '手工' }, { tid: 162, name: '绘画' }, { tid: 21, name: '日常' }] },
  { tid: 211, name: '美食', children: [{ tid: 76, name: '美食制作' }, { tid: 212, name: '美食侦探' }, { tid: 213, name: '美食测评' }, { tid: 214, name: '田园美食' }, { tid: 215, name: '美食记录' }] },
  { tid: 217, name: '动物圈', children: [{ tid: 218, name: '喵星人' }, { tid: 219, name: '汪星人' }, { tid: 222, name: '小宠异宠' }, { tid: 221, name: '野生动物' }, { tid: 220, name: '动物二创' }, { tid: 75, name: '动物综合' }] },
  { tid: 119, name: '鬼畜', children: [{ tid: 22, name: '鬼畜调教' }, { tid: 26, name: '音MAD' }, { tid: 126, name: '人力VOCALOID' }, { tid: 216, name: '鬼畜剧场' }, { tid: 127, name: '教程演示' }] },
  { tid: 155, name: '时尚', children: [{ tid: 157, name: '美妆护肤' }, { tid: 252, name: '仿妆cos' }, { tid: 158, name: '穿搭' }, { tid: 159, name: '时尚潮流' }] },
  { tid: 202, name: '资讯', children: [{ tid: 203, name: '热点' }, { tid: 204, name: '环球' }, { tid: 205, name: '社会' }, { tid: 206, name: '综合' }] },
  { tid: 5, name: '娱乐', children: [{ tid: 241, name: '娱乐杂谈' }, { tid: 262, name: 'CP安利' }, { tid: 263, name: '颜值安利' }, { tid: 242, name: '娱乐粉丝创作' }, { tid: 264, name: '娱乐资讯' }, { tid: 137, name: '明星综合' }, { tid: 71, name: '综艺' }] },
  { tid: 181, name: '影视', children: [{ tid: 182, name: '影视杂谈' }, { tid: 183, name: '影视剪辑' }, { tid: 260, name: '影视整活' }, { tid: 259, name: 'AI影像' }, { tid: 184, name: '预告·资讯' }, { tid: 85, name: '小剧场' }, { tid: 256, name: '短片' }, { tid: 261, name: '影视综合' }] },
  { tid: 177, name: '纪录片', children: [{ tid: 37, name: '人文·历史' }, { tid: 178, name: '科学·探索·自然' }, { tid: 179, name: '军事' }, { tid: 180, name: '社会·美食·旅行' }] },
  { tid: 23, name: '电影', children: [{ tid: 147, name: '华语电影' }, { tid: 145, name: '欧美电影' }, { tid: 146, name: '日本电影' }, { tid: 83, name: '其他国家' }] },
  { tid: 11, name: '电视剧', children: [{ tid: 185, name: '国产剧' }, { tid: 187, name: '海外剧' }] },
]

const VIDEO_ZONE_NAME_MAP = new Map<number, string>(
  VIDEO_ZONES.flatMap(zone => [[zone.tid, zone.name] as const, ...zone.children.map(child => [child.tid, child.name] as const)]),
)

// 仅返回 tid 的接口（如 UP 主投稿列表）用它补出与 tname 一致的分区名，未知分区返回 undefined。
export function getVideoZoneName(tid?: number): string | undefined {
  return tid ? VIDEO_ZONE_NAME_MAP.get(tid) : undefined
}
