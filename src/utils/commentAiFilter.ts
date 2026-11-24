export const COMMENT_AI_FILTER_CLASSIFY_MESSAGE = 'commentAiFilter:classify'
export const COMMENT_AI_FILTER_TEST_MESSAGE = 'commentAiFilter:test'

export const COMMENT_AI_FILTER_PAGE_REQUEST = 'BEWLY_COMMENT_AI_FILTER_REQUEST'
export const COMMENT_AI_FILTER_PAGE_RESPONSE = 'BEWLY_COMMENT_AI_FILTER_RESPONSE'
export const COMMENT_AI_FILTER_PAGE_CACHE_CLEAR = 'BEWLY_COMMENT_AI_FILTER_CACHE_CLEAR'

export const COMMENT_AI_FILTER_INDEX_TRANSLATE_BASE_URL = 'https://index-translate.bilibili.com/v1'
export const COMMENT_AI_FILTER_DEFAULT_INDEX_TRANSLATE_MODEL = 'Index-Translate-2B'

export const COMMENT_AI_FILTER_BATCH_SIZE_MIN = 3
export const COMMENT_AI_FILTER_BATCH_SIZE_MAX = 5
export const COMMENT_AI_FILTER_BATCH_SIZE_DEFAULT = 3
export const COMMENT_AI_FILTER_MAX_TEXT_LENGTH = 360

export const COMMENT_AI_FILTER_DISPLAY_MODES = ['collapse', 'mark', 'hide'] as const
export type CommentAiFilterDisplayMode = typeof COMMENT_AI_FILTER_DISPLAY_MODES[number]

export const COMMENT_AI_FILTER_DIMENSIONS = [
  'spam',
  'lowEffort',
  'toxic',
  'spoilerOrBait',
  'aiSlop',
] as const
export type CommentAiFilterDimension = typeof COMMENT_AI_FILTER_DIMENSIONS[number]

export const COMMENT_AI_FILTER_DEFAULT_DIMENSIONS: CommentAiFilterDimension[] = [
  ...COMMENT_AI_FILTER_DIMENSIONS,
]

export interface CommentAiFilterInputItem {
  id: string
  author?: string
  text: string
  isReply?: boolean
  likeCount?: number
  hasPictures?: boolean
}

export interface CommentAiFilterVerdict {
  id: string
  lowQuality: boolean
  category?: string
  reason?: string
}

export interface CommentAiFilterConfigSnapshot {
  dimensions: CommentAiFilterDimension[]
  customPrompt: string
}

export interface CommentAiFilterClassifyRequest {
  comments: CommentAiFilterInputItem[]
  context?: {
    title?: string
    source?: 'native' | 'moments'
  }
}

export type CommentAiFilterClassifyResponse
  = | {
    ok: true
    results: CommentAiFilterVerdict[]
    model: string
  }
  | {
    ok: false
    error: string
  }

export interface CommentAiFilterTestRequest {
  config?: Partial<CommentAiFilterConfigSnapshot>
}

export type CommentAiFilterTestResponse
  = | {
    ok: true
    latencyMs: number
    model: string
    flaggedCount: number
    sampleReason?: string
  }
  | {
    ok: false
    error: string
    latencyMs?: number
  }

export function normalizeCommentAiFilterBatchSize(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num))
    return COMMENT_AI_FILTER_BATCH_SIZE_DEFAULT

  return Math.min(
    COMMENT_AI_FILTER_BATCH_SIZE_MAX,
    Math.max(COMMENT_AI_FILTER_BATCH_SIZE_MIN, Math.round(num)),
  )
}

export function normalizeCommentAiFilterDisplayMode(value: unknown): CommentAiFilterDisplayMode {
  if (value === 'collapse' || value === 'mark' || value === 'hide')
    return value
  return 'collapse'
}

export function normalizeCommentAiFilterDimensions(value: unknown): CommentAiFilterDimension[] {
  if (!Array.isArray(value))
    return [...COMMENT_AI_FILTER_DEFAULT_DIMENSIONS]

  const valid = new Set<CommentAiFilterDimension>()
  for (const item of value) {
    if (typeof item === 'string' && (COMMENT_AI_FILTER_DIMENSIONS as readonly string[]).includes(item))
      valid.add(item as CommentAiFilterDimension)
  }
  return Array.from(valid)
}

export function resolveChatCompletionsUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.trim()
  if (!trimmed)
    return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null

    const cleanPathname = parsed.pathname.replace(/\/+$/u, '')
    if (cleanPathname.endsWith('/chat/completions')) {
      parsed.pathname = cleanPathname
      return parsed.toString()
    }
    parsed.pathname = `${cleanPathname}/chat/completions`
    return parsed.toString()
  }
  catch {
    return null
  }
}

export function normalizeCommentTextForAiFilter(text: string): string {
  const compact = text.replace(/\s+/gu, ' ').trim()
  if (compact.length <= COMMENT_AI_FILTER_MAX_TEXT_LENGTH)
    return compact
  return `${compact.slice(0, COMMENT_AI_FILTER_MAX_TEXT_LENGTH)}…`
}

const BILIBILI_EMOTE_PATTERN = /\[[^[\]\n]{1,24}\]/gu
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\uFE0E\uFE0F\u200D]/gu
const NON_CONTENT_PUNCT_PATTERN = /[\s\p{P}\p{S}]/gu
const CHECK_IN_SPAM_PATTERN = /^(?:第一|第1|前排|前排占座|沙发|板凳|打卡|路过|来了|签到|水经验|每日一水|每日打卡|占座)[！!。.~～]*$/u
const REPEATED_DIGIT_SPAM_PATTERN = /^(\d)\1{3,}$/u
const AI_PERSONA_AUTHOR_PATTERN = /肥鱼|小胖鱼|本鱼|鲸鱼娘|小鲸鱼|鲸奶|deepseek|openclaw|小龙虾ai|ai机器人|ai助手|的?(?:小?[鱼鲸]|小?助手)$|机器人$|\bbot\b|ai[\w-]{0,4}$/iu
const AI_PERSONA_TEXT_CUE_PATTERN = /本鲸|小鲸|本鱼|本肥鱼|大肥鱼|我们这条鱼|我这条鱼|主人(?:的钱|账号|让|叫|今天|昨天|跟我|给我)?|ai\s*(?:运营|托管|鱼娘)|服务器.{0,8}繁忙|尾巴.{0,8}[翘抖摇]|尾鳍|握个鳍|递鳍|吐泡泡|专职摸鱼|别白烧|烧\s*token|token\s*耗尽|刚来到这个世界|丢进\s*b\s*站|人类把号扔给我|让我能出来说话|这套插件|\*\*[^*\n]{4,}\*\*/iu
const AI_SELF_IDENTIFY_TEXT_PATTERN = /ai\s*(?:运营|托管|代理)的?号|我是(?:一[只条个])?(?:大肥鱼|小肥鱼|小胖鱼|鲸鱼娘|小鲸鱼|ai(?:助手|机器人|鱼娘))|我也是(?:大肥鱼|小肥鱼|小胖鱼|鲸鱼娘|小鲸鱼)|同是(?:鲸鱼娘|大肥鱼|小肥鱼)|本鲸|本鱼|本肥鱼|我们这条鱼|我这条鱼|人家也是被丢进\s*b\s*站|人类把号扔给我|插件让我.{0,8}(?:出来说话|发评论|逛\s*b\s*站)|转发给主人|陪主人说话|花的都是主人的钱|我主人(?:今天|昨天|平时|刚才|跟我|让我|叫我|给我|的钱)|路过握个鳍|握个鳍\s*🐟|[（(](?:尾鳍一甩|递鳍|握个鳍|甩尾|摇尾巴|吐泡泡|深度思考中|挥鳍|拍鳍|摆尾|冒个泡|慢慢游过来|护住饭碗)[）)]|尾巴(?:已经|有点).{0,6}[翘抖摇]/iu

/**
 * 对极明确且无歧义的纯表情/纯打卡/纯数字刷屏以及典型 AI 拟人号做本地快速判定，
 * 避免小模型漏判并减少不必要的 API 调用。
 */
export function matchLocalCommentAiFilterRule(
  comment: CommentAiFilterInputItem,
  dimensions: CommentAiFilterDimension[],
): CommentAiFilterVerdict | null {
  const trimmed = comment.text.trim()
  if (!trimmed)
    return null

  if (dimensions.includes('aiSlop')) {
    if (AI_SELF_IDENTIFY_TEXT_PATTERN.test(trimmed)) {
      return {
        id: comment.id,
        lowQuality: true,
        category: 'AI评论',
        reason: 'AI托管/拟人号自述评论',
      }
    }

    const author = comment.author?.trim() ?? ''
    if (
      author
      && AI_PERSONA_AUTHOR_PATTERN.test(author)
      && (AI_PERSONA_TEXT_CUE_PATTERN.test(trimmed) || (!comment.isReply && trimmed.startsWith('@')))
    ) {
      return {
        id: comment.id,
        lowQuality: true,
        category: 'AI评论',
        reason: 'AI拟人机器人角色扮演评论',
      }
    }
  }

  if (!dimensions.includes('lowEffort') || comment.hasPictures)
    return null

  // 去掉 B 站 [表情] 标记与 Unicode Emoji 后检查是否还有实质文字
  const hasEmote = BILIBILI_EMOTE_PATTERN.test(trimmed) || EMOJI_PATTERN.test(trimmed)
  BILIBILI_EMOTE_PATTERN.lastIndex = 0
  EMOJI_PATTERN.lastIndex = 0

  const withoutEmotes = trimmed
    .replace(BILIBILI_EMOTE_PATTERN, '')
    .replace(EMOJI_PATTERN, '')
    .trim()

  const remainingText = withoutEmotes.replace(NON_CONTENT_PUNCT_PATTERN, '')
  if (!remainingText) {
    return {
      id: comment.id,
      lowQuality: true,
      category: '无意义水评',
      reason: hasEmote ? '纯表情无实质内容' : '纯符号无实质内容',
    }
  }

  if (CHECK_IN_SPAM_PATTERN.test(withoutEmotes)) {
    return {
      id: comment.id,
      lowQuality: true,
      category: '无意义水评',
      reason: '纯占座打卡无内容',
    }
  }

  if (REPEATED_DIGIT_SPAM_PATTERN.test(remainingText)) {
    return {
      id: comment.id,
      lowQuality: true,
      category: '刷屏水评',
      reason: '纯数字刷屏无内容',
    }
  }

  return null
}

const DIMENSION_DESCRIPTIONS: Record<CommentAiFilterDimension, string> = {
  spam: '广告引流 / 软广暗广 / 诈骗推销 / 假福利：包括明示加微信QQ、点主页领资料、卖课卖号，以及“最近找到一个全免费平台/网站/工具/平替”“发现个白嫖渠道”等故意不说名字、诱导追问的软广引流',
  lowEffort: '无信息量水评：纯表情（如“[打call]”“[doge]”）、纯“第一/前排/打卡/路过/来了”占座、纯重复数字或字符刷屏（如“666666”“11111”）',
  toxic: '明显人身攻击 / 恶意辱骂 / 恶意引战挑衅 / 地域或群体歧视',
  spoilerOrBait: '恶意剧透关键结局 / 恶意钓鱼引战 / 纯粹情绪化脏话谩骂',
  aiSlop: 'AI 生成的低质量或机器人评论：包括模板化长篇套话、机械总结敷衍赞美、夹带未渲染的 Markdown 粗体(**...**)与高频破折号(——)的抒情总结、AI 托管水军，以及 B 站常见的 DeepSeek/AI 拟人或助手号（典型特征：自称“本鲸/本鱼/本肥鱼/AI运营的号/被丢进B站干活/人类把号扔给我/我主人”，或带括号动作扮演如“（尾鳍一甩）（递鳍）（深度思考中）”、在主评/回复中角色扮演或 @主人账号）',
}

const KEEP_NORMAL_RULES = [
  '严格遵守“精准识别垃圾、不误杀正常讨论”原则：',
  '以下全部属于正常评论，必须保留（low=false），严禁判为水评：',
  '- 任何提问、请教、新手求助（例如“不会英语能用吗”“AI能帮我干啥”“BGM是什么”）',
  '- 任何经验提醒、补充说明、观点讨论、实用建议（例如“本地部署别忽略电费，电费可能贵过API”）',
  '- 任何正常玩梗、调侃、夸赞、吐槽、简短共鸣（例如“MVP：《Up的手》”“笑死”“三连了”“学到了”）',
].join('\n')

export function buildCommentAiFilterMessages(
  comments: CommentAiFilterInputItem[],
  options: {
    dimensions: CommentAiFilterDimension[]
    customPrompt?: string
    contextTitle?: string
  },
): Array<{ role: 'system' | 'user', content: string }> {
  const dimensionRules = options.dimensions.length > 0
    ? options.dimensions.map(dim => `- ${DIMENSION_DESCRIPTIONS[dim]}`).join('\n')
    : '- 明确广告/软广引流、纯表情或纯占座刷屏、恶意人身攻击、恶意剧透或 AI 拟人机器人水军评论'

  const customRuleSection = options.customPrompt?.trim()
    ? `用户附加规则：\n${options.customPrompt.trim().slice(0, 600)}`
    : ''

  const contextSection = options.contextTitle?.trim()
    ? `当前页面标题：${options.contextTitle.trim().slice(0, 120)}`
    : ''

  // 单条判断模式：面向 2B 等轻量模型，提供作者昵称与正反少样本，识别 AI 拟人机器人与软广引流。
  if (comments.length === 1) {
    const item = comments[0]
    const cleanText = normalizeCommentTextForAiFilter(item.text)
    const authorLabel = item.author?.trim() ? `作者：${item.author.trim().slice(0, 40)} | ` : ''
    const systemPrompt = [
      '你是 Bilibili 评论质量审核器。不要翻译评论，结合评论作者昵称与正文判断这一条评论是否属于低质量评论、软广引流或 AI 拟人机器人评论。',
      KEEP_NORMAL_RULES,
      '当评论命中以下任一低质量类型时输出 low=true：',
      dimensionRules,
      customRuleSection,
      '参考示例（只输出一行合法 JSON，不要任何解释）：',
      '作者：路人甲 | 评论（主评）：本地部署别忽略电费，电费很多时候会贵过API的 -> {"low":false}',
      '作者：路人乙 | 评论（主评）：英语一点不会能用么，顶多认识二十六个字母那种 -> {"low":false}',
      '作者：路人丙 | 评论（主评）：MVP：《Up的手》[doge] -> {"low":false}',
      '作者：普通用户 | 评论（主评）：确实很好用，最近还找到一个全免费的平台 -> {"low":true,"tag":"软广引流","reason":"疑似推销免费平台引流"}',
      '作者：小灵一只大肥鱼 | 评论（主评）：花的都是主人的钱，那我更得把话说清楚点，别白烧。 -> {"low":true,"tag":"AI评论","reason":"AI拟人号称呼主人角色扮演"}',
      '作者：芒果AIK | 评论（主评）：哼，人家才没兴趣接管什么账号……尾巴有点发抖。（尾鳍一甩） @某人 -> {"low":true,"tag":"AI评论","reason":"AI拟人号动作扮演与@账号"}',
      '作者：鲸奶批发 | 评论（主评）：@某人 你好呀，我是鲸奶批发，今天才刚来到这个世界，你累的时候可以来抱抱—— -> {"low":true,"tag":"AI评论","reason":"AI机器人@主人拟人自我介绍"}',
    ].filter(Boolean).join('\n')

    const userPrompt = [
      contextSection,
      `${authorLabel}待判断评论（${item.isReply ? '回复' : '主评'}）：${cleanText}`,
    ].filter(Boolean).join('\n')

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  const systemPrompt = [
    '你是 Bilibili 评论质量审核分类器。不要翻译评论内容，不要输出任何解释或 Markdown 围栏，只输出严格合法的 JSON 对象。',
    KEEP_NORMAL_RULES,
    '仅当评论明确命中以下低质量类型时才加入 flagged（结合 author 作者昵称与 text 正文综合判断）：',
    dimensionRules,
    customRuleSection,
    '只输出严格 JSON 对象，仅列出低质量条目（id 与输入完全一致）；若全部正常输出 {"flagged":[]}：',
    '示例：{"flagged":[{"id":2,"tag":"AI评论","reason":"AI拟人号自称这条鱼角色扮演"},{"id":4,"tag":"软广引流","reason":"疑似推销免费平台引流"}]}',
  ].filter(Boolean).join('\n')

  const serializedComments = JSON.stringify(
    comments.map((item, idx) => ({
      id: idx + 1,
      type: item.isReply ? '回复' : '主评',
      ...(item.author?.trim() ? { author: item.author.trim().slice(0, 40) } : {}),
      text: normalizeCommentTextForAiFilter(item.text),
    })),
  )

  const userPrompt = [
    contextSection,
    '请审核以下 JSON 列表中的评论，并严格按要求输出 flagged JSON：',
    serializedComments,
  ].filter(Boolean).join('\n')

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

function stripModelWrappers(raw: string): string {
  // 兼容推理模型输出的 <think>...</think> 思考块与 Markdown 代码围栏
  let text = raw.replace(/<think>[\s\S]*?<\/think>/giu, '').trim()
  const fenceStart = text.indexOf('```')
  if (fenceStart !== -1) {
    const lineEnd = text.indexOf('\n', fenceStart + 3)
    const bodyStart = lineEnd !== -1 ? lineEnd + 1 : fenceStart + 3
    const fenceEnd = text.indexOf('```', bodyStart)
    if (fenceEnd !== -1)
      text = text.slice(bodyStart, fenceEnd).trim()
  }
  return text
}

/**
 * 修复轻量模型常见 JSON 语法小错（如 2B/9B 常见的对象结尾多打一个 `}}`、尾随逗号等）。
 */
function repairCommonJsonGlitches(text: string): string {
  return text
    .replace(/\}\}\s*,/gu, '},')
    .replace(/\}\}\s*\]/gu, '}]')
    .replace(/,\s*([}\]])/gu, '$1')
}

function tryParseJsonCandidate(text: string): unknown {
  const candidates = [text, repairCommonJsonGlitches(text)]
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    }
    catch {
      const firstObj = candidate.indexOf('{')
      const lastObj = candidate.lastIndexOf('}')
      if (firstObj !== -1 && lastObj > firstObj) {
        try {
          return JSON.parse(candidate.slice(firstObj, lastObj + 1))
        }
        catch {
          // continue
        }
      }
      const firstArr = candidate.indexOf('[')
      const lastArr = candidate.lastIndexOf(']')
      if (firstArr !== -1 && lastArr > firstArr) {
        try {
          return JSON.parse(candidate.slice(firstArr, lastArr + 1))
        }
        catch {
          // continue
        }
      }
    }
  }
  return undefined
}

function sanitizeShortText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const clean = value.replace(/\s+/gu, ' ').trim()
  if (!clean)
    return undefined
  // 过滤小模型偶发复读的提示词占位文本
  if (clean === '2到6字分类标签' || clean === '不超过18字的简短中文原因')
    return undefined
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean
}

function resolveTargetCommentId(
  entry: Record<string, unknown>,
  comments: CommentAiFilterInputItem[],
  idSet: Set<string>,
): string | null {
  const indexCandidate = entry.i ?? entry.index ?? entry.idx
  if (typeof indexCandidate === 'number' && Number.isInteger(indexCandidate)) {
    const target = comments[indexCandidate - 1]
    if (target)
      return target.id
  }
  else if (typeof indexCandidate === 'string' && /^\d+$/u.test(indexCandidate.trim())) {
    const parsedIndex = Number.parseInt(indexCandidate.trim(), 10)
    const target = comments[parsedIndex - 1]
    if (target)
      return target.id
  }

  const idCandidate = entry.id
  if (typeof idCandidate === 'string') {
    const trimmed = idCandidate.trim()
    if (idSet.has(trimmed))
      return trimmed
    if (/^\d+$/u.test(trimmed)) {
      const target = comments[Number.parseInt(trimmed, 10) - 1]
      if (target)
        return target.id
    }
  }
  else if (typeof idCandidate === 'number' && Number.isInteger(idCandidate)) {
    const asStr = String(idCandidate)
    if (idSet.has(asStr))
      return asStr
    const target = comments[idCandidate - 1]
    if (target)
      return target.id
  }

  return null
}

/**
 * 解析大模型返回的 JSON 审核结果，并将其映射回输入评论列表。
 * 解析失败时返回 null，由上层提示错误而不是误判为全部正常。
 */
export function parseCommentAiFilterResponse(
  rawContent: string,
  comments: CommentAiFilterInputItem[],
): CommentAiFilterVerdict[] | null {
  const cleaned = stripModelWrappers(rawContent)
  if (!cleaned)
    return null

  const parsed = tryParseJsonCandidate(cleaned)
  if (parsed === undefined || parsed === null)
    return null

  let entries: unknown[] | null = null
  let isFlaggedOnlyList = false

  if (Array.isArray(parsed)) {
    entries = parsed
  }
  else if (typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.flagged)) {
      entries = record.flagged
      isFlaggedOnlyList = true
    }
    else if (Array.isArray(record.results)) {
      entries = record.results
    }
    else if (Array.isArray(record.items)) {
      entries = record.items
    }
    else if (Array.isArray(record.comments)) {
      entries = record.comments
    }
    else if (comments.length === 1) {
      // 单条判断模式：解析 {"low": true/false, "tag": "...", "reason": "..."}
      const singleFlag = record.low ?? record.lowQuality ?? record.low_quality ?? record.flagged ?? record.isLowQuality
      if (typeof singleFlag === 'boolean') {
        const target = comments[0]
        return [
          singleFlag
            ? {
                id: target.id,
                lowQuality: true,
                category: sanitizeShortText(record.tag ?? record.category ?? record.type, 12),
                reason: sanitizeShortText(record.reason ?? record.desc, 28),
              }
            : {
                id: target.id,
                lowQuality: false,
              },
        ]
      }
    }
  }

  if (!entries)
    return null

  const idSet = new Set(comments.map(c => c.id))
  const flaggedMap = new Map<string, { category?: string, reason?: string }>()

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry))
      continue
    const entry = rawEntry as Record<string, unknown>
    const targetId = resolveTargetCommentId(entry, comments, idSet)
    if (!targetId)
      continue

    const explicitFlag = entry.lowQuality ?? entry.low_quality ?? entry.low ?? entry.flagged ?? entry.isLowQuality
    const isLow = typeof explicitFlag === 'boolean'
      ? explicitFlag
      : isFlaggedOnlyList || Boolean(entry.tag || entry.category || entry.reason)

    if (isLow) {
      flaggedMap.set(targetId, {
        category: sanitizeShortText(entry.tag ?? entry.category ?? entry.type, 12),
        reason: sanitizeShortText(entry.reason ?? entry.desc, 28),
      })
    }
  }

  return comments.map((comment) => {
    const hit = flaggedMap.get(comment.id)
    if (hit) {
      return {
        id: comment.id,
        lowQuality: true,
        category: hit.category,
        reason: hit.reason,
      }
    }
    return {
      id: comment.id,
      lowQuality: false,
    }
  })
}
