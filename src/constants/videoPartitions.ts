export interface FavoriteVideoPartition {
  key: string
  nameKey: string
  categoryIds: number[]
  categoryNames: string[]
}

const PARTITION_VALUE_PREFIX = 'partition:'

/**
 * 与顶栏内置频道保持同一套一级分区；categoryIds/categoryNames 用于兼容
 * 视频详情接口返回的旧版二级 tid 与分区名称。
 */
export const favoriteVideoPartitions: FavoriteVideoPartition[] = [
  { key: 'animations', nameKey: 'topbar.logo_dropdown.animations', categoryIds: [1, 24, 25, 27, 47, 86, 210], categoryNames: ['动画', 'MAD·AMV', 'MMD·3D', '短片·手书·配音', '综合', '特摄', '手办·模玩'] },
  { key: 'gaming', nameKey: 'topbar.logo_dropdown.gaming', categoryIds: [4, 17, 19, 65, 121, 136, 171, 172, 173], categoryNames: ['游戏', '单机游戏', 'Mugen', '网络游戏', 'GMV', '音游', '电子竞技', '手机游戏', '桌游棋牌'] },
  { key: 'kichiku', nameKey: 'topbar.logo_dropdown.kichiku', categoryIds: [22, 26, 119, 126, 127, 216], categoryNames: ['鬼畜', '鬼畜调教', '音MAD', '人力VOCALOID', '教程演示', '鬼畜剧场'] },
  { key: 'music', nameKey: 'topbar.logo_dropdown.music', categoryIds: [3, 28, 29, 30, 31, 59, 193, 194, 243, 244], categoryNames: ['音乐', '原创音乐', '音乐现场', 'VOCALOID·UTAU', '翻唱', '演奏', 'MV', '电音', '乐评盘点', '音乐教学'] },
  { key: 'dance', nameKey: 'topbar.logo_dropdown.dance', categoryIds: [20, 129, 154, 156, 198, 199, 200], categoryNames: ['舞蹈', '宅舞', '舞蹈综合', '舞蹈教程', '街舞', '明星舞蹈', '中国舞'] },
  { key: 'cinephile', nameKey: 'topbar.logo_dropdown.cinephile', categoryIds: [181, 182, 183, 184], categoryNames: ['影视', '影视杂谈', '影视剪辑', '预告·资讯'] },
  { key: 'showbiz', nameKey: 'topbar.logo_dropdown.showbiz', categoryIds: [5, 71, 137, 241, 242], categoryNames: ['娱乐', '综艺', '明星综合', '娱乐杂谈', '粉丝创作'] },
  { key: 'knowledge', nameKey: 'topbar.logo_dropdown.knowledge', categoryIds: [36, 122, 124, 201, 207, 208, 209, 228, 229], categoryNames: ['知识', '野生技能协会', '社科·法律·心理', '科学科普', '财经商业', '校园学习', '职业职场', '人文历史', '设计·创意'] },
  { key: 'technology', nameKey: 'topbar.logo_dropdown.technology', categoryIds: [95, 188, 230, 231, 232, 233], categoryNames: ['科技', '数码', '软件应用', '计算机技术', '科工机械', '极客DIY'] },
  { key: 'news', nameKey: 'topbar.logo_dropdown.news', categoryIds: [202, 203, 204, 205, 206], categoryNames: ['资讯', '热点', '环球', '社会', '综合'] },
  { key: 'foods', nameKey: 'topbar.logo_dropdown.foods', categoryIds: [76, 211, 212, 213, 214, 215], categoryNames: ['美食', '美食制作', '美食侦探', '美食测评', '田园美食', '美食记录'] },
  { key: 'shortplay', nameKey: 'topbar.logo_dropdown.shortplay', categoryIds: [85], categoryNames: ['小剧场', '短剧'] },
  { key: 'cars', nameKey: 'topbar.logo_dropdown.cars', categoryIds: [176, 223, 227, 240, 245, 246, 247, 248], categoryNames: ['汽车', '汽车生活', '购车攻略', '摩托车', '赛车', '改装玩车', '新能源车', '房车'] },
  { key: 'fashion', nameKey: 'topbar.logo_dropdown.fashion', categoryIds: [155, 157, 158, 159, 252], categoryNames: ['时尚', '美妆护肤', '穿搭', '时尚潮流', '仿妆cos'] },
  { key: 'sports', nameKey: 'topbar.logo_dropdown.sports', categoryIds: [234, 235, 236, 237, 238, 249], categoryNames: ['运动', '篮球', '竞技体育', '运动文化', '运动综合', '足球'] },
  { key: 'animals', nameKey: 'topbar.logo_dropdown.animals', categoryIds: [75, 217, 218, 219, 220, 221, 222], categoryNames: ['动物圈', '动物综合', '喵星人', '汪星人', '大熊猫', '野生动物', '爬宠'] },
  { key: 'vlog', nameKey: 'topbar.logo_dropdown.vlog', categoryIds: [21], categoryNames: ['VLOG', '日常'] },
  { key: 'painting', nameKey: 'topbar.logo_dropdown.painting', categoryIds: [162], categoryNames: ['绘画'] },
  { key: 'ai', nameKey: 'topbar.logo_dropdown.ai', categoryIds: [], categoryNames: ['AI', '人工智能'] },
  { key: 'home', nameKey: 'topbar.logo_dropdown.home', categoryIds: [], categoryNames: ['家居房产', '家装房产'] },
  { key: 'outdoors', nameKey: 'topbar.logo_dropdown.outdoors', categoryIds: [], categoryNames: ['户外', '露营', '徒步', '钓鱼'] },
  { key: 'gym', nameKey: 'topbar.logo_dropdown.gym', categoryIds: [164], categoryNames: ['健身'] },
  { key: 'handmake', nameKey: 'topbar.logo_dropdown.handmake', categoryIds: [161], categoryNames: ['手工'] },
  { key: 'travel', nameKey: 'topbar.logo_dropdown.travel', categoryIds: [], categoryNames: ['旅行'] },
  { key: 'rural', nameKey: 'topbar.logo_dropdown.rural', categoryIds: [], categoryNames: ['三农', '乡村'] },
  { key: 'parenting', nameKey: 'topbar.logo_dropdown.parenting', categoryIds: [], categoryNames: ['亲子', '育儿'] },
  { key: 'health', nameKey: 'topbar.logo_dropdown.health', categoryIds: [], categoryNames: ['健康'] },
  { key: 'emotion', nameKey: 'topbar.logo_dropdown.emotion', categoryIds: [], categoryNames: ['情感'] },
  { key: 'life_joy', nameKey: 'topbar.logo_dropdown.life_joy', categoryIds: [138], categoryNames: ['搞笑', '生活兴趣'] },
  { key: 'life_experience', nameKey: 'topbar.logo_dropdown.life_experience', categoryIds: [], categoryNames: ['生活经验'] },
]

function normalize(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

export function getFavoriteVideoPartition(value: string) {
  const normalizedValue = normalize(value)
  const key = normalizedValue.startsWith(PARTITION_VALUE_PREFIX)
    ? normalizedValue.slice(PARTITION_VALUE_PREFIX.length)
    : normalizedValue

  return favoriteVideoPartitions.find(partition =>
    partition.key === key
    || partition.categoryNames.some(name => normalize(name) === normalizedValue),
  )
}

export function getFavoriteVideoPartitionValue(key: string) {
  return `${PARTITION_VALUE_PREFIX}${key}`
}

export function matchesFavoriteVideoPartition(
  value: string,
  categoryIds: number[],
  categoryName?: string,
) {
  const partition = getFavoriteVideoPartition(value)
  if (!partition)
    return false

  const normalizedCategoryName = normalize(categoryName)
  return categoryIds.some(categoryId => partition.categoryIds.includes(categoryId))
    || partition.categoryNames.some(name => normalize(name) === normalizedCategoryName)
}
