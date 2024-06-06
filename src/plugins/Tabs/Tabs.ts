import type { AppSDKInternalInstance, Plugin, PluginID, StorageOptions } from 'vue-app-sdk'
import { arrayToMap, isArray, isFunction, noop, once, pick } from 'nice-fns'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { isRef, nextTick, ref, toValue, watch } from 'vue'
import type { Awaitable, MaybeNullish, NotNullish } from '@rhao/types-base'
import type { RouteLocationNormalized } from 'vue-router'
import type { PageMetadata } from '../Page'
import { KEEP_ALIVE_ID } from '../KeepAlive'
import type { TabPage } from './interface'
import { assign, createPersistentRef, logger, resolveComponentNameByRoute } from '@/utils'

export type TabsRawPage = PageMetadata

export enum TabsReplaceResult {
  /**
   * 替换旧标签页为新标签页
   */
  replace = 'replace',
  /**
   * 打开新标签页
   */
  open = 'open',
  /**
   * 取消操作
   */
  cancel = 'cancel',
}

export interface TabsOptions extends StorageOptions {
  /**
   * 相同路由不同参数时处理标签页的模式
   * - `normal`: 普通模式，会打开相同路由不同参数的标签页
   * - `replace`: 替换模式，会先替换旧标签页为新标签页并激活
   * @default 'normal'
   */
  mode?: 'normal' | 'replace'
  /**
   * 是否缓存标签页，可单独设置 `PageMetadata.isKeepAlive` 缓存指定页面
   * @default true
   */
  keepAlive?: boolean
  /**
   * 是否在路由导航时自动收集标签页，设为 `true` 时将使用内置收集器进行收集
   * @default true
   */
  autoCollect?: MaybeRefOrGetter<boolean>
  /**
   * 页面元数据转为标签页属性
   * @param data 页面元数据
   */
  rawPageToTabPage?: (data: PageMetadata) => Omit<TabPage, 'id' | 'fullPath' | 'componentName'>
  /**
   * 是否为有效的页面元数据，指可以被转为标签页的元数据
   * @param data 页面元数据
   * @example
   * ```ts
   * const page: PageMetadata = {
   *   // ...
   *   isFull: true, // 全屏页面，不应被添加到标签页列表
   * }
   *
   * createTabs({
   *   // 排除全屏页面元数据
   *   isValidRawPage: (data) => !data.isFull
   * })
   * ```
   */
  isValidRawPage?: (data: PageMetadata) => boolean
  /**
   * 根据页面元数据添加标签页前的回调处理，若返回假值则取消添加
   */
  beforeAdd?: (page: PageMetadata) => Awaitable<void | boolean>
  /**
   * `mode` 设为 `replace` 时，替换标签页前的回调处理，根据返回结果进行处理
   */
  beforeReplace?: (newTabPage: TabPage, oldTabPage: TabPage) => Awaitable<TabsReplaceResult>
  /**
   * 移除标签页前的回调处理，若返回假值则取消移除
   */
  beforeRemove?: (tabPage: TabPage) => Awaitable<void | boolean>
  /**
   * 处理激活标签页为空的情况
   */
  processEmptyActive?: () => void
}

export type RouteForGenerableID = Pick<RouteLocationNormalized, 'fullPath' | 'meta'>

export type TabPageForGenerableID = Pick<TabPage, 'pageId' | 'fullPath' | 'isUniq'>

export type ResolvableIdType = MaybeNullish<string | number | TabPage | RouteForGenerableID>

/**
 * 标签栏方向侧
 */
export type TabsSideType = 'left' | 'right'

/**
 * Tabs Plugin ID
 */
export const TABS_ID: PluginID<Tabs> = Symbol('tabs')

function getMetadata(route: { meta: any }) {
  return route.meta._metadata || ({} as PageMetadata)
}

const defaultRawPageToTabPage: NotNullish<TabsOptions['rawPageToTabPage']> = (data) => ({
  ...data,
  pageId: data.id,
})

const defaultIsValidRawPage: NotNullish<TabsOptions['isValidRawPage']> = () => true

function rawPageToRoute(data: PageMetadata): RouteForGenerableID {
  return { fullPath: data.path, meta: { _metadata: data } }
}

const updatableTabPageProps = [
  'isAffix',
  'isUniq',
  'isKeepAlive',
  'title',
  'icon',
  'fullPath',
] as const

const unsafeUpdatableTabPageProps = [...updatableTabPageProps, 'fullPath'] as const

const beforeDefaults = {
  add: () => true,
  remove: () => true,
  replace: () => TabsReplaceResult.replace,
}

/**
 * 标签页管理插件，依赖于 `Page` 和 `KeepAlive` 插件
 *
 * ***注意：配合 `KeepAlive` 时会接管对缓存的处理并强制禁用自动模式！***
 */
export class Tabs implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: TabsOptions = {},
  ) {
    const {
      autoCollect = true,
      persistent = true,
      window,
      storage,
      storageKey = '__VUE_APP_SDK__TABS__',
    } = options

    this._isAuto = ref(toValue(autoCollect))
    // 监听响应式自动模式
    if (isRef(autoCollect) || isFunction(autoCollect))
      watch(autoCollect, this.toggleAuto)

    this._state = createPersistentRef({
      persistent,
      window,
      storage,
      storageKey,
      value: { pages: [], active: '' },
    })
  }

  id = TABS_ID

  /**
   * AppSDK 实例
   */
  private _sdk!: AppSDKInternalInstance

  /**
   * 页面元数据转为标签页属性
   * @readonly
   */
  get rawPageToTabPage() {
    return this.options.rawPageToTabPage || defaultRawPageToTabPage
  }

  /**
   * 是否为有效的页面元数据
   * @readonly
   */
  get isValidRawPage() {
    return this.options.isValidRawPage || defaultIsValidRawPage
  }

  /**
   * 持久化的状态
   */
  private _state: Ref<{ pages: TabPage[], active: TabPage['id'] }>

  /**
   * 设置标签页列表
   */
  set pages(value) {
    this._state.value.pages = value
  }

  /**
   * 标签页列表
   */
  get pages() {
    return this._state.value.pages
  }

  /**
   * 设置激活的标签页 ID
   */
  set active(value) {
    this._state.value.active = value
  }

  /**
   * 激活的标签页 ID
   */
  get active() {
    return this._state.value.active
  }

  /**
   * 激活的标签页
   * @readonly
   */
  get activeTabPage() {
    return this.pages.find((p) => p.id === this.active)
  }

  /**
   * 是否自动模式
   */
  private _isAuto: Ref<boolean>
  /**
   * 是否自动模式
   * @readonly
   */
  get isAuto() {
    return this._isAuto.value
  }

  /**
   * KeepAlive 插件
   */
  private get _keepAlive() {
    const plugin = this._sdk.getPlugin(KEEP_ALIVE_ID)
    plugin && plugin.isAuto && plugin.disableAuto()
    return plugin
  }

  /**
   * 路由列表
   */
  private get _routes() {
    return this._sdk.router.getRoutes()
  }

  /**
   * 判断是否需要缓存标签页
   */
  isKeepAlive(tagPage: { isKeepAlive?: boolean }) {
    return tagPage.isKeepAlive ?? this.options.keepAlive ?? true
  }

  /**
   * 生成标签页 ID
   */
  generateID(data: RouteForGenerableID | TabPageForGenerableID) {
    let pageId, fullPath, isUniq
    if ('meta' in data) {
      const metadata = getMetadata(data)
      pageId = metadata.id
      isUniq = metadata.isUniq
      fullPath = data.fullPath
    }
    else {
      pageId = data.pageId
      isUniq = data.isUniq
      fullPath = data.fullPath
    }
    let id = `${pageId}`
    if (!isUniq)
      id += `__${fullPath}`
    return id
  }

  /**
   * 切换自动模式
   * @param value 状态值
   */
  toggleAuto = (value = !this._isAuto.value) => {
    this._isAuto.value = value
    return value
  }

  /**
   * 启用自动模式
   */
  enableAuto = () => {
    return this.toggleAuto(true)
  }

  /**
   * 禁用自动模式
   */
  disableAuto = () => {
    return this.toggleAuto(false)
  }

  /**
   * 更新 KeepAlive 缓存
   */
  updateKeepAlive = async () => {
    // 没有 KeepAlive 组件时跳过
    if (!this._keepAlive)
      return

    const routes = this._routes
    const set = new Set<string>()
    for (const page of this.pages) {
      // 页面不缓存时继续遍历
      if (!this.isKeepAlive(page))
        continue

      const route = routes.find((r) => getMetadata(r).id === page.pageId)
      const name = await resolveComponentNameByRoute(route)
      if (name) {
        set.add(name)
        // 同步组件名
        if (page.componentName !== name)
          page.componentName = name
      }
    }

    // 更新缓存
    this._keepAlive.set([...set])
  }

  /**
   * 设置标签页列表
   * @param pages 标签页列表
   */
  setTabPages = (pages: TabPage[]) => {
    this.pages = pages
    this.updateKeepAlive()
  }

  /**
   * 根据页面元数据列表设置固定标签页列表
   * @param data 页面元数据列表
   */
  setAffixTabPagesByRawPages = (data: PageMetadata[]) => {
    const affixTabPages: TabPage[] = []
    data.forEach((item) => {
      if (!this.isValidRawPage(item))
        return
      const tabPage = this.createTabPage(rawPageToRoute(item))
      if (tabPage.isAffix)
        affixTabPages.push(tabPage)
    })
    this.setTabPages(affixTabPages)
  }

  /**
   * 更新标签页
   * @param target 可获取标签页 ID 的值
   * @param data 标签页属性
   */
  updateTabPage = (
    target: ResolvableIdType,
    data: Partial<Pick<TabPage, (typeof unsafeUpdatableTabPageProps)[number]>>,
  ) => {
    const id = this.resolveId(target)
    const tabPage = this.pages.find((p) => p.id === id)
    if (tabPage) {
      const needUpdateId = data.fullPath && tabPage.fullPath !== data.fullPath && !tabPage.isUniq

      assign(tabPage, pick(data, unsafeUpdatableTabPageProps))

      if (needUpdateId) {
        assign(tabPage, { id: this.generateID(tabPage) })

        // 移除组件缓存
        if (this._keepAlive && tabPage.componentName)
          this._keepAlive.remove(tabPage.componentName)

        // 更新当前激活 ID
        if (id === this.active)
          this._setActive(tabPage.id)
      }
    }
  }

  /**
   * 更新标签页的 `fullPath` 属性
   * @param data 路由数据
   * @param data.query `route.query`
   * @param data.params `route.params`
   * @param source 可获取标签页 ID 的值
   */
  updateFullPath = (
    data: { query?: Record<string, any>, params?: Record<string, any> } = {},
    source: ResolvableIdType = this.active,
  ) => {
    const id = this.resolveId(source)
    const tabPage = this.pages.find((p) => p.id === id)
    if (!tabPage)
      return

    const router = this._sdk.router
    const { fullPath } = router.resolve({ name: tabPage.name, ...data })
    this.updateTabPage(tabPage, { fullPath })
  }

  /**
   * 根据页面元数据更新标签页列表
   * @param data 页面元数据列表或映射
   */
  updateTabPagesByRawPages = (data: PageMetadata[] | Record<string, PageMetadata | undefined>) => {
    const map = isArray(data) ? arrayToMap(data, { primaryKey: 'id', useMap: false }) : data
    this.pages.forEach((page) => {
      const mapPage = map[page.pageId]
      if (!mapPage)
        return
      assign(page, pick(this.rawPageToTabPage(mapPage), updatableTabPageProps))
    })
  }

  /**
   * 获取标签页 ID
   * @param value 可获取标签页 ID 的值
   * @returns 标签页 ID
   */
  resolveId = (value: ResolvableIdType) => {
    if (value == null)
      return ''
    if (typeof value === 'number')
      return this.pages[value]?.id || ''
    if (typeof value === 'string')
      return value
    if ('pageId' in value)
      return value.id
    if ('fullPath' in value && 'meta' in value)
      return this.generateID(value)

    logger.warn('无效参数：', value)
    return ''
  }

  /**
   * 仅设置当前激活的标签页 ID
   * @param value 可获取标签页 ID 的值
   */
  private _setActive = (value: ResolvableIdType) => {
    const id = this.resolveId(value)
    // 未变更时直接跳过
    if (id === this.active)
      return false
    this.active = id
    return true
  }

  /**
   * 设置当前激活的标签页 ID
   * @param value 可获取标签页 ID 的值
   */
  setActive = (value: ResolvableIdType) => {
    if (!this._setActive(value))
      return

    if (this.active === '') {
      const { processEmptyActive = noop } = this.options
      processEmptyActive()
      return
    }

    const router = this._sdk.router
    const tabPage = this.activeTabPage
    if (tabPage && router.currentRoute.value.fullPath !== tabPage.fullPath)
      router.push(tabPage.fullPath)
    else if (!tabPage)
      logger.warn('未知的标签页来源：', value)
  }

  /**
   * 根据路由创建标签页
   * @param route 路由
   * @returns 标签页
   */
  createTabPage = (route: RouteForGenerableID) => {
    const metadata = getMetadata(route)
    return {
      ...this.rawPageToTabPage(metadata),
      id: this.generateID(route),
      fullPath: route.fullPath,
    } as TabPage
  }

  /**
   * 是否可以移除指定标签页
   * @param source 可获取标签页 ID 的值
   */
  canRemove = (source: ResolvableIdType = this.active) => {
    const id = this.resolveId(source)
    if (!id)
      return false

    const find = this.pages.find((p) => p.id === id)
    if (find)
      return !find.isAffix

    return true
  }

  /**
   * 是否可以移除非指定的其他非固定标签页
   * @param source 可获取标签页 ID 的值
   */
  canRemoveOther = (source: ResolvableIdType = this.active) => {
    const id = this.resolveId(source)
    return !!id && this.pages.some((p) => !p.isAffix && p.id !== id)
  }

  /**
   * 是否可以移除指定标签页的指定方向侧非固定标签页
   * @param side 方向侧
   * @param source 可获取标签页 ID 的值
   */
  canRemoveSide = (side: TabsSideType, source: ResolvableIdType = this.active) => {
    const id = this.resolveId(source)
    if (!id)
      return false

    const isLeft = side === 'left'
    const sourceIndex = this.pages.findIndex((p) => p.id === id)
    const pages = this.pages
      .slice(isLeft ? 0 : sourceIndex + 1, isLeft ? sourceIndex : undefined)
      .filter((p) => !p.isAffix)

    // 指定方向侧存在非固定标签页时可移除
    return pages.length > 0 && pages.some((p) => !p.isAffix)
  }

  /**
   * 是否可以移除全部非固定标签页
   */
  canRemoveAll = () => {
    return this.pages.some((p) => !p.isAffix)
  }

  /**
   * 尝试移除标签页列表
   * @param pages 标签页列表
   */
  tryRemoveTabPages = async (pages: TabPage[]) => {
    let valid = pages.length > 0
    const { beforeRemove = beforeDefaults.remove } = this.options
    for (const page of pages) {
      valid = !!(await beforeRemove(page))
      if (!valid)
        break
    }
    return valid
  }

  /**
   * 移除激活的标签页
   */
  removeActive = () => {
    return this.removeOne(this.active)
  }

  /**
   * 移除指定标签页
   * @param value 可获取标签页 ID 的值
   */
  removeOne = async (value: ResolvableIdType) => {
    const id = this.resolveId(value)
    const index = this.pages.findIndex((p) => p.id === id)
    // 不存在或为固定标签页时无需移除
    if (index === -1 || this.pages[index].isAffix)
      return true

    // 尝试移除失败时直接跳过
    const valid = await this.tryRemoveTabPages([this.pages[index]])
    if (!valid)
      return false

    const isCurrent = id === this.active
    // 优先向左移动，其次向右移动
    const nextTabPage = isCurrent ? this.pages[index - 1] || this.pages[index + 1] : null

    if (isCurrent)
      this.setActive(nextTabPage)
    const { componentName } = this.pages.splice(index, 1)[0]
    // 移除组件缓存
    if (this._keepAlive && componentName)
      this._keepAlive.remove(componentName)

    return true
  }

  /**
   * 移除指定标签页的指定方向侧非固定标签页
   * @param side 指定方向侧
   * @param source 可获取标签页 ID 的值
   */
  removeSide = async (side: TabsSideType, source: ResolvableIdType = this.active) => {
    const isLeft = side === 'left'
    const id = this.resolveId(source)
    let needResetActive = false
    // 指定标签页与激活标签页不同时需要判断激活标签页是否在指定方向侧
    if (id && id !== this.active) {
      const index = this.pages.findIndex((p) => p.id === id)
      const activeIndex = this.pages.findIndex((p) => p.id === this.active)
      needResetActive = isLeft ? activeIndex < index : activeIndex > index
    }

    // 获取需要移除的标签页列表
    const sourceIndex = id ? this.pages.findIndex((p) => p.id === id) : -1
    const needRemovePages = this.pages
      .slice(isLeft ? 0 : sourceIndex + 1, isLeft ? sourceIndex : undefined)
      .filter((p) => !p.isAffix)

    // 尝试移除标签页列表，失败时跳过后续操作
    const valid = await this.tryRemoveTabPages(needRemovePages)
    if (!valid)
      return

    // 重置激活的标签页
    if (needResetActive)
      this.setActive(sourceIndex)
    this.setTabPages(
      this.pages.filter((p, i) => p.isAffix || (isLeft ? i >= sourceIndex : i <= sourceIndex)),
    )
  }

  /**
   * 移除非指定的其他非固定标签页
   * @param source 可获取标签页 ID 的值
   */
  removeOther = async (source: ResolvableIdType = this.active) => {
    const id = this.resolveId(source)
    if (!id)
      return

    const needRemovePages = this.pages.filter((p) => !p.isAffix && p.id !== id)
    const valid = await this.tryRemoveTabPages(needRemovePages)
    if (!valid)
      return

    if (id !== this.active)
      this.setActive(id)
    this.setTabPages(this.pages.filter((p) => p.isAffix || p.id === id))
  }

  /**
   * 移除全部非固定标签页
   * @param force 是否强制移除，将不会触发 `beforeRemove` 回调
   */
  removeAll = async (force = false) => {
    if (!force) {
      const needRemovePages = this.pages.filter((p) => !p.isAffix)
      const valid = await this.tryRemoveTabPages(needRemovePages)
      if (!valid)
        return
    }

    const pages = force ? [] : this.pages.filter((p) => p.isAffix)
    this.setActive(pages[0])
    this.setTabPages(pages)
  }

  /**
   * 匹配相同标签页
   * @param tabPage 标签页
   */
  matchSameTabPage = (tabPage: TabPage) => {
    const fuzzy: TabPage[] = []
    let exact: TabPage | undefined

    this.pages.forEach((page) => {
      // 模糊匹配
      if (page.pageId === tabPage.pageId) {
        fuzzy.push(page)
        // 精确匹配
        if (!exact && page.fullPath === tabPage.fullPath)
          exact = page
      }
    })

    return {
      /**
       * 模糊匹配结果（同 `pageId`）
       */
      fuzzy,
      /**
       * 精确匹配（同 `pageId`、`fullPath`）
       */
      exact,
    }
  }

  /**
   * 根据路由添加标签页
   * @param route 路由
   */
  addOne = async (
    route: RouteForGenerableID & { matched?: RouteLocationNormalized['matched'] },
  ) => {
    const page = getMetadata(route)
    const { beforeAdd = beforeDefaults.add } = this.options

    // 没有页面元数据或不允许添加时跳过
    if (!page || !(await beforeAdd(page)))
      return

    const tabPage = this.createTabPage(route)
    const { fuzzy, exact } = this.matchSameTabPage(tabPage)
    const isExist = tabPage.isUniq ? fuzzy.length > 0 : !!exact

    // 不存在相同标签页时添加
    if (!isExist) {
      const route = this._routes.find((r) => getMetadata(r).id === tabPage.pageId)
      if (route)
        tabPage.componentName = await resolveComponentNameByRoute(route)
      this.pages.push(tabPage)
    }

    // 设置激活标签页 ID
    this.setActive(tabPage)

    // 设置标签页缓存
    if (!isExist && this.isKeepAlive(tabPage) && this._keepAlive) {
      if (route.matched) {
        route.matched.forEach(this._keepAlive.add)
      }
      else {
        const matchedRoute = this._routes.find((r) => getMetadata(r).id === tabPage.pageId)
        if (matchedRoute)
          this._keepAlive.add(matchedRoute)
      }
    }
  }

  install = (sdk: AppSDKInternalInstance) => {
    this._sdk = sdk
    const { router } = sdk

    const collector = once(() => {
      // 路由后退时移除来源标签页
      sdk.hook('sdk:router:backward', (_, from) => {
        this.removeOne(from)
      })

      router.beforeResolve(async (to) => {
        // 非自动模式、没有页面元数据、非有效的页面元数据
        if (!this.isAuto || !to.meta._metadata || !this.isValidRawPage(to.meta._metadata))
          return

        // 注册导航成功事件
        const unhook = sdk.hookOnce('sdk:router:navigate', (_, to) => {
          // 自动模式时添加标签页
          if (this.isAuto)
            this.addOne(to)
        })

        // 非替换模式时跳过
        if (this.options.mode !== 'replace')
          return

        const tabPage = this.createTabPage(to)
        const { fuzzy, exact } = this.matchSameTabPage(tabPage)
        // 匹配结果仅有单个并且不满足精确匹配则进行替换
        if (fuzzy.length === 1 && !exact) {
          const oldTabPage = fuzzy[0]
          const { beforeReplace = beforeDefaults.replace } = this.options

          // 获取替换结果
          const result = await beforeReplace(tabPage, oldTabPage)
          switch (result) {
            // 取消操作
            case TabsReplaceResult.cancel:
              unhook()
              return false
            // 打开新标签页
            case TabsReplaceResult.open:
              return
            // 替换标签页
            default:
              this.updateTabPage(oldTabPage, tabPage)
              this.setActive(tabPage)
              unhook()
              break
          }
        }
      })
    })

    const unwatch = watch(
      this._isAuto,
      (value) => {
        if (!value)
          return
        nextTick(() => unwatch())
        collector()
      },
      { immediate: true },
    )

    // 注册清理事件
    sdk.hook('sdk:cleanup', () => this.removeAll(true))

    return () => {
      unwatch()
    }
  }
}
