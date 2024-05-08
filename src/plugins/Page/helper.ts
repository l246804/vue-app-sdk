import { isString } from 'nice-fns'
import type { I18n } from 'vue-i18n'

/**
 * I18n 实例
 */
export type I18nInstance = I18n

/**
 * 传统的 i18n
 */
export type LegacyI18n = I18n<{}, {}, {}, string, true>

/**
 * 现代的 i18n
 */
export type ModernI18n = I18n<{}, {}, {}, string, false>

/**
 * 根据 i18n 实例创建本地化文本函数，用于处理动态多语言文本
 *
 * @example
 * ```ts
 * // locale.ts
 * export const localeText = createLocaleText(i18n)
 *
 * // menu.ts
 * const menu = { title: '菜单' }
 * localeText(menu.title) // '菜单'
 *
 * const menu = { title: { 'zh-cn': '菜单', en: 'Menu' } }
 * localeText(menu.title) // i18n.global.locale 为 `zh-cn` 时为 '菜单'，`en` 时为 'Menu'
 *
 * // alert.ts
 * alert(localeText({ 'zh-cn': '这是中文警告！', en: 'This is a warning in English!' }))
 *
 * // menu.vue
 * const menu = { title: { 'zh-cn': '菜单', en: 'Menu' } }
 * const menuTitle = computed(() => localeText(menu.title)) // 支持响应式动态变更
 * ```
 */
export function createLocaleText(i18n: I18nInstance) {
  return function localeText(message: string | Record<string, string> = '', locale = '') {
    if (isString(message) || !message)
      return message
    if (!locale) {
      locale
        = i18n.mode === 'legacy'
          ? (i18n as LegacyI18n).global.locale
          : (i18n as ModernI18n).global.locale.value
    }
    return message[locale]
  }
}
