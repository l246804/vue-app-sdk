import type { MaybeRefOrGetter } from 'vue'
import { logger } from '@/utils'
import { isObject, isString } from 'nice-fns'
import { toValue } from 'vue'

/**
 * 根据默认语言创建本地翻译函数，用于处理动态国际化文本
 *
 * @example
 * ```ts
 * // locale.ts
 * export const translateText = createTranslator(() => i18n.value.locale.value)
 *
 * // menu.ts
 * const menu = { title: '菜单' }
 * translateText(menu.title) // '菜单'
 *
 * const menu = { title: { 'zh-cn': '菜单', en: 'Menu' } }
 * translateText(menu.title) // i18n.global.locale 为 `zh-cn` 时为 '菜单'，`en` 时为 'Menu'
 *
 * // alert.ts
 * alert(translateText({ 'zh-cn': '这是中文警告！', en: 'This is a warning in English!' }))
 *
 * // menu.vue
 * const menu = { title: { 'zh-cn': '菜单', en: 'Menu' } }
 * const menuTitle = computed(() => translateText(menu.title)) // 支持响应式动态变更
 * ```
 */
export function createTranslator(localeGetter: MaybeRefOrGetter<string>) {
  return function translator(message: string | Record<string, string> = '', locale = '') {
    if (isString(message) || !message)
      return message
    if (!locale) {
      let baseLocale = toValue(localeGetter)
      // 兼容性支持 i18n 实例
      if (isObject(baseLocale) && 'global' in baseLocale) {
        logger.warn('localeGetter 后续将不再支持 i18n 实例，请使用 MaybeRefOrGetter<string> 类型值替代！')
        const i18n = baseLocale as any
        baseLocale = i18n.mode === 'legacy' ? i18n.global.locale : i18n.global.locale.value
      }
      locale = baseLocale
    }
    return message[locale]
  }
}

/**
 * 根据默认语言创建本地翻译函数，用于处理动态国际化文本
 *
 * @deprecated 推荐使用 `createTranslator` 代替
 *
 * @example
 * ```ts
 * // locale.ts
 * export const localeText = createLocaleText(() => i18n.value.locale.value)
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
export const createLocaleText = createTranslator
