const czConfig = require('./cz.config.cjs')

const maxHeaderLength = czConfig.maxMessageLength
const typeEnums = czConfig.list

/**
 * @type {import('@commitlint/types').UserConfig}
 *
 * @see https://commitlint.js.org/#/reference-configuration
 */
const Configuration = {
  /**
   * 继承规则
   */
  extends: ['@commitlint/config-conventional'],
  /**
   * 定义规则
   */
  rules: {
    'header-max-length': [0, 'always', maxHeaderLength],
    'type-enum': [2, 'always', typeEnums],
  },
}

module.exports = Configuration
