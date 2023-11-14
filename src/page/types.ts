/* eslint-disable @typescript-eslint/ban-types */
import type { Awaitable, Fn, PromiseFn, Recordable } from '@rhao/types-base'
import type { RouteComponent, RouteLocationNormalizedLoaded, RouteRecordRaw } from 'vue-router'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { I18n } from 'vue-i18n'
import type { AppSDKPluginObject } from '../sdk'
import type { KeepAliveOptions } from '../keepAlive'

/**
 * ID 类型
 */
type IdType = string | number

/**
 * 应用模式，不同应用模式会有细微差异
 * - `pc`: 电脑端应用
 * - `mobile`: 移动端应用
 */
export type AppMode = 'pc' | 'mobile'

/**
 * 角色权限列表类型
 * - `*`: 任意角色权限
 * - `string[]`: 对应角色权限列表
 */
export type RoleListType = '*' | string[]

/**
 * 页面缓存模式
 * - `auto`: 自动识别前进后退进行缓存和删除，开启后 `isKeepAlive` 属性将无效
 * - `manual`: 手动设置页面是否需要缓存，将依赖于 `isKeepAlive` 属性
 *
 * ***注意：`mobile` 模式固定为 `auto`！***
 */
export type KeepAliveMode = 'auto' | 'manual'

/**
 * 基础页面元数据
 */
export interface BaseMetadata {
  /**
   * id
   */
  id: IdType & {}
  /**
   * parentId
   *
   * @description 确立路由父子关系
   */
  parentId?: IdType & {}
  /**
   * route.path
   */
  path: string
  /**
   * route.name
   */
  name: string
  /**
   * 重定页面 name
   */
  redirect?: string
  /**
   * 组件文件地址，使用 `resolveComponent` 处理后获取真实组件
   * @example
   * ```ts
   * // page.ts
   * const page = createPage({
   *   resolveComponent: (file) => import(`src/pages/${file}.vue`)
   * })
   *
   * // usage
   * {
   *   file: 'home/index' // () => import('src/pages/home/index.vue')
   * }
   * ```
   */
  file?: string
  /**
   * 标题，支持多语言格式，配合 `localeText` 使用更佳
   *
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
  title: string | Recordable<string>
  /**
   * 图标
   */
  icon?: string
  /**
   * 排序索引
   */
  index?: number
  /**
   * 外链地址，若存在时将跳转至目标地址页面
   */
  link?: string
  /**
   * 对应的角色可以访问
   */
  roleList?: RoleListType
  /**
   * 是否为菜单页
   */
  isMenu?: boolean
  /**
   * 菜单额外属性
   */
  menuProps?: MenuProps
  /**
   * 当前页面不挂载在菜单上时，需要高亮的菜单数据，推荐使用 `name`
   */
  activeMenu?: string
  /**
   * 是否为全屏页面
   */
  isFull?: boolean
}

/**
 * PC 页面元数据
 */
export interface PCMetadata extends BaseMetadata {
  /**
   * 是否固定在标签页中（常用于首页），不会被清除
   */
  isAffix?: boolean
  /**
   * 是否支持缓存，切换页面时将保留页面数据
   */
  isKeepAlive?: boolean
}

/**
 * Mobile 页面元数据
 */
export interface MobileMetadata extends BaseMetadata {}

/**
 * 页面元数据
 */
export type Metadata<M extends AppMode> = [M] extends ['mobile'] ? MobileMetadata : PCMetadata

/**
 * 支持 children 的页面元数据
 */
export type MetadataWithChildren<M extends AppMode> = Metadata<M> & {
  /**
   * 子级页面列表
   */
  children?: MetadataWithChildren<M>[]
}

/**
 * Menu props
 *
 * @example
 * ```ts
 * // page.d.ts
 * declare module 'vue-app-sdk/page' {
 *   interface MenuProps {
 *     // props in here...
 *     badge?: boolean
 *   }
 * }
 *
 * export {}
 *
 * ```
 */
export interface MenuProps {}

export interface PageOptions {
  /**
   * 应用模式
   */
  mode: AppMode
  /**
   * 页面保活模式
   * @default
   * ```ts
   * // mode: pc
   * 'manual'
   *
   * // mode: mobile
   * 'auto'
   * ```
   */
  keepAliveMode?: KeepAliveMode
  /**
   * 严格模式，开启后扁平化列表转为树形列表时将剔除无效子页面元数据，且删除末级 `children` 属性
   * @default true
   */
  strict?: boolean
  /**
   * 严格角色权限模式，开启后页面元数据未配置 `roleList` 时将认为不具备访问权限
   * @default true
   */
  strictRole?: boolean
  /**
   * `pageToRoute` 时是否同步 `route.name` 到 `component.name`，由于 `route.name` 的唯一性，可以避免 `component.name` 重名
   *
   * ***注意：`route.name` 中的非字母字符将被移除，即 `home.page` 与 `home-page` 都会被处理为 `HomePage`！***
   *
   * @default true
   */
  syncName?: boolean
  /**
   * `toFlattenPages` 和 `toTreePages` 转换 `page.path` 为绝对路径
   * - 根基路径未以 `/` 开头时拼接 `/`
   * - 子级路径未以 `/` 开头时拼接父级路径
   * @default true
   */
  convertPathToAbsolute?: boolean
  /**
   * 跳转外链时是否仅在单一外部窗口跳转
   * @default false
   */
  linkSingleWindow?: boolean
  /**
   * 根据 `page.file` 获取组件
   * @example
   * ```ts
   * const page = createPage({ resolveComponent: (file) => import(`src/${file}.vue`) })
   *
   * const route = page.pageToRoute({ file: 'home/index' })
   * route.component // () => import('src/home/index.vue')
   * ```
   */
  resolveComponent: Fn<[file: string], Awaitable<RouteComponent> | PromiseFn<[], RouteComponent>>
}

export interface Page<M extends AppMode> extends AppSDKPluginObject {
  /**
   * AppSDK - KeepAlive 配置项
   */
  keepAliveOptions: KeepAliveOptions
  /**
   * 重置路由器页面列表
   *
   * @example
   * ```ts
   * page.resetRouter([{ name: 'page1', // ... }])
   * ```
   */
  resetRouter: Fn<[pages: Metadata<M>[]]>
  /**
   * 树形元数据列表扁平化为父子关联元数据列表
   *
   * @example
   * ```ts
   * const pages = toFlattenPages([
   *   {
   *     id: 'parent1',
   *     path: '/parent-path',
   *     // ...
   *     children: [
   *       {
   *         id: 'child1',
   *         parentId: 'parent1',
   *         path: 'child-path'
   *         // ...
   *       }
   *     ]
   *   }
   * ], { childrenKey: 'children', convertPathToAbsolute: true })
   *
   * // pages
   * [
   *   { id: 'parent1', path: '/parent-path', // ... },
   *   { id: 'child1', parentId: 'parent1', path: '/parent-path/child-path', // ... }
   * ]
   * ```
   */
  toFlattenPages: Fn<
    [
      pages: Metadata<M>[],
      options?: {
        /** @default options.convertPathToAbsolute */ convertPathToAbsolute?: PageOptions['convertPathToAbsolute']
        /** @default 'children' */ childrenKey?: string
        /** 是否克隆源数据，转换时会改变原始数据，若导致响应式循环变更可设置为 `true` @default false */ clone?: boolean
      },
    ],
    Metadata<M>[]
  >
  /**
   * 父子关联页面元数据列表转为树形元数据列表
   *
   * @example
   * ```ts
   * const pages = toTreePages([
   *   { id: 'parent1', path: '/parent-path', // ... },
   *   { id: 'child1', parentId: 'parent1', path: 'child-path', // ... }
   * ], { convertPathToAbsolute: true })
   *
   * // pages
   * [
   *   {
   *     id: 'parent1',
   *     path: '/parent-path',
   *     // ...
   *     children: [
   *       {
   *         id: 'child1',
   *         parentId: 'parent1',
   *         path: '/parent-path/child-path',
   *         // ...
   *       }
   *     ]
   *   }
   * ]
   * ```
   */
  toTreePages: Fn<
    [
      pages: Metadata<M>[],
      options?: {
        /** @default options.convertPathToAbsolute */ convertPathToAbsolute?: PageOptions['convertPathToAbsolute']
        /** 是否克隆源数据，转换时会改变原始数据，若导致响应式循环变更可设置为 `true` @default false */ clone?: boolean
      },
    ],
    MetadataWithChildren<M>[]
  >
  /**
   * 父子关联页面元数据列表转为树形菜单列表，将返回深克隆数据，与原 `pages` 不共用内存引用
   */
  toMenus: Fn<[pages: Metadata<M>[]], MetadataWithChildren<M>[]>
  /**
   * 过滤权限页面元数据列表
   *
   * @example
   * ```ts
   * filterAuthPages(
   *   [
   *     { name: 'page1', roleList: '*', // ... },
   *     { name: 'page2', roleList: ['admin'] },
   *     { name: 'page3' },
   *   ],
   *   roleList
   * )
   *
   * // roleList: '*'
   * [
   *   { name: 'page1', roleList: '*', // ... },
   *   { name: 'page2', roleList: ['admin'], // ... },
   *   { name: 'page3', // ... },
   * ]
   *
   * // roleList: 'user'
   * [
   *   { name: 'page1', roleList: '*', // ... },
   *   // { name: 'page3', // ... }, // 非严格模式时
   * ]
   *
   * // roleList: 'admin'
   * [
   *   { name: 'page1', roleList: '*', // ... },
   *   { name: 'page2', roleList: ['admin'], // ... },
   *   // { name: 'page3', // ... }, // 非严格模式时
   * ]
   * ```
   */
  filterAuthPages: Fn<[pages: Metadata<M>[], roleList: RoleListType], Metadata<M>[]>
  /**
   * 页面元数据转为路由
   */
  pageToRoute: Fn<
    [
      page: Metadata<M>,
      extraProps?: Omit<RouteRecordRaw, 'path' | 'name' | 'redirect' | 'component' | 'meta'>,
      /** @default options.syncName */
      syncName?: boolean,
    ],
    RouteRecordRaw
  >
  /**
   * 根据元数据列表创建不同场景的状态
   */
  createStates: Fn<
    [
      pages: MaybeRefOrGetter<Metadata<M>[]>,
      options: {
        /**
         * `pages` 格式
         */
        format: 'list' | 'tree'
        /**
         * 用来扁平化格式为 `tree` 的 `pages`
         * @default 'children'
         */
        childrenKey?: string
        /**
         * 转换 `page.path` 为绝对路径
         * @default options.convertPathToAbsolute
         */
        convertPathToAbsolute?: boolean
        /**
         * 角色权限列表，用来生成 `authPages`
         */
        roleList: MaybeRefOrGetter<RoleListType>
        /**
         * 根据当前路由获取激活菜单标识
         * @default
         * ```ts
         * (route) => route.meta.activeMenu || route.meta.name || ''
         * ```
         */
        resolveActiveMenu?: Fn<[route: RouteLocationNormalizedLoaded], unknown>
      },
    ],
    {
      /**
       * 扁平化的元数据列表
       */
      flattenPages: ComputedRef<Metadata<M>[]>
      /**
       * 过滤权限后的扁平化的元数据列表
       */
      authPages: ComputedRef<Metadata<M>[]>
      /**
       * 过滤权限后的元数据列表映射
       */
      authPageMap: ComputedRef<Recordable<Metadata<M> | undefined>>
      /**
       * 过滤权限后的树形元数据列表
       */
      treeAuthPages: ComputedRef<MetadataWithChildren<M>[]>
      /**
       * 过滤权限后的树形元数据链路映射
       * @example
       * ```ts
       * const breadcrumbList = computed(() => treeLinkMap.value[route.meta.id] || [])
       * ```
       */
      treeLinkMap: ComputedRef<Recordable<MetadataWithChildren<M>[] | undefined>>
      /**
       * 过滤权限后的树形菜单
       */
      menus: ComputedRef<MetadataWithChildren<M>[]>
      /**
       * 当前激活的菜单
       */
      activeMenu: ComputedRef<any>
    }
  >
  /**
   * 处理菜单点击
   * - `item.link`: `item.redirect ? router.push : window.open(item.link)`
   * - `pc`: `router.push`
   * - `mobile`: `router.replace` and `sdk.animation?.disable`
   */
  handleMenuClick: Fn<[item: Metadata<M>, singleWindow?: boolean]> & {
    externalWindow: Window | null
  }
}

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
