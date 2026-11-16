export interface SearchMatchTarget {
  titleText: string
  keywordText: string
}

export interface SearchPartMatch {
  score: number
  fuzzy: boolean
}

// 只在含中日韩文字的查询片段上启用分隔匹配，避免英文缩写误配到长句中的零散字母。
const CJK_CHARACTER_PATTERN = /[\u3400-\u9FFF\uF900-\uFAFF]/
const MIN_FUZZY_PART_LENGTH = 3
const FUZZY_CHARACTER_SCORE = 10
const FUZZY_CONSECUTIVE_BONUS = 2
const FUZZY_GAP_PENALTY = 3
const FUZZY_KEYWORD_PENALTY = 10
const FUZZY_MIN_SCORE = 5

function scoreContiguous(text: string, part: string, exact: number, prefix: number, includes: number) {
  if (!text)
    return null
  if (text === part)
    return exact
  if (text.startsWith(part))
    return prefix
  if (text.includes(part))
    return includes
  return null
}

/**
 * 按顺序匹配查询片段中的每个字符，允许中间跳过标题里的修饰词。
 * 例如「触屏改进」可以命中「触屏体验改进」，连续命中和间隔较小者得分更高。
 */
function scoreSubsequence(text: string, part: string): number | null {
  if (part.length < MIN_FUZZY_PART_LENGTH || !CJK_CHARACTER_PATTERN.test(part))
    return null

  let searchFrom = 0
  let previousIndex = -1
  let score = 0

  for (const character of part) {
    const index = text.indexOf(character, searchFrom)
    if (index < 0)
      return null

    score += FUZZY_CHARACTER_SCORE
    if (previousIndex >= 0) {
      if (index === previousIndex + 1)
        score += FUZZY_CONSECUTIVE_BONUS
      else
        score -= (index - previousIndex - 1) * FUZZY_GAP_PENALTY
    }

    previousIndex = index
    searchFrom = index + 1
  }

  return Math.max(FUZZY_MIN_SCORE, score)
}

export function getSearchPartScore(target: SearchMatchTarget, part: string): SearchPartMatch | null {
  const candidates: SearchPartMatch[] = []

  const titleContiguous = scoreContiguous(target.titleText, part, 120, 80, 50)
  if (titleContiguous !== null)
    candidates.push({ score: titleContiguous, fuzzy: false })

  const keywordContiguous = scoreContiguous(target.keywordText, part, 60, 20, 10)
  if (keywordContiguous !== null)
    candidates.push({ score: keywordContiguous, fuzzy: false })

  const titleFuzzy = scoreSubsequence(target.titleText, part)
  if (titleFuzzy !== null)
    candidates.push({ score: titleFuzzy, fuzzy: true })

  const keywordFuzzy = scoreSubsequence(target.keywordText, part)
  if (keywordFuzzy !== null)
    candidates.push({ score: Math.max(FUZZY_MIN_SCORE, keywordFuzzy - FUZZY_KEYWORD_PENALTY), fuzzy: true })

  if (!candidates.length)
    return null

  return candidates.reduce((best, candidate) => candidate.score > best.score ? candidate : best)
}
