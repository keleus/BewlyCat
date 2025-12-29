import antfu from '@antfu/eslint-config'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

export default antfu(
  {
    formatters: {
      css: 'prettier',
      prettierOptions: {
        printWidth: 120,
        singleQuote: false,
      },
    },
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.pnpm-store/**',
      '**/public/**',
      '**/extension/**',
      '**/extension-firefox/**',
      '**/.kiro/**',
    ],
    rules: {
      'vue/max-attributes-per-line': [
        'error',
        {
          singleline: {
            max: 5,
          },
          multiline: {
            max: 5,
          },
        },
      ],
      'no-alert': 'off',
      'style/quote-props': 'off',
      'vue/no-required-prop-with-default': 'off',
    },
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'import/order': 'off',
      'sort-imports': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'no-console': ['error', { allow: ['debug', 'warn', 'error', 'log'] }],
    },
  },
)
