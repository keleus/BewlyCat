import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import type { ExtractorContext } from 'unocss'
import {
  defineConfig,
  extractorSplit,
  presetAttributify,
  presetIcons,
  presetWind3,
  transformerDirectives,
} from 'unocss'
import { parse as parseSfc } from 'vue/compiler-sfc'

const remRE = /(-?[.\d]+)rem/g
// JS/TS 代码中的动态类名或图标只出现在字符串字面量里；跳过类型声明、变量名与注释可减少约 65% 无效 token。
const STRING_LITERAL_RE = /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g

interface ParsedVueUnoBlocks {
  code: string
  template: string
  scoped: string
}

const vueUnoBlocksCache = new Map<string, ParsedVueUnoBlocks>()

function extractStringLiterals(code: string): string {
  const literals: string[] = []
  for (const match of code.matchAll(STRING_LITERAL_RE)) literals.push(match[0])
  return literals.join(' ')
}

function parseVueUnoBlocks(id: string, code: string): ParsedVueUnoBlocks {
  const cached = vueUnoBlocksCache.get(id)
  if (cached && cached.code === code) return cached

  // 使用 Vue 官方 SFC 解析器拆分块，避免用正则剥离 <script>/<style> 标签产生漏匹配或代码扫描告警。
  const { descriptor } = parseSfc(code, { filename: id, ignoreEmpty: true })
  const template = descriptor.template?.content ?? ''
  const scriptLiterals: string[] = []
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block?.content) continue
    const literalText = extractStringLiterals(block.content)
    if (literalText) scriptLiterals.push(literalText)
  }
  const scoped = scriptLiterals.length ? `${template}\n${scriptLiterals.join('\n')}` : template
  const parsed: ParsedVueUnoBlocks = { code, template, scoped }
  vueUnoBlocksCache.set(id, parsed)
  return parsed
}

function createTemplateScopedAttributifyPreset() {
  const base = presetAttributify()
  return {
    ...base,
    extractors: base.extractors?.map((extractor) => ({
      ...extractor,
      extract(ctx: ExtractorContext) {
        const id = ctx.id ?? ''
        // 属性化语法仅存在于原始 .vue 的 <template> 与 .html，跳过 <script>、<style>、.ts 与 ?vue 虚拟子模块。
        if (id.endsWith('.vue')) {
          const templateCode = parseVueUnoBlocks(id, ctx.code).template
          if (!templateCode.trim()) return undefined
          return extractor.extract?.({ ...ctx, code: templateCode })
        }
        if (id.endsWith('.html')) return extractor.extract?.(ctx)
        return undefined
      },
    })),
  }
}

// presetIcons 默认从 @iconify/json 按需加载图标集，但其缓存只在读取完成后才生效：生成 CSS 时
// 同一图标集的图标并发请求，每个请求都会重新读取并解析整份 JSON（mingcute 曾被读取上百次），
// 导致构建耗时数十秒、内存峰值达数 GB。但如果把 10 份原始 JSON（共 36 MB，解析后数百 MB V8 对象）
// 永久钉在常驻进程堆中，开发模式又容易引发 OOM。
// 这里按需提取单个图标的子集对象并缓存（全仓 ~230 个图标合计不足百 KB），整份 JSON 仅在构建波次内
// 共享去重，空闲后自动释放供 GC 回收。
const ICON_COLLECTIONS = [
  'mingcute',
  'tabler',
  'solar',
  'svg-spinners',
  'line-md',
  'uil',
  'ph',
  'mdi',
  'ic',
  'fluent',
]
const ICON_COLLECTION_IDLE_TTL_MS = 1500
const requireFromConfig = createRequire(import.meta.url)

interface IconifyAlias {
  parent: string
  [key: string]: unknown
}

interface IconifyCollectionData {
  prefix: string
  width?: number
  height?: number
  left?: number
  top?: number
  rotate?: number
  hFlip?: boolean
  vFlip?: boolean
  icons: Record<string, unknown>
  aliases?: Record<string, IconifyAlias>
}

const fullCollectionCache = new Map<string, Promise<IconifyCollectionData>>()
const iconSubsetCache = new Map<string, IconifyCollectionData | null>()
let fullCollectionEvictTimer: ReturnType<typeof setTimeout> | undefined

function scheduleFullCollectionEviction() {
  if (fullCollectionEvictTimer) clearTimeout(fullCollectionEvictTimer)
  fullCollectionEvictTimer = setTimeout(() => {
    fullCollectionCache.clear()
    fullCollectionEvictTimer = undefined
  }, ICON_COLLECTION_IDLE_TTL_MS)
  fullCollectionEvictTimer.unref()
}

function loadFullIconCollection(name: string): Promise<IconifyCollectionData> {
  scheduleFullCollectionEviction()
  let collection = fullCollectionCache.get(name)
  if (!collection) {
    collection = readFile(
      requireFromConfig.resolve(`@iconify/json/json/${name}.json`),
      'utf8',
    ).then((raw) => JSON.parse(raw) as IconifyCollectionData)
    fullCollectionCache.set(name, collection)
  }
  return collection
}

function buildSingleIconSubset(
  collection: IconifyCollectionData,
  iconName: string,
): IconifyCollectionData | null {
  const candidates = [
    iconName,
    iconName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
    iconName.replace(/([a-z])(\d+)/g, '$1-$2'),
  ]

  let matchedId: string | undefined
  for (const id of candidates) {
    if (id in collection.icons || (collection.aliases && id in collection.aliases)) {
      matchedId = id
      break
    }
  }
  if (!matchedId) return null

  const subsetIcons: Record<string, unknown> = {}
  const subsetAliases: Record<string, IconifyAlias> = {}
  const visited = new Set<string>()
  let current: string | undefined = matchedId

  while (current && !visited.has(current)) {
    visited.add(current)
    if (current in collection.icons) {
      subsetIcons[current] = collection.icons[current]
      break
    }
    const alias: IconifyAlias | undefined = collection.aliases?.[current]
    if (!alias) return null
    subsetAliases[current] = alias
    current = alias.parent
  }

  if (Object.keys(subsetIcons).length === 0) return null

  return {
    prefix: collection.prefix,
    ...(collection.width !== undefined ? { width: collection.width } : {}),
    ...(collection.height !== undefined ? { height: collection.height } : {}),
    ...(collection.left !== undefined ? { left: collection.left } : {}),
    ...(collection.top !== undefined ? { top: collection.top } : {}),
    ...(collection.rotate !== undefined ? { rotate: collection.rotate } : {}),
    ...(collection.hFlip !== undefined ? { hFlip: collection.hFlip } : {}),
    ...(collection.vFlip !== undefined ? { vFlip: collection.vFlip } : {}),
    icons: subsetIcons,
    ...(Object.keys(subsetAliases).length > 0 ? { aliases: subsetAliases } : {}),
  }
}

async function loadSingleIcon(collectionName: string, iconName: string): Promise<any> {
  const cacheKey = `${collectionName}:${iconName}`
  const cached = iconSubsetCache.get(cacheKey)
  if (cached !== undefined) return cached ?? undefined

  const fullCollection = await loadFullIconCollection(collectionName)
  scheduleFullCollectionEviction()
  const subset = buildSingleIconSubset(fullCollection, iconName)
  iconSubsetCache.set(cacheKey, subset)
  return subset ?? undefined
}

export function createUnoConfig() {
  return defineConfig({
    content: {
      // 仅从实际进入模块图的模板与声明动态图标/类名的目录提取原子类，
      // 跳过 svgIcons.ts、inject、background、logic/storage 等大体积非 UI 文件。
      pipeline: {
        include: [
          // 仅匹配原始 .vue 文件，跳过 vite:vue 拆出的 ?vue&type=script/template/style 虚拟子模块
          /\.vue$/,
          /\.html$/,
          /[\\/]src[\\/](?:components|composables|stores|constants)[\\/].*\.[jt]sx?$/,
        ],
        exclude: [
          /[\\/]node_modules[\\/]/,
          /\.(?:css|postcss|sass|scss|less|stylus|styl)(?:$|\?)/,
          /[\\/](?:searchCatalog|usageGuide|searchApi|appClient|contentScript|globalEvents|watchLaterState)\.ts$/,
        ],
      },
    },
    blocklist: ['ps', 'container'],
    safelist: [
      'i-mingcute:home-5-line',
      'i-mingcute:home-5-fill',
      'i-mingcute:search-2-line',
      'i-mingcute:search-2-fill',
      'i-mingcute:tv-2-line',
      'i-mingcute:bilibili-line',
      'i-mingcute:bilibili-fill',
      'i-mingcute:star-line',
      'i-mingcute:star-fill',
      'i-mingcute:time-line',
      'i-mingcute:time-fill',
      'i-mingcute:carplay-line',
      'i-mingcute:carplay-fill',
      'i-tabler:windmill',
      'i-tabler:windmill-filled',
      'i-mingcute:game-2-fill',
      'i-mingcute:store-fill',
      'i-mingcute:cat-fill',
      'i-mingcute:sword-fill',
      // Runtime Icon components resolve to these local UnoCSS icons. Keeping the
      // finite list here prevents @iconify/vue from fetching icons after mount.
      'i-tabler:eye',
      'i-tabler:eye-off',
      'i-tabler:chevron-left',
      'i-tabler:chevron-right',
      'i-tabler:x',
      'i-mingcute:settings-3-line',
      'i-mingcute:check-line',
      'i-mingcute:edit-3-line',
      'i-mingcute:cursor-3-line',
      'i-mingcute:transfer-3-line',
      'i-mingcute:navigation-line',
      'i-mingcute:eye-line',
      'i-mingcute:eye-close-line',
      'i-mingcute:play-circle-line',
      'i-mingcute:danmaku-line',
      'i-mingcute:thumb-up-2-line',
      'i-mingcute:table-3-line',
      'i-mingcute:table-3-fill',
      'i-mingcute:layout-grid-line',
      'i-mingcute:layout-grid-fill',
      'i-mingcute:list-check-3-line',
      'i-mingcute:list-check-3-fill',
      'i-line-md:sunny-outline-to-moon-loop-transition',
      'i-line-md:moon-alt-to-sunny-outline-loop-transition',
      'i-line-md:sunny-outline-to-moon-transition',
      'i-line-md:moon-to-sunny-outline-transition',
      'i-tabler:reload',
      'i-line-md:arrow-small-up',
      'i-line-md:confirm',
      'i-mdi:undo-variant',
      'i-mdi:redo-variant',
    ],
    extractorDefault: false,
    extractors: [
      {
        name: 'bewly-scoped-split',
        order: 0,
        extract(ctx) {
          const id = ctx.id ?? ''
          let code = ctx.code
          if (id.endsWith('.vue')) code = parseVueUnoBlocks(id, ctx.code).scoped
          else if (/\.[jt]sx?$/.test(id)) code = extractStringLiterals(ctx.code)
          return extractorSplit.extract?.({ ...ctx, code })
        },
      },
    ],
    presets: [
      presetWind3(),
      createTemplateScopedAttributifyPreset(),
      presetIcons({
        collections: Object.fromEntries(
          ICON_COLLECTIONS.map((name) => [name, (icon: string) => loadSingleIcon(name, icon)]),
        ),
        extraProperties: {
          display: 'inline-block',
          'vertical-align': 'middle',
          width: '1.2em',
          height: '1.2em',
        },
      }),

      {
        name: 'text-size-transformer',
        postprocess: (util) => {
          util.entries.forEach((i) => {
            const value = i[1]

            if (typeof value === 'string' && remRE.test(value)) {
              i[1] = value.replace(remRE, (_, num: number) => {
                return `calc(var(--bew-base-font-size) * ${num})`
              })
            }
          })
        },
      },
    ],
    transformers: [transformerDirectives()],
  })
}

export default createUnoConfig()
