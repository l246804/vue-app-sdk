import type { Ref } from 'vue'
import { computed, nextTick, watch } from 'vue'
import { assign, cloneDeep, isArray, isEqual, noop, once, pick } from 'lodash-unified'
import type {
  AwaitableFn,
  Fn,
  Getter,
  MaybeNullish,
  NoopFn,
  PromiseFn,
  Recordable,
} from '@rhao/types-base'
import { type RouteLocationNormalized, isNavigationFailure } from 'vue-router'
import { createSwitch } from 'nice-fns'
import { useToggle } from '@vueuse/core'
import type { Metadata } from '../page/types'
import type { AppSDKPluginObject } from '../sdk'
import {
  asyncGetComponentNameByRoute,
  createPersistentRef,
  createSDKRef,
  getComponentNameByRoute,
} from '../utils'
import type { StorageOptions } from '../types'

export type RawPage = Metadata<'pc'>

export type RouteLocationNormalizedLike = Pick<
  RouteLocationNormalized,
  'fullPath' | 'params' | 'query' | 'meta'
> & {
  matched?: RouteLocationNormalized['matched']
}

export type ResolvableIdType = MaybeNullish<string | number | TabPage | RouteLocationNormalizedLike>

export interface TabsOptions extends StorageOptions {
  /**
   * 是否在路由导航时自动收集标签页，设为 `true` 时将使用内置收集器进行收集
   * @default true
   */
  autoCollect?: boolean
  /**
   * 相同路由不同参数时处理标签页的模式
   * - `normal`: 正常模式，会生成相同路由不同参数的标签页
   * - `replace`: 替换模式，会先移除旧标签页再生成新标签页
   *
   * ***注意：由于 `KeepAlive` 组件是基于组件 `name` 进行保活，所以搭配使用时在移除标签页后会导致相同路由不同参数的标签页保活失效！***
   */
  mode: 'normal' | 'replace'
  /**
   * `KeepAlive` 插件模式（需自行安装 `KeepAlive` 插件）
   * - `normal`: 默认模式，由 `KeepAlive` 插件自行控制
   * - `takeover`: 接管模式，由 `Tabs` 插件处理路由组件缓存，将禁用 `KeepAlive` 自动收集和清理模式
   * @default 'takeover'
   */
  keepAliveMode?: 'normal' | 'takeover'
  /**
   * 处理激活标签页为空的情况
   * @example
   * ```ts
   * const Tabs = createTabs({
   *   // ...
   *   processActiveOnEmpty: () => {
   *     router.push('/home')
   *   }
   * })
   * ```
   */
  processActiveOnEmpty?: AwaitableFn<[]>
  /**
   * `mode` 设为 `replace` 时，替换标签页前的回调处理，若返回假值则取消替换改为打开已存在的标签页
   */
  beforeReplace?: AwaitableFn<[newTabPage: TabPage, oldTabPage: TabPage], boolean>
  /**
   * 移除标签页前的回调处理，若返回假值则取消移除
   */
  beforeRemove?: AwaitableFn<[tabPage: TabPage], boolean>
  /**
   * 数据对比器，用于判断是否为同一标签页
   * @default `lodash.isEqual`
   */
  dataComparer?: Fn<
    [newData: TabPage['comparisonData'], oldData: TabPage['comparisonData']],
    boolean
  >
  /**
   * 标签页 ID 生成器，相同路由相同参数应生成唯一 ID
   * @default
   * ```ts
   * const defaultGenerator = (route) => {
   *   return encodeURIComponent([route.meta.id, route.fullPath].join('__'))
   * }
   * ```
   */
  idGenerator?: Fn<[route: RouteLocationNormalizedLike], string>
}

const tabPagePropsOfRawPage = ['path', 'name', 'isAffix', 'isKeepAlive', 'title', 'icon'] as const

const tabPageComparisonPropsOfRoute = ['fullPath'] as const

const tabPageRefreshPropsOfRawPage = ['isAffix', 'isKeepAlive', 'title', 'icon'] as const

export interface TabPage extends Pick<RawPage, (typeof tabPagePropsOfRawPage)[number]> {
  /**
   * TabPage ID
   */
  id: string
  /**
   * ID of page's metadata
   */
  pageId: RawPage['id']
  /**
   * 参与对比的数据
   */
  comparisonData: Pick<RouteLocationNormalizedLike, (typeof tabPageComparisonPropsOfRoute)[number]>
  /**
   * 路由对应组件 name
   */
  componentName: string
}

/**
 * 标签页方向侧类型
 */
export type TabsSideType = 'left' | 'right'

export interface Tabs extends AppSDKPluginObject {
  /**
   * 标签页列表
   */
  pages: Ref<TabPage[]>
  /**
   * 当前激活的标签页
   */
  active: Ref<string>
  /**
   * 是否自动收集标签页
   */
  isAuto: Ref<boolean>
  /**
   * 切换自动模式
   */
  toggleAuto: Fn<[value?: boolean]>
  /**
   * 启用自动模式
   */
  enableAuto: NoopFn
  /**
   * 禁用自动模式
   */
  disableAuto: NoopFn
  /**
   * 判断 `pages` 是否为空
   * @example
   * ```ts
   * defineComponent({
   *   setup() {
   *     if (!Tabs.pagesIsEmpty()) {
   *       Tabs.setAffixPagesByRawPages([...])
   *     }
   *   }
   * })
   * ```
   */
  pagesIsEmpty: Getter<boolean>
  /**
   * 验证是否为有效路由数据
   */
  verifyRoute: Fn<[route: RouteLocationNormalizedLike], boolean>
  /**
   * 匹配相同标签页
   */
  matchSameTabPage: Fn<
    [tabPage: TabPage],
    {
      /** 匹配 `pageId` 的标签页列表 */ matched: TabPage[]
      /** 深度匹配的标签页 */ deepMatch: Getter<TabPage | undefined>
    }
  >
  /**
   * 判断是否可以移除指定标签页
   */
  canRemove: Fn<[source?: ResolvableIdType], boolean>
  /**
   * 判断是否可以移除其他标签页
   */
  canRemoveOther: Fn<[source?: ResolvableIdType], boolean>
  /**
   * 判断是否可以移除指定方向侧标签页
   */
  canRemoveSide: Fn<[side: TabsSideType, source?: ResolvableIdType], boolean>
  /**
   * 判断是否可以移除全部标签页
   */
  canRemoveAll: Fn<[], boolean>
  /**
   * 获取标签页 ID
   */
  resolveId: Fn<[value: ResolvableIdType], string>
  /**
   * 根据路由创建标签页
   */
  createTabPage: Fn<[route: RouteLocationNormalizedLike], TabPage>
  /**
   * 设置激活的标签页 ID
   */
  setActive: Fn<[value: ResolvableIdType]>
  /**
   * 设置目标标签页标题
   */
  setTabPageTitle: Fn<[target: ResolvableIdType, title: string]>
  /**
   * 获取激活的标签页
   */
  getActiveTabPage: Fn<[], TabPage | undefined>
  /**
   * 设置标签页列表
   */
  setTabsPages: Fn<[pages: TabPage[]]>
  /**
   * 根据原始页面元数据列表设置固定的标签页列表
   */
  setAffixTabsPagesByRawPages: Fn<[rawPages: RawPage[]]>
  /**
   * 根据原始页面元数据列表刷新标签页列表，用于同步非固定的属性值（title、icon、isAffix...）
   */
  refreshTabsPagesByRawPages: Fn<[rawPages: RawPage[] | Recordable<RawPage | undefined>]>
  /**
   * 根据路由添加标签页
   */
  addOne: PromiseFn<[route: RouteLocationNormalizedLike]>
  /**
   * 尝试移除标签页列表，基于 `beforeRemove` 验证，全部通过返回 `true`
   */
  tryRemoveTabPages: PromiseFn<[pages: TabPage[]], boolean>
  /**
   * 移除激活标签页
   */
  removeActive: PromiseFn<[], boolean>
  /**
   * 移除指定标签页
   */
  removeOne: PromiseFn<[value: ResolvableIdType], boolean>
  /**
   * 移除指定方向侧所有标签页
   */
  removeBySide: PromiseFn<[type: TabsSideType, target?: ResolvableIdType]>
  /**
   * 移除其他所有标签页
   */
  removeOther: PromiseFn<[target?: ResolvableIdType]>
  /**
   * 移除所有标签页
   */
  removeAll: PromiseFn<[force?: boolean]>
  /**
   * 更新 KeepAlive 缓存
   */
  updateKeepAlive: NoopFn
  /**
   * 路由是否已锁定
   */
  isRouteLocked: NoopFn
  /**
   * 锁定路由
   */
  lockRoute: NoopFn
  /**
   * 解锁路由
   */
  unlockRoute: NoopFn
  /**
   * 内置的收集器
   */
  collector: NoopFn
}

function defaultGenerator(route: RouteLocationNormalizedLike) {
  return encodeURIComponent([route.meta.id, route.fullPath].join('__'))
}

function pageToRoute(page: RawPage) {
  return {
    fullPath: page.path,
    meta: page as any,
  } as RouteLocationNormalizedLike
}

/**
 * 创建标签页管理器，部分功能依赖于 `AppSDK`、`Page` 和 `KeepAlive`，注册后获得完整功能
 *
 * ***注意：配合 `KeepAlive` 时需禁用自动收集选项，否则可能导致未知问题发生！***
 */
export function createTabs(options: TabsOptions) {
  const {
    autoCollect = true,
    mode,
    persisted = true,
    window,
    storage,
    storageKey = '__VUE_APP_SDK__TABS__',
    keepAliveMode = 'takeover',
    processActiveOnEmpty = noop,
    beforeReplace = () => true,
    beforeRemove = () => true,
    dataComparer = isEqual,
    idGenerator = defaultGenerator,
  } = options

  const { setSDK, resolveSDK } = createSDKRef('Tabs')

  const state = createPersistentRef({
    persisted,
    window,
    storage,
    storageKey,
    value: { pages: [] as TabPage[], active: '' },
  })
  const pages = computed({
    get: () => state.value.pages,
    set: (value) => {
      state.value.pages = value
    },
  })
  const active = computed({
    get: () => state.value.active,
    set: (value) => {
      state.value.active = value
    },
  })

  const resolveKeepAlive = () => {
    const { keepAlive } = resolveSDK()
    if (!keepAlive || keepAliveMode === 'normal') return null
    keepAlive.disableAuto()
    return keepAlive
  }

  // 路由跳转锁定
  const [isRouteLocked, { open: lockRoute, close: unlockRoute }] = createSwitch()

  /**
   * 是否可以移除标签页
   */
  function canRemove(source: ResolvableIdType = active.value) {
    const id = resolveId(source)
    return !!id && !pages.value.find((p) => p.id === id)?.isAffix
  }

  /**
   * 是否可以移除其他标签页
   */
  function canRemoveOther(source: ResolvableIdType = active.value) {
    const id = resolveId(source)
    return !!id && pages.value.some((p) => !p.isAffix && p.id !== id)
  }

  /**
   * 是否可以移除指定方向侧标签页
   */
  function canRemoveSide(side: TabsSideType, source: ResolvableIdType = active.value) {
    const id = resolveId(source)
    if (!id) return false
    const isLeft = side === 'left'
    const pageList = pages.value
    const len = pageList.length
    for (let i = isLeft ? 0 : len - 1; isLeft ? i < len : i > -1; isLeft ? i++ : i--) {
      if (pages.value[i].id === id) return false
      if (!pageList[i].isAffix) return true
    }
    return false
  }

  /**
   * 是否可以移除全部标签页
   */
  function canRemoveAll() {
    return pages.value.some((p) => !p.isAffix)
  }

  /**
   * 获取标签页 ID
   */
  function resolveId(value: ResolvableIdType) {
    if (value == null) return ''
    if (typeof value === 'number') return pages.value[value]?.id || ''
    if (typeof value === 'string') return value
    if (typeof (value as TabPage).pageId !== 'undefined') return (value as TabPage).id
    if (typeof (value as RouteLocationNormalizedLike).fullPath !== 'undefined')
      return idGenerator(value as RouteLocationNormalized)
    console.warn(`[VueAppSDK Tabs] - Invalid value: ${value}`)
    return ''
  }

  /**
   * 根据路由创建标签页
   */
  function createTabPage(route: RouteLocationNormalizedLike) {
    const tabPage = {
      ...pick(route.meta, tabPagePropsOfRawPage),
      comparisonData: cloneDeep(pick(route, tabPageComparisonPropsOfRoute)),
      id: idGenerator(route),
      pageId: route.meta.id,
      componentName: '',
    } as TabPage

    const router = resolveSDK().router
    const matchedRoute = route.matched
      ? route.matched.slice(-1)[0]
      : router.getRoutes().find((r) => r.meta.id === tabPage.pageId)

    tabPage.componentName = getComponentNameByRoute(matchedRoute, (name) => {
      if (!tabPage.componentName && name) {
        const { matched } = matchSameTabPage(tabPage)
        matched.forEach((page) => {
          if (!page.componentName) page.componentName = name
        })
      }
    })

    return tabPage
  }

  /**
   * 设置激活的标签页 ID
   */
  function setActive(value: ResolvableIdType) {
    const id = resolveId(value)
    if (id === active.value) return

    active.value = id
    if (active.value === '') {
      Promise.resolve(processActiveOnEmpty()).finally(unlockRoute)
      return
    }

    if (isRouteLocked()) return
    lockRoute()

    const router = resolveSDK().router
    const tabPage = getActiveTabPage()
    if (tabPage) {
      const { fullPath } = tabPage.comparisonData
      router.push(fullPath).finally(unlockRoute)
    }
    else {
      console.warn('[VueAppSDK Tabs] - Unknown value from:', value)
      unlockRoute()
    }
  }

  /**
   * 获取激活的标签页
   */
  function getActiveTabPage() {
    return pages.value.find((p) => p.id === active.value)
  }

  /**
   * 验证是否为有效路由数据
   */
  function verifyRoute(route: RouteLocationNormalizedLike) {
    if (['id', 'path', 'name', 'title'].some((key) => route.meta[key] == null)) {
      console.warn(
        '[VueAppSDK Tabs] - route.meta of addOne() is missing required parameters.',
        route,
      )
      return false
    }
    return true
  }

  /**
   * 匹配相同标签页
   */
  function matchSameTabPage(tabPage: TabPage) {
    const matched = pages.value.filter((item) => item.pageId === tabPage.pageId)
    return {
      matched,
      deepMatch: () => {
        return matched.length > 0
          ? matched.find((m) => dataComparer(tabPage.comparisonData, m.comparisonData))
          : undefined
      },
    }
  }

  /**
   * 根据路由添加标签页
   */
  async function addOne(route: RouteLocationNormalizedLike) {
    if (!verifyRoute(route) || route.meta.isFull) return

    const newTabPage = createTabPage(route)
    // 若存在完全一致的标签页则直接打开
    if (matchSameTabPage(newTabPage).deepMatch()) return setActive(newTabPage)

    // 更新组件名
    if (!newTabPage.componentName) {
      const routes = resolveSDK().router.getRoutes()
      const matchedRoute = routes.find((r) => r.meta.id === newTabPage.pageId)
      newTabPage.componentName = await asyncGetComponentNameByRoute(matchedRoute)
    }

    // 正常处理
    pages.value.push(newTabPage)
    setActive(newTabPage)

    const keepAlive = resolveKeepAlive()
    // 处理 KeepAlive 缓存
    if (newTabPage.isKeepAlive && keepAlive) {
      if (route.matched) route.matched.forEach(keepAlive.addRouteCache)
      else keepAlive.addCache(newTabPage.componentName)
    }
  }

  /**
   * 尝试移除标签页列表
   */
  async function tryRemoveTabPages(pages: TabPage[]) {
    let valid = pages.length > 0
    for (const page of pages) {
      valid = await beforeRemove(page)
      if (!valid) break
    }
    return valid
  }

  /**
   * 移除激活标签页
   */
  async function removeActive() {
    return removeOne(active.value)
  }

  /**
   * 移除指定标签页
   */
  async function removeOne(value: ResolvableIdType) {
    const id = resolveId(value)
    const index = pages.value.findIndex((p) => p.id === id)
    if (index === -1 || pages.value[index].isAffix) return true

    const valid = await tryRemoveTabPages([pages.value[index]])
    if (!valid) return false

    const isCurrent = id === active.value
    const nextTabPage = isCurrent ? pages.value[index - 1] || pages.value[index + 1] : null

    if (isCurrent) setActive(nextTabPage)
    const { componentName } = pages.value.splice(index, 1)[0]
    resolveKeepAlive()?.removeCache(componentName)
    return true
  }

  /**
   * 移除指定方向侧标签页列表
   */
  async function removeBySide(side: TabsSideType, source?: ResolvableIdType) {
    const isLeft = side === 'left'
    let id = resolveId(source)
    let needResetActive = false
    // 指定标签页与激活标签页不同时需要判断激活标签页是否在指定方向侧
    if (id && id !== active.value) {
      const index = pages.value.findIndex((p) => p.id === id)
      const activeIndex = pages.value.findIndex((p) => p.id === active.value)
      needResetActive = isLeft ? activeIndex < index : activeIndex > index
    }
    else {
      id = active.value
    }

    const index = id ? pages.value.findIndex((p) => p.id === id) : -1
    if (index === -1) return

    const needRemovePages: TabPage[] = []
    const len = pages.value.length
    for (let i = isLeft ? 0 : len - 1; isLeft ? i < len : i > -1; isLeft ? i++ : i--) {
      // 索引相同时跳出循环
      if (index === i) break
      const page = pages.value[i]
      // 不是固定标签时追加到 needRemovePages 中
      if (!page.isAffix) needRemovePages.push(page)
    }
    const valid = await tryRemoveTabPages(needRemovePages)
    if (!valid) return

    if (needResetActive) setActive(index)
    setTabsPages(pages.value.filter((p, i) => p.isAffix || (isLeft ? i >= index : i <= index)))
  }

  /**
   * 移除其他标签页列表
   */
  async function removeOther(source?: ResolvableIdType) {
    const id = resolveId(source) || active.value
    if (!id) return

    const needRemovePages = pages.value.filter((p) => !p.isAffix && p.id !== id)
    const valid = await tryRemoveTabPages(needRemovePages)
    if (!valid) return

    if (id !== active.value) setActive(id)
    setTabsPages(pages.value.filter((p) => p.isAffix || p.id === id))
  }

  /**
   * 移除所有标签页
   */
  async function removeAll(force = false) {
    if (!force) {
      const needRemovePages = pages.value.filter((p) => !p.isAffix)
      const valid = await tryRemoveTabPages(needRemovePages)
      if (!valid) return
    }

    const _pages = force ? [] : pages.value.filter((p) => p.isAffix)
    setActive(_pages[0])
    setTabsPages(_pages)
  }

  /**
   * 设置标签页列表
   */
  function setTabsPages(_pages: TabPage[]) {
    pages.value = _pages
    updateKeepAlive()
  }

  /**
   * 根据原始页面元数据列表设置固定的标签页列表
   */
  function setAffixTabsPagesByRawPages(rawPages: RawPage[]) {
    const affixPages = [] as TabPage[]
    rawPages.forEach((page) => {
      if (page.isFull || !page.isAffix) return
      affixPages.push(createTabPage(pageToRoute(page)))
    })
    setTabsPages(affixPages)
  }

  /**
   * 修复 KeepAlive 缓存
   */
  async function updateKeepAlive() {
    const names: string[] = []
    const { router } = resolveSDK()
    const keepAlive = resolveKeepAlive()
    if (!keepAlive) return

    for (const page of pages.value) {
      if (!page.isKeepAlive) return

      const route = router.getRoutes().find((r) => r.meta.id === page.pageId)
      const name = await asyncGetComponentNameByRoute(route)
      if (name) {
        names.push(name)
        // 更新标签页组件名
        if (!page.componentName) page.componentName = name
      }
    }

    keepAlive.setCache(names)
  }

  /**
   * 设置目标标签页标题
   */
  function setTabPageTitle(target: ResolvableIdType, title: string) {
    const id = resolveId(target)
    const tabPage = pages.value.find((p) => p.id === id)
    if (tabPage) tabPage.title = title
  }

  /**
   * 刷新标签页列表
   */
  function refreshTabsPagesByRawPages(rawPages: RawPage[] | Recordable<RawPage | undefined>) {
    const map = isArray(rawPages)
      ? rawPages.reduce((o, p) => {
        o[p.id] = p
        return o
      }, {} as Recordable<RawPage>)
      : rawPages
    pages.value.forEach((page) => {
      assign(page, pick(map[page.pageId], tabPageRefreshPropsOfRawPage))
    })
    updateKeepAlive()
  }

  const [isAuto, toggleAuto] = useToggle(autoCollect)
  const collector = once(() => {
    const { hooks } = resolveSDK()
    hooks.hook('sdk:router:direction', async (_, to) => {
      if (!isAuto.value || to.meta.isFull) return

      const unReg = hooks.hookOnce('sdk:router:direction:end', async (_, to, __, failure) => {
        // 如果是自动模式并且跳转成功则添加标签页
        if (isAuto.value && !isNavigationFailure(failure)) {
          lockRoute()
          await addOne(to)
        }
        unlockRoute()
      })

      // 非替换模式时直接跳过
      if (mode !== 'replace') return

      const tabPage = createTabPage(to)
      const { matched, deepMatch } = matchSameTabPage(tabPage)
      // 如果匹配结果仅有单个并且不满足深度匹配则处理替换逻辑
      if (matched.length === 1 && !deepMatch()) {
        const oldTabPage = matched[0]
        const valid = await beforeReplace(tabPage, oldTabPage)
        if (valid) {
          const success = await removeOne(oldTabPage)
          // 删除失败取消添加
          !success && unReg()
        }
      }
    })
  })

  const tabs: Tabs = {
    pages,
    active,
    isAuto,
    toggleAuto,
    enableAuto: () => toggleAuto(true),
    disableAuto: () => toggleAuto(false),
    pagesIsEmpty: () => pages.value.length === 0,
    verifyRoute,
    matchSameTabPage,
    canRemove,
    canRemoveOther,
    canRemoveSide,
    canRemoveAll,
    resolveId,
    setTabsPages,
    setAffixTabsPagesByRawPages,
    createTabPage,
    setActive,
    setTabPageTitle,
    getActiveTabPage,
    addOne,
    tryRemoveTabPages,
    removeActive,
    removeOne,
    removeBySide,
    removeOther,
    removeAll,
    updateKeepAlive,
    isRouteLocked,
    lockRoute,
    unlockRoute,
    refreshTabsPagesByRawPages,
    collector,
    install: (sdk) => {
      sdk.tabs = tabs
      setSDK(sdk)

      const unwatch = watch(
        isAuto,
        (value) => {
          if (value) {
            nextTick(() => unwatch())
            collector()
          }
        },
        { immediate: true },
      )

      sdk.hooks.hook('sdk:cleanup', () => {
        removeAll(true)
      })
    },
  }

  return tabs
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    /**
     * 标签页管理器
     */
    tabs: Tabs
  }
}
