import antfu from '@antfu/eslint-config'

export default antfu({
  javascript: {
    overrides: {
      'no-console': ['off'],
      'unused-imports/no-unused-imports': ['error'],
    },
  },
  typescript: {
    overrides: {
      'ts/no-namespace': ['off'],
      'ts/ban-types': ['off'],
    },
  },
  stylistic: {
    overrides: {
      'style/space-before-blocks': ['error', 'always'],
      'style/arrow-parens': ['error', 'always'],
    },
  },
  formatters: true,
  vue: {
    overrides: {
      'vue/component-name-in-template-casing': [
        'error',
        'PascalCase',
        { registeredComponentsOnly: false },
      ],
    },
  },
})
