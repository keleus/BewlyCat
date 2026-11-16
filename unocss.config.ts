import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { defineConfig, presetAttributify, presetIcons, presetTypography, presetWind3, transformerDirectives } from 'unocss'

const remRE = /(-?[.\d]+)rem/g

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
    filesystem: [
      '**/*.{js,ts,vue,svelte,jsx,tsx,mdx,md,astro,elm,php,phtml,html}',
    ],
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
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      collections: Object.fromEntries(ICON_COLLECTIONS.map(name => [name, () => loadIconCollection(name)])),
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
        'width': '1.2em',
        'height': '1.2em',
      },
    }),
    presetTypography(),

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
