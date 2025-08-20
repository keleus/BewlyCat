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
