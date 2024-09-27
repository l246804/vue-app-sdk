import type { AnyFn, Awaitable, MaybeFn, NoopFn, WithChildren } from '@rhao/types-base'
import type { ToTreeArrayOptions } from 'nice-fns'
import type { AppSDKInternalInstance, Plugin, PluginID } from 'vue-app-sdk'
import type {
  RouteComponent,
  RouteLocationNormalizedLoaded,
  RouteMeta,
  RouteRecordNormalized,
  RouteRecordRaw,
} from 'vue-router'
import type { PageMetadata, PageMetadataWithChildren, RoleList } from './interface'
import { assign, syncComponentName } from '@/utils'
import {
  arrayToMap,
  castFunction,
  cloneDeep,
  eachTree,
  findTree,
  isFunction,
  isString,
  mapTree,
  memoize,
  parseJSON,
  toArrayTree,
  toTreeArray,
} from 'nice-fns'
import { computed, isRef, type MaybeRefOrGetter, shallowRef, toValue, watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { ANIMATION_ID } from '../Animation'

export interface PageOptions {
  /**
   * 是否为移动端应用，设为 `true` 时在调用 `handleMenuClick` 时将禁用动画插件（若存在）的导航动画并使用 `router.replace` 跳转
   */
  isMobile?: MaybeRefOrGetter<boolean>
  /**
   * 跳转外链时若存在已打开的外链窗口是否重复使用进行跳转
   * @default false
   */
  linkSingleWindow?: boolean
  /**
   * 调用 `handleMenuClick` 时是否允许跳转外链，返回假值时走正常页面跳转
   * @default (menu) => menu.link
   */
  allowLink?: (menu: PageMetadata) => boolean
  /**
   * 根据 `page.file` 获取真实组件
   * @example
   * ```ts
   * const page = createPage({ resolveComponent: (file) => () => import(`src/${file}.vue`) })
   *
   * const route = page.pageToRoute({ file: 'home/index' })
   * route.component // () => import('src/home/index.vue')
   */
  resolveComponent: (file: string, page: PageMetadata) => MaybeFn<Awaitable<RouteComponent>, []>
  /**
   * 校准不符合 `PageMetadata` 的元数据
   * @param data 不符合的元数据
   * @returns 符合的元数据
   *
   * @example
   * ```ts
   * // ❌ 不符合 PageMetadata 的元数据
   * { id: 1, routeName: 'home', routePath: '/home', sort: 0, ... }
   *
   * // 校准后 ↓
   *
   * // ✔️ 符合 PageMetadata 的元数据
   * { id: 1, name: 'home', path: '/home', index: 0, ... }
   * ```
   */
  calibrateMetadata?: (data: any) => PageMetadata
}

/**
 * Page Plugin ID
 */
export const PAGE_ID: PluginID<Page> = Symbol('page')

const RESET_FLAG = Symbol('reset flag')

const defaultCalibrateMetadata = (data: any) => data as PageMetadata

const defaultAllowLink = (menu: PageMetadata) => !!menu.link

const defaultTreeOptions = {
  key: 'id',
  parentKey: 'parentId',
  childrenKey: 'children',
} as const

/**
 * 应用页面管理插件
 */
export class Page implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: PageOptions,
  ) {}

  id = PAGE_ID

  /**
   * AppSDK 实例
   */
  private _sdk!: AppSDKInternalInstance

  /**
   * 移除路由函数列表
   */
  private _removeRouteFns: NoopFn[] = []

  /**
   * 已打开的窗口实例
   */
  private openedWindow: Window | null = null

  /**
   * 校准页面元数据
   * @readonly
   */
  get calibrateMetadata() {
    return this.options.calibrateMetadata || defaultCalibrateMetadata
  }

  /**
   * 是否允许跳转外链
   * @readonly
   */
  get allowLink() {
    return this.options.allowLink || defaultAllowLink
  }

  /**
   * 重置路由列表为初始创建路由器时传入的列表
   */
  resetRoutes = () => {
    this._removeRouteFns.splice(0).forEach((fn) => fn(RESET_FLAG))
  }

  /**
   * 获取路由上的页面元数据（浅拷贝）
   * @param data `route` 或 `route.meta`
   */
  getPageMetadata = (
    data: Pick<RouteRecordNormalized, 'meta'> | RouteMeta,
  ): Partial<PageMetadata> => {
    const meta = data.meta || data || {}
    return assign({}, (meta as RouteMeta)._metadata)
  }

  /**
   * 将树形元数据列表扁平化为符合 `PageMetadata` 的页面元数据列表
   * @param data 树形元数据列表
   * @param options 配置项
   * @returns 扁平化的页面元数据列表
   */
  toFlattenPages = <T extends {}, Calibrate extends boolean = false>(
    data: T[],
    options: Pick<ToTreeArrayOptions, 'childrenKey'> & {
      /**
       * 是否克隆源数据，避免转换时影响到源数据
       * @default false
       */
      clone?: boolean
      /**
       * 是否校准元数据，数据格式不符合 `PageMetadata` 时可以设为 `true`
       * @default false
       */
      calibrate?: Calibrate
      /**
       * 是否补全路径，设为 `true` 后会对 `path` 进行拼接补全，可以在 `addRoute()` 时不受父子级限制
       * @default false
       */
      completePath?: boolean
    } = {},
  ) => {
    const { childrenKey = defaultTreeOptions.childrenKey, clone, calibrate, completePath } = options

    // 克隆源数据
    if (clone)
      data = cloneDeep(data)

    let result: any[] = toTreeArray(data, { childrenKey, dropKeys: [childrenKey] })

    // 校准元数据
    if (calibrate)
      result = result.map(this.calibrateMetadata)

    // 补全路径
    if (completePath) {
      this.toTreePages(result, {
        strict: false,
        clone: false,
        calibrate: false,
        completePath: true,
      })
      result.forEach((item) => {
        delete item.children
      })
    }

    return result as Calibrate extends true ? PageMetadata[] : T[]
  }

  /**
   * 将元数据列表转为符合 `PageMetaWithChildren` 的树形页面元数据列表
   * @param data 元数据列表
   * @param options 配置项
   * @param options.strict 严格模式，开启后将移除父子关联不存在的数据
   * @param options.clone 是否克隆源数据，避免转换时影响到源数据
   * @param options.calibrate 是否校准元数据，数据格式不符合 `PageMetadata` 时可以设为 `true`
   * @param options.completePath 是否补全路径，设为 `true` 后会对 `path` 进行拼接补全，可以在 `addRoute()` 时不受父子级限制
   * @returns 树形页面元数据列表
   */
  toTreePages = <T extends {}, Calibrate extends boolean = false>(
    data: T[],
    options: {
      /**
       * 严格模式，开启后将移除父子关联不存在的数据
       */
      strict?: boolean
      /**
       * 是否克隆源数据，避免转换时影响到源数据
       * @default false
       */
      clone?: boolean
      /**
       * 是否校准元数据，数据格式不符合 `PageMetadata` 时可以设为 `true`
       * @default false
       */
      calibrate?: Calibrate
      /**
       * 是否补全路径，设为 `true` 后会对 `path` 进行拼接补全，可以在 `addRoute()` 时不受父子级限制
       * @default false
       */
      completePath?: boolean
    } = {},
  ) => {
    const { strict = false, clone, calibrate, completePath } = options
    let pages = data as unknown as PageMetadata[]

    // 克隆源数据
    if (clone)
      pages = cloneDeep(pages)

    // 校准元数据
    if (calibrate)
      pages = pages.map(this.calibrateMetadata)

    // 转为树形数据
    const result = toArrayTree(pages, {
      strict,
      orderBy: ['index', 'asc'],
      removeEmptyChildrenKey: true,
      ...defaultTreeOptions,
    })

    // 补全路径
    if (completePath) {
      // 顶层路径必须以 `/` 开头
      result.forEach((item) => {
        if (!item.path.startsWith('/'))
          item.path = `/${item.path}`
      })

      const map = arrayToMap(pages, { primaryKey: 'id', useMap: false })

      // 通过路由器获取完整路由表
      const routes = createRouter({
        history: createWebHistory('/'),
        routes: mapTree(result, (item) => {
          return {
            name: item.name,
            path: item.path,
            children: item.children,
            meta: { _metadata: item },
          }
        }) as unknown as RouteRecordRaw[],
      }).getRoutes()

      routes.forEach((route) => {
        // 更改为完整路径
        map[this.getPageMetadata(route).id!].path = route.path
      })
    }

    return result as unknown as Calibrate extends true
      ? PageMetadataWithChildren[]
      : WithChildren<T, 'children', false>[]
  }

  /**
   * 父子关联页面元数据列表转为树形菜单列表，返回深克隆数据，与源数据不共用内存引用
   * @param pages 页面元数据列表
   * @param strict 严格模式
   * @returns 树形菜单元数据列表
   */
  toMenus = (pages: PageMetadata[], strict: boolean) => {
    return this.toTreePages(
      pages.filter((item) => item.isMenu),
      { strict, clone: true, calibrate: false, completePath: false },
    )
  }

  /**
   * 指定角色列表是否可以访问页面
   * @param page 页面元数据
   * @param roleList 角色列表
   * @param strict 严格模式
   * @returns 是否可以访问页面
   */
  canVisitPage = (page: PageMetadata, roleList: RoleList, strict: boolean) => {
    // 可以访问任何页面
    if (roleList === '*')
      return true

    const pageRoleList = page.roleList || []
    // 严格模式时没有角色列表认为没有授权
    if (strict && (roleList.length === 0 || pageRoleList.length === 0))
      return false

    // 指定角色列表可以访问页面
    return pageRoleList === '*' || pageRoleList.some((role) => roleList.includes(role))
  }

  /**
   * 过滤指定角色可以访问的页面元数据列表
   * @param pages 页面元数据列表
   * @param roleList 角色列表
   * @param strict 严格模式
   * @returns 可以访问的页面元数据列表
   */
  filterVisitPages = (pages: PageMetadata[], roleList: RoleList, strict: boolean) => {
    // 可以访问所有页面
    if (roleList === '*')
      return pages
    // 严格模式时若没有角色列表则返回空列表
    if (strict && roleList.length === 0)
      return []
    // 过滤可以访问的页面列表
    return pages.filter((item) => this.canVisitPage(item, roleList, strict))
  }

  /**
   * 创建不同场景下的页面元数据状态
   * @param pages 页面元数据列表
   * @param options 配置项
   */
  createStates = <T extends {}, ActiveMenu = string>(
    pages: MaybeRefOrGetter<T[]>,
    options: Pick<ToTreeArrayOptions, 'childrenKey'> & {
      /**
       * `pages` 格式
       */
      format: MaybeRefOrGetter<'list' | 'tree'>
      /**
       * 严格模式，开启后扁平化列表转为树形列表时将移除父子关联不存在的数据
       */
      strict?: MaybeRefOrGetter<boolean>
      /**
       * 角色列表，用于过滤页面
       * @default []
       */
      roleList?: MaybeRefOrGetter<RoleList>
      /**
       * 严格访问模式，开启时若指定角色列表或页面角色列表为空时则不能访问页面
       * @default true
       */
      strictVisit?: MaybeRefOrGetter<boolean>
      /**
       * 角色过滤页面时是否子级优先
       * - `true`: 子级存在权限时父级必定存在
       * - `false`: 父级无权限时子级必定不存在
       * @default true
       */
      childrenFirst?: MaybeRefOrGetter<boolean>
      /**
       * 是否补全路径，设为 `true` 后会对 `path` 进行拼接补全，可以在 `addRoute()` 时不受父子级限制
       * @default true
       */
      completePath?: MaybeRefOrGetter<boolean>
      /**
       * 根据当前路由获取激活菜单标识
       * @default
       * ```ts
       * (route) => this.getPageMetadata(route).activeMenu || this.getPageMetadata(route).name || ''
       * ```
       */
      resolveActiveMenu?: (
        route: RouteLocationNormalizedLoaded,
        states: {
          flattenPages: PageMetadata[]
          treePages: PageMetadataWithChildren[]
          visitablePages: PageMetadata[]
          visitableTreePages: PageMetadataWithChildren[]
          visitableMenus: PageMetadataWithChildren[]
          visitablePageMap: Record<PageMetadata['id'], PageMetadata>
          visitableTreeLinkMap: Record<PageMetadata['id'], PageMetadataWithChildren[]>
        },
      ) => ActiveMenu
    },
  ) => {
    const {
      format,
      childrenKey = defaultTreeOptions.childrenKey,
      strict = false,
      roleList = [],
      strictVisit = true,
      childrenFirst = true,
      completePath = true,
      resolveActiveMenu = (route) => {
        const metadata = this.getPageMetadata(route)
        return (metadata.activeMenu || metadata.name || '') as ActiveMenu
      },
    } = options

    // 创建缓存函数
    const memoizeResolver = () => memoizeResolver.id
    memoizeResolver.id = -1

    const memoizedFns: ReturnType<typeof memoize>[] = []
    const memoizeFn = <T extends AnyFn>(fn: T) => {
      const memoized = memoize(fn, memoizeResolver)
      memoizedFns.push(memoized)
      return memoized
    }

    // ==================扁平化页面元数据列表==================
    const getFlattenPages = memoizeFn(() => {
      // 处理树形格式
      if (toValue(format) === 'tree') {
        return this.toFlattenPages(toValue(pages), {
          childrenKey,
          clone: true,
          calibrate: true,
          completePath: toValue(completePath),
        })
      }

      const data = cloneDeep(toValue(pages)).map(this.calibrateMetadata)

      // 补全路径
      if (toValue(completePath)) {
        this.toTreePages(data, {
          strict: false,
          clone: false,
          calibrate: false,
          completePath: true,
        })
        data.forEach((item) => {
          delete (item as PageMetadataWithChildren).children
        })
      }

      return data
    })

    // ==================树形页面元数据列表==================
    const getTreePages = memoizeFn(() => {
      return this.toTreePages(getFlattenPages(), {
        strict: toValue(strict),
        clone: true,
        calibrate: false,
        completePath: false,
      })
    })

    // ==================可访问的树形页面元数据列表==================
    const getVisitableTreePages = memoizeFn(() => {
      // 父级优先
      if (!toValue(childrenFirst)) {
        const visitablePages = this.filterVisitPages(
          getFlattenPages(),
          toValue(roleList),
          toValue(strictVisit),
        )
        return this.toTreePages(visitablePages, {
          strict: toValue(strict),
          clone: true,
          calibrate: false,
          completePath: false,
        })
      }

      // 子级优先
      const tree = cloneDeep(getTreePages())

      // 可访问状态缓存，避免子级优先多次递归同一数据时重复计算
      const visitCache = new Map<PageMetadata['id'], boolean>()
      const canVisit = (item: PageMetadata) => {
        const { id } = item

        // 存在缓存值时直接返回
        const cacheValue = visitCache.get(id)
        if (cacheValue != null)
          return cacheValue

        // 获取验证结果并缓存
        const valid = this.canVisitPage(item, toValue(roleList), toValue(strictVisit))
        visitCache.set(id, valid)
        return valid
      }

      const filterCallback = (item: PageMetadataWithChildren) => {
        const children = item.children || []

        // 没有子级时判断自身
        if (children.length === 0)
          return canVisit(item)

        // 查找是否存在可访问的子级数据
        const find = findTree(children, canVisit)
        return !!find
      }

      return mapTree(tree.filter(filterCallback), (item) => {
        if (item.children) {
          // 过滤子级列表
          item.children = item.children.filter(filterCallback)
          // 严格模式子级为空时删除子级属性
          if (item.children.length === 0 && toValue(strict))
            delete item.children
        }
        return item
      })
    })

    // ==================可访问的页面元数据列表==================
    const getVisitablePages = memoizeFn(() => {
      return this.toFlattenPages(getVisitableTreePages(), {
        childrenKey: defaultTreeOptions.childrenKey,
        clone: true,
        calibrate: false,
        completePath: false,
      })
    })

    // ==================可访问的页面元数据映射==================
    const getVisitablePageMap = memoizeFn(() => {
      return arrayToMap(getVisitablePages(), { primaryKey: 'id', useMap: false })
    })

    // ==================可访问的树形页面元数据链路映射==================
    const getVisitableTreeLinkMap = memoizeFn(() => {
      const map: Record<PageMetadata['id'], PageMetadataWithChildren[]> = {}
      eachTree(
        getVisitableTreePages(),
        (item, _, __, ___, links) => {
          map[item.id] = links
        },
        { childrenKey: defaultTreeOptions.childrenKey },
      )
      return map
    })

    // ==================可访问的菜单页面元数据列表==================
    const getVisitableMenus = memoizeFn(() => this.toMenus(getVisitablePages(), toValue(strict)))

    // ==================页面元数据状态==================
    const flattenPages = shallowRef<PageMetadata[]>([])
    const treePages = shallowRef<PageMetadataWithChildren[]>([])
    const visitablePages = shallowRef<PageMetadata[]>([])
    const visitableTreePages = shallowRef<PageMetadataWithChildren[]>([])
    const visitableMenus = shallowRef<PageMetadataWithChildren[]>([])
    const visitablePageMap = shallowRef<Record<PageMetadata['id'], PageMetadata>>({})
    const visitableTreeLinkMap = shallowRef<Record<PageMetadata['id'], PageMetadataWithChildren[]>>(
      {},
    )

    // ==================激活的菜单页面标识==================
    const router = this._sdk.router
    const activeMenu = computed(() => {
      const route = router.currentRoute.value
      return resolveActiveMenu(route, {
        flattenPages: flattenPages.value,
        treePages: treePages.value,
        visitablePages: visitablePages.value,
        visitableTreePages: visitableTreePages.value,
        visitableMenus: visitableMenus.value,
        visitablePageMap: visitablePageMap.value,
        visitableTreeLinkMap: visitableTreeLinkMap.value,
      })
    })

    // 监听变更
    if (isRef(pages) || isFunction(pages))
      watch(pages, update, { immediate: true, flush: 'sync', deep: true })

    function update() {
      // 删除旧缓存
      memoizedFns.forEach((fn) => fn.cache.delete(memoizeResolver.id++))

      // 更新响应式数据
      flattenPages.value = getFlattenPages()
      treePages.value = getTreePages()
      visitablePages.value = getVisitablePages()
      visitableTreePages.value = getVisitableTreePages()
      visitableMenus.value = getVisitableMenus()
      visitablePageMap.value = getVisitablePageMap()
      visitableTreeLinkMap.value = getVisitableTreeLinkMap()
    }

    return {
      /**
       * 扁平化的页面元数据列表
       */
      flattenPages,
      /**
       * 树形页面元数据列表
       */
      treePages,
      /**
       * 可访问的树形页面元数据列表
       */
      visitableTreePages,
      /**
       * 可访问的页面元数据列表
       */
      visitablePages,
      /**
       * 可访问的页面元数据映射
       */
      visitablePageMap,
      /**
       * 可访问的树形页面元数据链路映射
       */
      visitableTreeLinkMap,
      /**
       * 可访问的菜单页面元数据列表
       */
      visitableMenus,
      /**
       * 激活的菜单页面标识
       */
      activeMenu,
    }
  }

  /**
   * 页面元数据转为路由配置
   * @param page 页面元数据
   * @param extraProps 路由额外参数
   * @param syncName 同步组件 `name` 为路由 `name`，可以更好的配合 `KeepAlive` 组件缓存
   * @returns 路由配置
   */
  pageToRoute = (
    page: PageMetadata,
    extraProps: Omit<RouteRecordRaw, 'path' | 'name' | 'redirect' | 'component'> = {},
    syncName: boolean | ((name: string, page: PageMetadata) => string) = true,
  ) => {
    // 获取真实组件
    let component = page.file ? this.options.resolveComponent(page.file, page) : undefined

    // 同步组件名称
    if (component && syncName) {
      component = syncComponentName(
        component,
        syncName === true ? page.name : castFunction(syncName)(page.name, page),
      )
    }

    return {
      ...extraProps,
      path: page.path,
      name: page.name,
      component,

      // 设置重定向
      redirect: page.redirect ? { name: page.redirect } : undefined,

      // 合并元数据
      meta: assign({}, extraProps.meta, { _metadata: page }),
    } as RouteRecordRaw
  }

  /**
   * 获取页面元数据设置的外链地址，设为假值时返回空字符串
   * @param page 页面元数据
   * @returns 外链地址
   */
  resolveLink = (page: PageMetadata) => {
    if (page.link === true) {
      const { router } = this._sdk
      const query: Record<string, any> = {}
      const params: Record<string, any> = {}

      // 处理路由参数
      if (page.routeQuery)
        assign(query, isString(page.routeQuery) ? parseJSON(page.routeQuery) : page.routeQuery)
      if (page.routeParams)
        assign(params, isString(page.routeParams) ? parseJSON(page.routeParams) : page.routeParams)

      return router.resolve({ name: page.name, query, params }).href
    }

    return page.link || ''
  }

  /**
   * 处理菜单点击，设置 `link` 时将会在客户端新标签页打开指定路由页或网站，
   * 在 `options.isMobile` 设为 `true` 时将禁用动画插件（若存在）的导航动画并使用 `router.replace` 跳转
   * @param menu 页面元数据
   * @param singleWindow 跳转外链时若存在已打开的外链窗口是否重复使用进行跳转
   */
  handleMenuClick = (menu: PageMetadata, singleWindow = this.options.linkSingleWindow) => {
    const { router, getPlugin } = this._sdk
    const query: Record<string, any> = {}
    const params: Record<string, any> = {}

    // 处理路由参数
    if (menu.routeQuery)
      assign(query, isString(menu.routeQuery) ? parseJSON(menu.routeQuery) : menu.routeQuery)
    if (menu.routeParams)
      assign(params, isString(menu.routeParams) ? parseJSON(menu.routeParams) : menu.routeParams)

    const to = { name: menu.name, query, params }

    // 处理外链
    if (this.allowLink(menu)) {
      const hasOpened = this.openedWindow && !this.openedWindow.closed
      const win = singleWindow && hasOpened ? this.openedWindow : window
      const url = this.resolveLink(menu)

      // singleWindow = true 时复用已打开的窗口
      if (singleWindow && this.openedWindow && !this.openedWindow.closed)
        this.openedWindow.location.replace(url)
      else this.openedWindow = win!.open(url, '_blank')

      return
    }

    // 处理重定向和组件
    if (menu.file || menu.redirect) {
      // 移动端禁用导航动画并使用 `router.replace` 替换
      if (toValue(this.options.isMobile)) {
        const animation = getPlugin(ANIMATION_ID)
        if (animation)
          animation.disable()
        router.replace(to)
      }
      else {
        router.push(to)
      }
    }
  }

  install(sdk: AppSDKInternalInstance) {
    this._sdk = sdk
    const { router } = sdk

    // =======================重写 addRoute=======================
    const { _removeRouteFns } = this
    const { addRoute } = router
    router.addRoute = function (...args) {
      // @ts-expect-error 逻辑无误
      const removeFn = addRoute.apply(this, args)
      function wrapRemoveFn(flag?) {
        // 由 resetRouter 调用时跳过移除操作
        if (flag !== RESET_FLAG) {
          const index = _removeRouteFns.indexOf(wrapRemoveFn)
          if (index > -1)
            _removeRouteFns.splice(index, 1)
        }
        return removeFn()
      }
      _removeRouteFns.push(wrapRemoveFn)
      return wrapRemoveFn
    }

    return () => {
      _removeRouteFns.length = 0
    }
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * 页面元数据
     */
    _metadata?: PageMetadata
  }
}
