import type { WithChildren } from '@rhao/types-base'

/**
 * 页面授权的角色列表，`*` 代表可以任意访问
 */
export type RoleList = '*' | string[]

/**
 * 页面基础元数据
 */
export interface PageMetadata {
  /**
   * Page ID
   */
  id: string | number
  /**
   * Page Parent ID
   */
  parentId?: string | number
  /**
   * `route.path`
   */
  path: string
  /**
   * `route.name`
   */
  name: string
  /**
   * `route.query`，调用 `handleMenuClick` 时传递
   */
  routeQuery?: string | Record<string, any>
  /**
   * `route.params`，调用 `handleMenuClick` 时传递
   */
  routeParams?: string | Record<string, any>
  /**
   * 重定向页面 `name`
   */
  redirect?: string
  /**
   * 组件文件地址，使用 `resolveComponent` 处理后获取真实组件
   */
  file?: string
  /**
   * 是否外链地址，在调用 `handleMenuClick` 时将打开客户端新标签页并跳转至指定页面
   * - true: 跳转至当前路由地址
   * - `/` 开头: 跳转至指定路由页
   * - 非 `/` 开头: 跳转至指定网页
   */
  link?: string | boolean
  /**
   * 当前页面不挂载在菜单时，需要高亮的菜单项，推荐使用 `route.name`
   */
  activeMenu?: string
  /**
   * 标题，支持多语言格式，推荐配合 `localeText` 使用
   * @example
   * ```ts
   * // page.ts
   * {
   *   // ...
   *   title: '页面1' // 普通文本格式
   *   // title: { en: 'Page1', 'zh-cn': '页面1' } // 多语言格式
   * }
   *
   * // menu.ts
   * // 根据 i18n.global.locale 获取当前语言标题
   * console.log(localeText(page.title)) // '页面1'
   *
   * // 获取指定语言标题
   * console.log(localeText(page.title, 'en')) // 'Page1'
   * ``
   */
  title: string | Record<string, string>
  /**
   * 图标
   */
  icon?: string
  /**
   * 排序索引
   */
  index?: number
  /**
   * 授权的角色列表，'*' 代表可以任意访问
   * @default []
   */
  roleList?: RoleList
  /**
   * 是否为菜单页
   */
  isMenu?: boolean

  /**
   * PC - 是否为全屏页面
   */
  isFull?: boolean
  /**
   * PC - 是否固定在标签栏中（常用于首页），不会被清除
   */
  isAffix?: boolean
  /**
   * PC - 在标签栏中保持唯一标签
   */
  isUniqInTabs?: boolean
  /**
   * PC - 是否支持缓存，切换页面时将保留页面数据
   */
  isKeepAlive?: boolean
}

/**
 * 支持 children 的页面元数据
 */
export type PageMetadataWithChildren = WithChildren<PageMetadata, 'children', false>
