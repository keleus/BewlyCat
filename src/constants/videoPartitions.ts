export interface VideoPartition {
  id: number
  name: string
  url: string
}

interface UgcVideoPartition extends VideoPartition {
  childTidRange: readonly [number, number]
}

export const PGC_VIDEO_PARTITIONS = {
  1: { id: 1, name: '番剧', url: 'https://www.bilibili.com/anime' },
  2: { id: 2, name: '电影', url: 'https://www.bilibili.com/movie' },
  3: { id: 3, name: '纪录片', url: 'https://www.bilibili.com/documentary' },
  4: { id: 4, name: '国创', url: 'https://www.bilibili.com/guochuang' },
  5: { id: 5, name: '电视剧', url: 'https://www.bilibili.com/tv' },
  7: { id: 7, name: '综艺', url: 'https://www.bilibili.com/variety' },
} as const satisfies Record<number, VideoPartition>

// Bilibili's v2 partition IDs are grouped into contiguous child-ID ranges.
// Keep this list aligned with the public /c/* navigation rather than legacy tid names.
export const UGC_VIDEO_PARTITIONS = [
  { id: 1001, name: '影视', url: 'https://www.bilibili.com/c/cinephile', childTidRange: [2001, 2008] },
  { id: 1002, name: '娱乐', url: 'https://www.bilibili.com/c/ent', childTidRange: [2009, 2015] },
  { id: 1003, name: '音乐', url: 'https://www.bilibili.com/c/music', childTidRange: [2016, 2027] },
  { id: 1004, name: '舞蹈', url: 'https://www.bilibili.com/c/dance', childTidRange: [2028, 2036] },
  { id: 1005, name: '动画', url: 'https://www.bilibili.com/c/douga', childTidRange: [2037, 2054] },
  { id: 1006, name: '绘画', url: 'https://www.bilibili.com/c/painting', childTidRange: [2055, 2058] },
  { id: 1007, name: '鬼畜', url: 'https://www.bilibili.com/c/kichiku', childTidRange: [2059, 2063] },
  { id: 1008, name: '游戏', url: 'https://www.bilibili.com/c/game', childTidRange: [2064, 2079] },
  { id: 1009, name: '资讯', url: 'https://www.bilibili.com/c/information', childTidRange: [2080, 2083] },
  { id: 1010, name: '知识', url: 'https://www.bilibili.com/c/knowledge', childTidRange: [2084, 2095] },
  { id: 1011, name: '人工智能', url: 'https://www.bilibili.com/c/ai', childTidRange: [2096, 2098] },
  { id: 1012, name: '科技数码', url: 'https://www.bilibili.com/c/tech', childTidRange: [2099, 2105] },
  { id: 1013, name: '汽车', url: 'https://www.bilibili.com/c/car', childTidRange: [2106, 2110] },
  { id: 1014, name: '时尚美妆', url: 'https://www.bilibili.com/c/fashion', childTidRange: [2111, 2119] },
  { id: 1015, name: '家装房产', url: 'https://www.bilibili.com/c/home', childTidRange: [2120, 2123] },
  { id: 1016, name: '户外潮流', url: 'https://www.bilibili.com/c/outdoors', childTidRange: [2124, 2127] },
  { id: 1017, name: '健身', url: 'https://www.bilibili.com/c/gym', childTidRange: [2128, 2132] },
  { id: 1018, name: '体育运动', url: 'https://www.bilibili.com/c/sports', childTidRange: [2133, 2142] },
  { id: 1019, name: '手工', url: 'https://www.bilibili.com/c/handmake', childTidRange: [2143, 2148] },
  { id: 1020, name: '美食', url: 'https://www.bilibili.com/c/food', childTidRange: [2149, 2153] },
  { id: 1021, name: '小剧场', url: 'https://www.bilibili.com/c/shortplay', childTidRange: [2154, 2157] },
  { id: 1022, name: '旅游出行', url: 'https://www.bilibili.com/c/travel', childTidRange: [2158, 2161] },
  { id: 1023, name: '三农', url: 'https://www.bilibili.com/c/rural', childTidRange: [2162, 2166] },
  { id: 1024, name: '动物', url: 'https://www.bilibili.com/c/animal', childTidRange: [2167, 2171] },
  { id: 1025, name: '亲子', url: 'https://www.bilibili.com/c/parenting', childTidRange: [2172, 2178] },
  { id: 1026, name: '健康', url: 'https://www.bilibili.com/c/health', childTidRange: [2179, 2184] },
  { id: 1027, name: '情感', url: 'https://www.bilibili.com/c/emotion', childTidRange: [2185, 2188] },
  { id: 1029, name: 'vlog', url: 'https://www.bilibili.com/c/vlog', childTidRange: [2194, 2197] },
  { id: 1030, name: '生活兴趣', url: 'https://www.bilibili.com/c/life_joy', childTidRange: [2198, 2202] },
  { id: 1031, name: '生活经验', url: 'https://www.bilibili.com/c/life_experience', childTidRange: [2203, 2205] },
] as const satisfies readonly UgcVideoPartition[]

export function getPgcVideoPartition(seasonType?: number): VideoPartition | undefined {
  if (!seasonType)
    return undefined

  return PGC_VIDEO_PARTITIONS[seasonType as keyof typeof PGC_VIDEO_PARTITIONS]
}

export function getUgcVideoPartition(tidV2?: number): VideoPartition | undefined {
  if (!tidV2)
    return undefined

  return UGC_VIDEO_PARTITIONS.find(({ id, childTidRange }) =>
    tidV2 === id || (tidV2 >= childTidRange[0] && tidV2 <= childTidRange[1]),
  )
}
