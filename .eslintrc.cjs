const { defineConfig } = require('eslint-define-config')

module.exports = defineConfig({
  root: true,
  extends: ['@antfu'],
  rules: {
    // common
    'array-element-newline': ['error', 'consistent'],
    'array-bracket-newline': ['error', 'consistent'],
    'function-paren-newline': ['error', 'consistent'],
    'arrow-parens': ['error', 'always'],
    'quote-props': ['error', 'as-needed'],
    'object-shorthand': ['off'],
    'space-before-blocks': 'error',

    // antfu
    'antfu/if-newline': 'off',
    'antfu/generic-spacing': 'off', // ts 泛型换行

    // ts
    '@typescript-eslint/ban-ts-comment': 'off',
  },
})
