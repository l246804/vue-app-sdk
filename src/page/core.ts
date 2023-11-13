import type { Fn, Recordable } from '@rhao/types-base'
import type { RouteLocationNormalizedLoaded, RouteRecordRaw } from 'vue-router'
import { bigCamelCase, forEachTree, toArrayTree, toTreeArray } from '@rhao/lodash-x'
import { cloneDeep, isFunction, isObject, isObjectLike } from 'lodash-unified'
import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'
import type { KeepAliveOptions } from '../keepAlive'
import type { AppSDK } from '../sdk'
import { createSDKRef } from '../utils'
import type {
  AppMode,
  BaseMetadata,
  Metadata,
  MetadataWithChildren,
  Page,
  PageOptions,
  RoleListType,
} from './types'

/**
 * 统一化 `page.path`
 */
export function normalizePath(child: string, parent = '/') {
  return child
    ? `${child.startsWith('/') ? '' : parent.replace(/\/+$/, '')}/${child.replace(/^\/+/, '')}`
    : parent
}

const defaultTreeOptions = {
  key: 'id',
  parentKey: 'parentId',
  childrenKey: 'children',
}

/**
 * 创建页面管理器，部分功能注册到 AppSDK 才能正常工作
 */
export function createPage<O extends PageOptions, M extends AppMode = O['mode']>(options: O) {
  type InternalMetadata = Metadata<M>
  type InternalMetadataWithChildren = MetadataWithChildren<M>

  const {
    mode,
    keepAliveMode,
    strict = true,
    strictRole = true,
    linkSingleWindow = false,
    syncName: defaultSyncName = true,
    convertPathToAbsolute: defaultConvertPathToAbsolute = true,
    resolveComponent,
  } = options

  const { setSDK, resolveSDK } = createSDKRef('Page')

  /**
   * 重置路由器页面列表
   *
   * @example
   * ```ts
   * page.resetRouter([{ name: 'page1', // ... }])
   * ```
   */
  function resetRouter(pages: InternalMetadata[]) {
    const router = resolveSDK().router
    if (!router) return
    pages.forEach((page) => {
      router.hasRoute(page.name) && router.removeRoute(page.name)
    })
  }

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
   *         path: 'child-path',
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
  function toFlattenPages(
    pages: InternalMetadataWithChildren[],
    options: { convertPathToAbsolute?: boolean; childrenKey?: string; clone?: boolean } = {},
  ) {
    const {
      convertPathToAbsolute = defaultConvertPathToAbsolute,
      childrenKey = defaultTreeOptions.childrenKey,
      clone = false,
    } = options

    if (clone) pages = cloneDeep(pages)

    if (convertPathToAbsolute) {
      forEachTree(
        pages,
        (page, _, __, ___, links) => {
          if (page.children?.length) return
          links.forEach((item, index) => {
            item.path = normalizePath(item.path, index === 0 ? '' : links[index - 1].path)
          })
        },
        defaultTreeOptions,
      )
    }

    return toTreeArray(pages, {
      childrenKey,
      dropKeys: [childrenKey],
      dataKey: '',
    })
  }

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
  function toTreePages(
    pages: InternalMetadata[],
    options: { convertPathToAbsolute?: boolean; clone?: boolean } = {},
  ) {
    const { convertPathToAbsolute = defaultConvertPathToAbsolute, clone = false } = options

    if (clone) pages = cloneDeep(pages)

    const tree = toArrayTree(pages, {
      orderBy: ['index', 'asc'],
      strict,
      ...defaultTreeOptions,
    }) as InternalMetadataWithChildren[]

    if (convertPathToAbsolute) {
      forEachTree(
        tree,
        (page, _, __, ___, links) => {
          if (page.children?.length) return
          links.forEach((item, index) => {
            item.path = normalizePath(item.path, index === 0 ? '' : links[index - 1].path)
          })
        },
        defaultTreeOptions,
      )
    }

    return tree
  }

  /**
   * 父子关联页面元数据列表转为树形菜单列表，将返回深克隆数据，与原 `pages` 不共用内存引用
   */
  function toMenus(pages: InternalMetadata[]) {
    return toTreePages(
      pages.filter((page) => page.isMenu),
      { clone: true },
    )
  }

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
  function filterAuthPages(pages: InternalMetadata[], roleList: RoleListType) {
    if (roleList === '*') return pages
    if (strictRole && roleList.length === 0) return []

    const roleListSet = new Set(roleList)
    return pages.filter((page) => {
      if (strictRole && !page.roleList?.length) return false
      return page.roleList === '*' || page.roleList!.some((role) => roleListSet.has(role))
    })
  }

  /**
   * 页面元数据转为路由
   */
  function pageToRoute(
    page: InternalMetadata,
    extraProps: Omit<RouteRecordRaw, 'path' | 'name' | 'redirect' | 'component' | 'meta'> = {},
    syncName = defaultSyncName,
  ) {
    let component = page.file ? resolveComponent(page.file) : (undefined as any)
    const sync = (data) => {
      if (!data || !isObject(data)) return data
      if ('then' in data) {
        return (data as any).then(sync)
      }
      else if (isObjectLike(data)) {
        const def: any = 'default' in data ? data.default : data
        def.name = bigCamelCase(page.name)
        return data
      }
      return data
    }
    if (component && syncName) {
      if (isFunction(component)) {
        const fn = component
        component = (...args) => sync(fn(...args))
      }
      else {
        component = sync(component)
      }
    }

    return {
      ...extraProps,
      path: page.path,
      name: page.name,
      redirect: page.redirect ? { name: page.redirect } : undefined,
      component,
      meta: page,
    } as RouteRecordRaw
  }

  /**
   * 根据元数据列表创建不同场景的状态
   */
  function createStates(
    pages: MaybeRefOrGetter<(InternalMetadata | InternalMetadataWithChildren)[]>,
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
  ) {
    const {
      format = 'list',
      convertPathToAbsolute = defaultConvertPathToAbsolute,
      childrenKey = defaultTreeOptions.childrenKey,
      roleList = [],
      resolveActiveMenu = (route) => route.meta.activeMenu || route.meta.name || '',
    } = options

    const { router } = resolveSDK()

    /**
     * 扁平化的元数据列表
     */
    const flattenPages = computed(() => {
      const _pages = toValue(pages)
      if (format === 'list') return _pages
      return toFlattenPages(_pages, { convertPathToAbsolute, childrenKey })
    })

    /**
     * 过滤权限后的扁平化的元数据列表
     */
    const authPages = computed(() => {
      return filterAuthPages(toValue(flattenPages), toValue(roleList))
    })

    /**
     * 过滤权限后的元数据映射
     */
    const authPageMap = computed(() => {
      return authPages.value.reduce(
        (map, item) => {
          map[item.id] = item
          return map
        },
        {} as Recordable<InternalMetadata | undefined>,
      )
    })

    /**
     * 过滤权限后的树形元数据列表
     */
    const treeAuthPages = computed(() => {
      return toTreePages(authPages.value, { convertPathToAbsolute, clone: true })
    })

    /**
     * 过滤权限后的树形元数据链路映射
     * @example
     * ```ts
     * const breadcrumbList = computed(() => treeLinkMap.value[route.meta.id] || [])
     * ```
     */
    const treeLinkMap = computed(() => {
      const map: Recordable<InternalMetadataWithChildren[]> = {}
      forEachTree(
        treeAuthPages.value,
        (page, _, __, ___, links) => {
          map[page.id] = links
        },
        defaultTreeOptions,
      )
      return map
    })

    /**
     * 过滤权限后的树形菜单
     */
    const menus = computed(() => toMenus(authPages.value))

    /**
     * 当前激活的菜单
     */
    const activeMenu = computed(() => {
      const route = router.currentRoute.value
      return resolveActiveMenu(route)
    })

    return {
      flattenPages,
      authPages,
      authPageMap,
      treeAuthPages,
      treeLinkMap,
      menus,
      activeMenu,
    }
  }

  /**
   * 处理菜单点击
   * - `item.link`: `item.redirect || item.file ? router.push : window.open(item.link, '_blank')`
   * - `pc`: `router.push`
   * - `mobile`: `router.replace` and `sdk.animation?.disable`
   */
  function handleMenuClick(item: InternalMetadataWithChildren, singleWindow = linkSingleWindow) {
    if (item.link && !item.redirect && !item.file) {
      const hasExternalWindow = !!handleMenuClick.externalWindow
      const win = singleWindow ? handleMenuClick.externalWindow || window : window

      if (singleWindow && hasExternalWindow) win.location.replace(item.link)
      else handleMenuClick.externalWindow = win.open(item.link, '_blank')

      return handleMenuClick.externalWindow
    }

    if (!item.file && !item.redirect) {
      return console.warn(
        '[VueAppSDK Page] - menuItem of handleMenuClick() is missing required parameters.',
        item,
      )
    }

    const sdk = resolveSDK()
    if (mode === 'mobile') {
      sdk.animation?.disable()
      return sdk.router.replace({ name: item.name })
    }
    return sdk.router.push({ name: item.name })
  }
  handleMenuClick.externalWindow = null as Window | null

  /**
   * AppSDK - KeepAlive 配置项
   */
  const keepAliveOptions: KeepAliveOptions = {
    autoCollectAndClean: mode === 'mobile' || keepAliveMode === 'auto',
    beforeRouteAdd: (route) => {
      return mode === 'mobile' || !!route.meta.isKeepAlive
    },
  }

  const page: Page<M> = {
    keepAliveOptions,

    resetRouter,
    toFlattenPages,
    toTreePages,
    toMenus,
    filterAuthPages,
    pageToRoute,
    createStates,
    handleMenuClick,
    install: (sdk: AppSDK) => {
      setSDK(sdk)
    },
  }

  return page
}

declare module 'vue-router' {
  interface RouteMeta extends BaseMetadata {}
}
