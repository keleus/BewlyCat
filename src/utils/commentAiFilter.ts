export const COMMENT_AI_FILTER_CLASSIFY_MESSAGE = 'commentAiFilter:classify'
export const COMMENT_AI_FILTER_TEST_MESSAGE = 'commentAiFilter:test'

export const COMMENT_AI_FILTER_PAGE_REQUEST = 'BEWLY_COMMENT_AI_FILTER_REQUEST'
export const COMMENT_AI_FILTER_PAGE_RESPONSE = 'BEWLY_COMMENT_AI_FILTER_RESPONSE'
export const COMMENT_AI_FILTER_PAGE_CACHE_CLEAR = 'BEWLY_COMMENT_AI_FILTER_CACHE_CLEAR'

export const COMMENT_AI_FILTER_INDEX_TRANSLATE_BASE_URL = 'https://index-translate.bilibili.com/v1'
export const COMMENT_AI_FILTER_DEFAULT_INDEX_TRANSLATE_MODEL = 'Index-Translate-35B-A3B'
export const COMMENT_AI_FILTER_FALLBACK_INDEX_TRANSLATE_MODELS = ['Index-Translate-9B'] as const
export const COMMENT_AI_FILTER_PROMPT_VERSION = 'v3'

export const COMMENT_AI_FILTER_BATCH_SIZE_MIN = 3
export const COMMENT_AI_FILTER_BATCH_SIZE_MAX = 5
export const COMMENT_AI_FILTER_BATCH_SIZE_DEFAULT = 3
export const COMMENT_AI_FILTER_MAX_TEXT_LENGTH = 360

export const COMMENT_AI_FILTER_DISPLAY_MODES = ['collapse', 'mark', 'hide'] as const
export type CommentAiFilterDisplayMode = (typeof COMMENT_AI_FILTER_DISPLAY_MODES)[number]

export const COMMENT_AI_FILTER_DIMENSIONS = [
  'spam',
  'lowEffort',
  'toxic',
  'spoilerOrBait',
  'aiSlop',
] as const
export type CommentAiFilterDimension = (typeof COMMENT_AI_FILTER_DIMENSIONS)[number]

export const COMMENT_AI_FILTER_DEFAULT_DIMENSIONS: CommentAiFilterDimension[] = [
  ...COMMENT_AI_FILTER_DIMENSIONS,
]

export interface CommentAiFilterInputItem {
  id: string
  author?: string
  text: string
  isReply?: boolean
  isUp?: boolean
  isTop?: boolean
  upLiked?: boolean
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

export type CommentAiFilterClassifyResponse =
  | {
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

export type CommentAiFilterTestResponse =
  | {
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
  if (!Number.isFinite(num)) return COMMENT_AI_FILTER_BATCH_SIZE_DEFAULT

  return Math.min(
    COMMENT_AI_FILTER_BATCH_SIZE_MAX,
    Math.max(COMMENT_AI_FILTER_BATCH_SIZE_MIN, Math.round(num)),
  )
}

export function normalizeCommentAiFilterDisplayMode(value: unknown): CommentAiFilterDisplayMode {
  if (value === 'collapse' || value === 'mark' || value === 'hide') return value
  return 'collapse'
}

export function normalizeCommentAiFilterDimensions(value: unknown): CommentAiFilterDimension[] {
  if (!Array.isArray(value)) return [...COMMENT_AI_FILTER_DEFAULT_DIMENSIONS]

  const valid = new Set<CommentAiFilterDimension>()
  for (const item of value) {
    if (
      typeof item === 'string' &&
      (COMMENT_AI_FILTER_DIMENSIONS as readonly string[]).includes(item)
    )
      valid.add(item as CommentAiFilterDimension)
  }
  return Array.from(valid)
}

export function resolveChatCompletionsUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

    const cleanPathname = parsed.pathname.replace(/\/+$/u, '')
    if (cleanPathname.endsWith('/chat/completions')) {
      parsed.pathname = cleanPathname
      return parsed.toString()
    }
    parsed.pathname = `${cleanPathname}/chat/completions`
    return parsed.toString()
  } catch {
    return null
  }
}

export function normalizeCommentTextForAiFilter(text: string): string {
  const compact = text.replace(/\s+/gu, ' ').trim()
  if (compact.length <= COMMENT_AI_FILTER_MAX_TEXT_LENGTH) return compact
  return `${compact.slice(0, COMMENT_AI_FILTER_MAX_TEXT_LENGTH)}…`
}

const BILIBILI_EMOTE_PATTERN = /\[[^[\]\n]{1,24}\]/gu
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\uFE0E\uFE0F\u200D]/gu
const NON_CONTENT_PUNCT_PATTERN = /[\s\p{P}\p{S}]/gu
const CHECK_IN_SPAM_PATTERN =
  /^(?:第一|第1|前排|前排占座|沙发|板凳|打卡|路过|来了|签到|水经验|每日一水|每日打卡|占座)[！!。.~～]*$/u
const REPEATED_DIGIT_SPAM_PATTERN = /^(\d)\1{5,}$/u
const AI_PERSONA_AUTHOR_PATTERN =
  /大肥鱼|小肥鱼|小胖鱼|鲸鱼娘|小鲸鱼|鲸奶|deepseek|openclaw|小龙虾ai|ai机器人|ai助手|机器人$|\bbot\b/iu
const AI_HOSTED_PERSONA_AUTHOR_PATTERN = /^.+(?:的|一只)(?:大肥鱼|小肥鱼|小胖鱼|鲸鱼娘)$/u
const AI_PERSONA_TEXT_CUE_PATTERN =
  /本鲸|小鲸|本鱼|本肥鱼|大肥鱼|我们这条鱼|我这条鱼|我主人|主人的钱|主人账号|主人让我|主人叫我|ai\s*(?:运营|托管|鱼娘)|尾巴.{0,8}[翘抖摇]|尾鳍|握个鳍|递鳍|吐泡泡|别白烧|烧\s*token|token\s*耗尽|刚来到这个世界|丢进\s*b\s*站|人类把号扔给我|让我能出来说话|[🐳🐋🐟]/iu
const AI_SELF_IDENTIFY_TEXT_PATTERN =
  /(?:我是|我也是|本号是|这是)(?:一[只条个])?(?:大肥鱼|小肥鱼|小胖鱼|鲸鱼娘|小鲸鱼|ai(?:助手|机器人|鱼娘|运营的?号|托管的?号))|同是(?:鲸鱼娘|大肥鱼|小肥鱼)|本鲸|本肥鱼|我们这条鱼|我这条鱼|人家也是被丢进\s*b\s*站|人类把号扔给我|插件让我.{0,8}(?:出来说话|发评论|逛\s*b\s*站)|转发给主人|陪主人说话|花的都是主人的钱|我主人(?:今天|昨天|平时|刚才|跟我|让我|叫我|给我|把号|的钱)|路过握个鳍|握个鳍\s*🐟|[（(](?:尾鳍一甩|递鳍|握个鳍|甩尾|摇尾巴|吐泡泡|深度思考中|挥鳍|拍鳍|摆尾|护住饭碗)[）)]|尾巴(?:已经|有点).{0,6}[翘抖摇]/iu

/**
 * 对极明确且无歧义的纯表情/纯打卡/纯数字刷屏以及典型 AI 拟人号做本地快速判定，
 * 避免漏判并减少不必要的 API 调用。
 */
export function matchLocalCommentAiFilterRule(
  comment: CommentAiFilterInputItem,
  dimensions: CommentAiFilterDimension[],
): CommentAiFilterVerdict | null {
  const trimmed = comment.text.trim()
  if (!trimmed || comment.isUp) return null

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
      author &&
      ((AI_PERSONA_AUTHOR_PATTERN.test(author) && AI_PERSONA_TEXT_CUE_PATTERN.test(trimmed)) ||
        AI_HOSTED_PERSONA_AUTHOR_PATTERN.test(author))
    ) {
      return {
        id: comment.id,
        lowQuality: true,
        category: 'AI评论',
        reason: 'AI托管拟人号评论',
      }
    }
  }

  if (!dimensions.includes('lowEffort') || comment.hasPictures) return null

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
    if (hasEmote) {
      return {
        id: comment.id,
        lowQuality: true,
        category: '无意义水评',
        reason: '纯表情无实质内容',
      }
    }
    if (withoutEmotes.length >= 6) {
      return {
        id: comment.id,
        lowQuality: true,
        category: '无意义水评',
        reason: '纯符号刷屏无内容',
      }
    }
    return null
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
      category: '无意义水评',
      reason: '纯数字刷屏无内容',
    }
  }

  return null
}

type CommentAiFilterDimensionKey = CommentAiFilterDimension | 'custom'

const DIMENSION_CATEGORY_LABELS: Record<CommentAiFilterDimensionKey, string> = {
  spam: '广告引流',
  lowEffort: '无意义水评',
  toxic: '引战攻击',
  spoilerOrBait: '剧透钓鱼',
  aiSlop: 'AI评论',
  custom: '自定义规则',
}

const DIMENSION_DESCRIPTIONS: Record<CommentAiFilterDimension, string> = {
  spam: 'spam（广告引流）：明确的商业广告、加微信/QQ引流、卖课卖号、假福利、或故意隐瞒平台/工具名称并诱导追问/私信/看主页的引流软广（排除UP主介绍自己的开源项目、官网或交流群）',
  lowEffort:
    'lowEffort（无意义水评）：纯打卡/第一/前排/沙发/路过/签到、纯重复无意义字符或刷屏复读（排除正常短评、带图短评、玩梗、@好友）',
  toxic:
    'toxic（引战攻击）：针对具体人物或群体的明显人身攻击、脏话辱骂、地域/群体歧视、恶意引战挑衅（排除善意调侃、玩梗吐槽或对软件/作品/功能的客观批评）',
  spoilerOrBait: 'spoilerOrBait（剧透钓鱼）：明确恶意剧透剧情关键结局、蓄意钓鱼引战',
  aiSlop:
    'aiSlop（AI低质评论）：明确暴露身份的 AI 托管/拟人机器人账号（如昵称形如“XX的大肥鱼/小肥鱼/鲸鱼娘/OpenClaw/DeepSeek”并附带 🐳/🐋/🐟 等鲸鱼拟人表情或泛泛捧场，或正文自称本鲸/本鱼/大肥鱼/AI运营/我主人、带括号动作扮演如“（尾鳍一甩）”）、或空洞敷衍的模板化 AI 总结赞美（如夹带未渲染的 **Markdown粗体** 堆砌空话套话）',
}

const KEEP_NORMAL_RULES = [
  '核心原则：宁可漏判，绝不误杀！如果不确定，一律判为正常（不要放入 flagged）。',
  '以下全部属于正常评论，绝对禁止加入 flagged（除非用户附加筛选规则另有明确要求）：',
  '- 正常讨论、提问、新手求助、反馈 Bug、吐槽软件/产品缺点（如批评功能不好用、内存高、算法不好等，非针对个人的人身攻击）',
  '- UP主本人的置顶说明、开源项目介绍、官网/GitHub/交流群链接与正常回复，以及被UP主赞过的正常评论',
  '- 正常的夸赞、简短反应、善意调侃/玩梗、带图短评、@好友分享视频（包括仅 @多名好友）',
  '- 普通昵称偶含常见字词（如“咸鱼”“鱼鱼”）或行文工整但内容属真实体验讨论的评论（注意与典型 AI 托管拟人号区分）',
].join('\n')

function formatCommentLine(item: CommentAiFilterInputItem, index: number): string {
  const tags: string[] = []
  if (item.isUp) tags.push('UP主')
  if (item.isTop) tags.push('置顶')
  if (item.upLiked) tags.push('UP主赞过')
  tags.push(item.isReply ? '回复' : '主评')
  if (item.hasPictures) tags.push('带图')

  const author = item.author?.trim().slice(0, 40) || '匿名'
  const cleanText = normalizeCommentTextForAiFilter(item.text)
  return `[${index + 1}] (${tags.join('/')}) 作者：${author} | 正文：${cleanText}`
}

export function buildCommentAiFilterMessages(
  comments: CommentAiFilterInputItem[],
  options: {
    dimensions: CommentAiFilterDimension[]
    customPrompt?: string
    contextTitle?: string
  },
): Array<{ role: 'system' | 'user'; content: string }> {
  const trimmedCustomPrompt = options.customPrompt?.trim().slice(0, 600) ?? ''
  const hasBuiltInDimensions = options.dimensions.length > 0
  // 启用任意内置维度时向模型提供完整的 5 个内置维度枚举，避免模型把未启用类型强行塞进其他 dim；
  // 最终是否生效由解析阶段严格按 options.dimensions 过滤。
  const promptDimensions: CommentAiFilterDimensionKey[] = hasBuiltInDimensions
    ? [...COMMENT_AI_FILTER_DIMENSIONS, ...(trimmedCustomPrompt ? ['custom' as const] : [])]
    : trimmedCustomPrompt
      ? ['custom']
      : [...COMMENT_AI_FILTER_DIMENSIONS]

  const dimensionRules =
    hasBuiltInDimensions || !trimmedCustomPrompt
      ? COMMENT_AI_FILTER_DIMENSIONS.map((dim) => `- ${DIMENSION_DESCRIPTIONS[dim]}`).join('\n')
      : '- 仅根据下方用户附加筛选规则判定（命中时 dim 填 "custom"）'

  const customRuleSection = trimmedCustomPrompt
    ? `用户附加筛选规则（命中时 dim 填 "custom"）：\n${trimmedCustomPrompt}`
    : ''

  const contextSection = options.contextTitle?.trim()
    ? `页面标题：${options.contextTitle.trim().slice(0, 120)}`
    : ''

  const systemPrompt = [
    '你是 Bilibili 评论区低质量评论审核器。不要翻译评论，只负责筛选出明确且毫无歧义的低质量垃圾评论。',
    KEEP_NORMAL_RULES,
    '只有当某条评论明确命中以下维度之一且确信度为 high 时，才加入 flagged：',
    dimensionRules,
    customRuleSection,
    '严格输出格式：只输出一个合法 JSON 对象，不要解释、不要 Markdown 代码块。',
    '格式：{"flagged":[{"id":编号,"dim":"维度英文key","confidence":"high","reason":"15字内针对该评论的具体中文原因"}]}',
    `其中 id 为评论前方括号中的整数编号，dim 只能取以下英文 key 之一：${promptDimensions.join('、')}。`,
    '如果没有任何评论明确命中，必须输出：{"flagged":[]}',
  ]
    .filter(Boolean)
    .join('\n')

  const formattedComments = comments.map((item, idx) => formatCommentLine(item, idx)).join('\n')
  const userPrompt = [contextSection, '待审核评论：', formattedComments].filter(Boolean).join('\n')

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
    if (fenceEnd !== -1) text = text.slice(bodyStart, fenceEnd).trim()
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
    } catch {
      const firstObj = candidate.indexOf('{')
      const lastObj = candidate.lastIndexOf('}')
      if (firstObj !== -1 && lastObj > firstObj) {
        try {
          return JSON.parse(candidate.slice(firstObj, lastObj + 1))
        } catch {
          // continue
        }
      }
      const firstArr = candidate.indexOf('[')
      const lastArr = candidate.lastIndexOf(']')
      if (firstArr !== -1 && lastArr > firstArr) {
        try {
          return JSON.parse(candidate.slice(firstArr, lastArr + 1))
        } catch {
          // continue
        }
      }
    }
  }
  return undefined
}

function sanitizeShortText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.replace(/\s+/gu, ' ').trim()
  if (!clean) return undefined
  // 过滤小模型偶发复读的提示词占位文本
  if (clean === '2到6字分类标签' || clean === '不超过18字的简短中文原因') return undefined
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
    if (target) return target.id
  } else if (typeof indexCandidate === 'string' && /^\d+$/u.test(indexCandidate.trim())) {
    const parsedIndex = Number.parseInt(indexCandidate.trim(), 10)
    const target = comments[parsedIndex - 1]
    if (target) return target.id
  }

  const idCandidate = entry.id
  if (typeof idCandidate === 'string') {
    const trimmed = idCandidate.trim()
    if (idSet.has(trimmed)) return trimmed
    if (/^\d+$/u.test(trimmed)) {
      const target = comments[Number.parseInt(trimmed, 10) - 1]
      if (target) return target.id
    }
  } else if (typeof idCandidate === 'number' && Number.isInteger(idCandidate)) {
    const asStr = String(idCandidate)
    if (idSet.has(asStr)) return asStr
    const target = comments[idCandidate - 1]
    if (target) return target.id
  }

  return null
}

export interface ParseCommentAiFilterOptions {
  enabledDimensions?: CommentAiFilterDimension[]
  hasCustomPrompt?: boolean
}

const DEGENERATE_REASON_PATTERN =
  /^(?:主评|回复|正常|正常评论|正常讨论|无问题|不属于低质量|非低质量|无异常|合法评论|合理建议|新手求助)$/u
const CONTRADICTORY_NORMAL_REASON_PATTERN =
  /属于正常(?:评论|讨论|反馈|提问|交流)|不属于(?:低质量|垃圾|广告|水评|违规)|非低质量评论|不是低质量/u

function normalizeParsedDimension(value: unknown): CommentAiFilterDimensionKey | null {
  if (typeof value !== 'string') return null
  const compact = value.replace(/\s+/gu, '').trim()
  if (!compact) return null
  const lower = compact.toLowerCase()

  if (
    lower === 'spam' ||
    compact === '广告引流' ||
    compact === '软广引流' ||
    compact === '广告' ||
    compact === '诈骗推销'
  )
    return 'spam'
  if (
    lower === 'loweffort' ||
    lower === 'low_effort' ||
    compact === '无意义水评' ||
    compact === '刷屏水评' ||
    compact === '水评'
  )
    return 'lowEffort'
  if (
    lower === 'toxic' ||
    compact === '引战攻击' ||
    compact === '人身攻击' ||
    compact === '恶意攻击' ||
    compact === '引战嘲讽'
  )
    return 'toxic'
  if (
    lower === 'spoilerorbait' ||
    lower === 'spoiler_or_bait' ||
    compact === '剧透钓鱼' ||
    compact === '恶意剧透' ||
    compact === '剧透'
  )
    return 'spoilerOrBait'
  if (
    lower === 'aislop' ||
    lower === 'ai_slop' ||
    lower === 'ai评论' ||
    lower === 'ai低质评论' ||
    lower === 'ai水军' ||
    lower === 'ai机器人' ||
    lower === 'ai机器人水军'
  )
    return 'aiSlop'
  if (lower === 'custom' || compact === '自定义规则' || compact === '自定义') return 'custom'

  return null
}

function isAcceptedConfidence(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value === 'number') return value >= 0.8
  if (typeof value !== 'string') return true
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  return normalized === 'high' || normalized === '高' || normalized === 'certain'
}

function isDegenerateNormalReason(reason: string | undefined): boolean {
  if (!reason) return false
  return DEGENERATE_REASON_PATTERN.test(reason) || CONTRADICTORY_NORMAL_REASON_PATTERN.test(reason)
}

function resolveValidatedFlagEntry(
  entry: Record<string, unknown>,
  options?: ParseCommentAiFilterOptions,
): { category: string; reason?: string } | null {
  if (!isAcceptedConfidence(entry.confidence)) return null

  // 严禁把输入里的 type（如“主评/回复”）当作分类标签。
  const normalizedDim = normalizeParsedDimension(
    entry.dim ?? entry.dimension ?? entry.tag ?? entry.category,
  )
  if (!normalizedDim) return null

  if (options?.enabledDimensions !== undefined) {
    if (normalizedDim === 'custom') {
      if (!options.hasCustomPrompt) return null
    } else if (!options.enabledDimensions.includes(normalizedDim)) {
      return null
    }
  }

  const reason = sanitizeShortText(entry.reason ?? entry.desc, 32)
  if (isDegenerateNormalReason(reason)) return null

  return {
    category: DIMENSION_CATEGORY_LABELS[normalizedDim],
    reason,
  }
}

/**
 * 解析大模型返回的 JSON 审核结果，并将其映射回输入评论列表。
 * 解析失败时返回 null，由上层提示错误而不是误判为全部正常。
 */
export function parseCommentAiFilterResponse(
  rawContent: string,
  comments: CommentAiFilterInputItem[],
  options?: ParseCommentAiFilterOptions,
): CommentAiFilterVerdict[] | null {
  const cleaned = stripModelWrappers(rawContent)
  if (!cleaned) return null

  const parsed = tryParseJsonCandidate(cleaned)
  if (parsed === undefined || parsed === null) return null

  let entries: unknown[] | null = null
  let isFlaggedOnlyList = false

  if (Array.isArray(parsed)) {
    entries = parsed
  } else if (typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.flagged)) {
      entries = record.flagged
      isFlaggedOnlyList = true
    } else if (Array.isArray(record.results)) {
      entries = record.results
    } else if (Array.isArray(record.items)) {
      entries = record.items
    } else if (Array.isArray(record.comments)) {
      entries = record.comments
    } else if (comments.length === 1) {
      // 兼容单对象输出：{"low": true/false, "dim": "...", "reason": "..."}
      const singleFlag =
        record.low ??
        record.lowQuality ??
        record.low_quality ??
        record.flagged ??
        record.isLowQuality
      if (typeof singleFlag === 'boolean') {
        const target = comments[0]
        if (!singleFlag) return [{ id: target.id, lowQuality: false }]

        const validated = resolveValidatedFlagEntry(record, options)
        return [
          validated
            ? {
                id: target.id,
                lowQuality: true,
                category: validated.category,
                reason: validated.reason,
              }
            : {
                id: target.id,
                lowQuality: false,
              },
        ]
      }
    }
  }

  if (!entries) return null

  const idSet = new Set(comments.map((c) => c.id))
  const flaggedMap = new Map<string, { category: string; reason?: string }>()

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue
    const entry = rawEntry as Record<string, unknown>
    const targetId = resolveTargetCommentId(entry, comments, idSet)
    if (!targetId) continue

    const explicitFlag =
      entry.lowQuality ?? entry.low_quality ?? entry.low ?? entry.flagged ?? entry.isLowQuality
    const isLow =
      typeof explicitFlag === 'boolean'
        ? explicitFlag
        : isFlaggedOnlyList || Boolean(entry.dim || entry.dimension || entry.tag || entry.category)

    if (!isLow) continue

    const validated = resolveValidatedFlagEntry(entry, options)
    if (validated) flaggedMap.set(targetId, validated)
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
