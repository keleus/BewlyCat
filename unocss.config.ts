import { defineConfig, presetAttributify, presetIcons, presetTypography, presetWind3, transformerDirectives } from 'unocss'

const remRE = /(-?[.\d]+)rem/g

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
    'i-mingcute:tv-2-fill',
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
    'i-line-md:rotate-270',
    'i-line-md:arrow-small-up',
    'i-line-md:confirm',
    'i-mdi:undo-variant',
    'i-mdi:redo-variant',
  ],
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
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
