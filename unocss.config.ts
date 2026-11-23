import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import type { ExtractorContext } from 'unocss'
import { defineConfig, extractorSplit, presetAttributify, presetIcons, presetWind3, transformerDirectives } from 'unocss'

const remRE = /(-?[.\d]+)rem/g
const STYLE_BLOCK_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi
const SCRIPT_BLOCK_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
// JS/TS 代码中的动态类名或图标只出现在字符串字面量里；跳过类型声明、变量名与注释可减少约 65% 无效 token。
const STRING_LITERAL_RE = /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g

function extractTemplateOnly(code: string): string {
  return code.replace(STYLE_BLOCK_RE, '').replace(SCRIPT_BLOCK_RE, '')
}

function extractStringLiterals(code: string): string {
  const literals: string[] = []
  for (const match of code.matchAll(STRING_LITERAL_RE))
    literals.push(match[0])
  return literals.join(' ')
}

function extractVueScopedCode(code: string): string {
  const withoutStyle = code.replace(STYLE_BLOCK_RE, '')
  const templatePart = withoutStyle.replace(SCRIPT_BLOCK_RE, '')
  const scriptLiterals: string[] = []
  for (const match of withoutStyle.matchAll(SCRIPT_BLOCK_RE)) {
    const literalText = extractStringLiterals(match[1])
    if (literalText)
      scriptLiterals.push(literalText)
  }
  return scriptLiterals.length ? `${templatePart}\n${scriptLiterals.join('\n')}` : templatePart
}

function createTemplateScopedAttributifyPreset() {
  const base = presetAttributify()
  return {
    ...base,
    extractors: base.extractors?.map(extractor => ({
      ...extractor,
      extract(ctx: ExtractorContext) {
        const id = ctx.id ?? ''
        // 属性化语法仅存在于原始 .vue 的 <template> 与 .html，跳过 <script>、<style>、.ts 与 ?vue 虚拟子模块。
        if (/\.vue$/.test(id)) {
          const templateCode = extractTemplateOnly(ctx.code)
          if (!templateCode.trim())
            return undefined
          return extractor.extract?.({ ...ctx, code: templateCode })
        }
        if (/\.html$/.test(id))
          return extractor.extract?.(ctx)
        return undefined
      },
    })),
  }
}

// presetIcons 默认从 @iconify/json 按需加载图标集，但其缓存只在读取完成后才生效：生成 CSS 时
// 同一图标集的图标并发请求，每个请求都会重新读取并解析整份 JSON（mingcute 曾被读取上百次），
// 导致构建耗时数十秒、内存峰值达数 GB。这里为项目用到的图标集提供共享同一次加载的 loader；
// 新增未列出的图标集仍会走默认加载，只是会重新出现上述开销。
const ICON_COLLECTIONS = ['mingcute', 'tabler', 'solar', 'svg-spinners', 'line-md', 'uil', 'ph', 'mdi', 'ic', 'fluent']
const requireFromConfig = createRequire(import.meta.url)
const iconCollectionCache = new Map<string, Promise<any>>()

function loadIconCollection(name: string) {
  let collection = iconCollectionCache.get(name)
  if (!collection) {
    collection = readFile(requireFromConfig.resolve(`@iconify/json/json/${name}.json`), 'utf8').then(JSON.parse)
    iconCollectionCache.set(name, collection)
  }
  return collection
}

export default defineConfig({
  content: {
    // 仅从实际进入模块图的模板与声明动态图标/类名的目录提取原子类，
    // 跳过 svgIcons.ts、inject、background、logic/storage 等大体积非 UI 文件。
    pipeline: {
      include: [
        // 仅匹配原始 .vue 文件，跳过 vite:vue 拆出的 ?vue&type=script/template/style 虚拟子模块
        /\.vue$/,
        /\.html$/,
        /[\\/]src[\\/](?:components|stores|constants)[\\/].*\.[jt]sx?$/,
      ],
      exclude: [
        /[\\/]node_modules[\\/]/,
        /\.(?:css|postcss|sass|scss|less|stylus|styl)(?:$|\?)/,
        /[\\/](?:searchCatalog|usageGuide|searchApi|appClient|contentScript|globalEvents|watchLaterState)\.ts$/,
      ],
    },
  },
  blocklist: [
    'ps',
    'container',
  ],
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
        if (/\.vue$/.test(id))
          code = extractVueScopedCode(ctx.code)
        else if (/\.[jt]sx?$/.test(id))
          code = extractStringLiterals(ctx.code)
        return extractorSplit.extract?.({ ...ctx, code })
      },
    },
  ],
  presets: [
    presetWind3(),
    createTemplateScopedAttributifyPreset(),
    presetIcons({
      collections: Object.fromEntries(ICON_COLLECTIONS.map(name => [name, () => loadIconCollection(name)])),
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
        'width': '1.2em',
        'height': '1.2em',
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
  transformers: [
    transformerDirectives(),
  ],
})
