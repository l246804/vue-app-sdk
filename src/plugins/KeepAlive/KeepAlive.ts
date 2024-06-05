import type { Awaitable } from '@rhao/types-base'
import {
  type AppSDKInternalInstance,
  NavigationDirection,
  type Plugin,
  type PluginID,
} from 'vue-app-sdk'
import { isFunction, isString, once } from 'nice-fns'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { isRef, nextTick, ref, shallowRef, toValue, watch } from 'vue'
import { type LoadableRoute, resolveComponentNameByRoute } from '@/utils'

export interface KeepAliveOptions {
  /**
   * 是否自动在路由前进时收集，后退时清理缓存，可用于模拟移动端缓存处理
   * @default true
   */
  autoCollectAndClean?: MaybeRefOrGetter<boolean>

  /**
   * 添加路由缓存前执行，返回假值将阻止添加
   */
  beforeRouteAdd?: (route: LoadableRoute) => Awaitable<void | boolean>

  /**
   * 删除路由缓存前执行，返回假值将阻止删除
   */
  beforeRouteRemove?: (route: LoadableRoute) => Awaitable<void | boolean>

  /**
   * 缓存保鲜时间，设置大于 `0` 后将开启定时器清理过期缓存
   */
  staleTime?: number
}

/**
 * KeepAlive Plugin ID
 */
export const KEEP_ALIVE_ID: PluginID<KeepAlive> = Symbol('keep alive')

const beforeRouteDefaults = {
  add: () => true,
  remove: () => true,
}

/**
 * 页面缓存管理插件
 */
export class KeepAlive implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: KeepAliveOptions = {},
  ) {
    const { autoCollectAndClean = true } = options

    this._isAuto = ref(toValue(autoCollectAndClean))
    // 监听响应式自动模式
    if (isRef(autoCollectAndClean) || isFunction(autoCollectAndClean))
      watch(autoCollectAndClean, this.toggleAuto)

    this.add = this.add.bind(this)
    this.remove = this.remove.bind(this)
    this.refresh = this.refresh.bind(this)

    // 启动缓存保鲜定时器
    if (options.staleTime != null)
      this.startStaleTimer()
  }

  id = KEEP_ALIVE_ID

  /**
   * 缓存的组件名称列表
   */
  private _values = shallowRef(new Set<string>())
  /**
   * 缓存的组件名称列表
   * @readonly
   */
  get values() {
    return [...this._values.value]
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
   * 缓存保鲜定时器
   */
  private _staleTimer: number | null = null

  /**
   * 缓存时间记录
   */
  private _timeRecord: Record<string, number> = {}

  /**
   * 更新缓存记录时间
   */
  private _updateTime = (value: string) => {
    this._timeRecord[value] = Date.now()
  }

  /**
   * 移除缓存时间记录
   */
  private _removeTime = (value: string) => {
    delete this._timeRecord[value]
  }

  /**
   * 启动缓存保鲜定时器
   */
  startStaleTimer = () => {
    const { staleTime } = this.options
    if (typeof staleTime !== 'number')
      throw new Error('staleTime must be a number')

    if (staleTime <= 0)
      return

    this.stopStaleTimer()
    this.clearExpired()
    this._staleTimer = setTimeout(this.startStaleTimer, staleTime) as unknown as number
  }

  /**
   * 停止缓存保鲜定时器
   */
  stopStaleTimer = () => {
    if (this._staleTimer) {
      clearTimeout(this._staleTimer)
      this._staleTimer = null
    }
  }

  /**
   * 清理过期缓存，设置 `options.staleTime > 0` 后有效
   */
  clearExpired = () => {
    const { staleTime } = this.options
    if (typeof staleTime !== 'number' || staleTime <= 0)
      return

    const newTimeRecord: Record<string, number> = {}
    const values: string[] = []

    Object.entries(this._timeRecord).forEach(([key, time]) => {
      if (Date.now() - time < staleTime)
        values.push(key)
      else
        newTimeRecord[key] = time
    })

    this._timeRecord = newTimeRecord
    this.set(values)
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
   * 添加路由缓存
   * @param name 需要缓存的路由组件名称
   */
  add(name: string): void
  /**
   * 添加路由缓存
   * @param route 需要缓存的路由对象
   */
  add(route: LoadableRoute): Promise<void>
  add(nameOrRoute: LoadableRoute | string) {
    if (!nameOrRoute)
      return

    const values = this._values.value

    if (isString(nameOrRoute)) {
      if (!values.has(nameOrRoute)) {
        values.add(nameOrRoute)
        this._updateTime(nameOrRoute)
        this.set(this.values)
      }
    }
    else if ('components' in nameOrRoute) {
      const { beforeRouteAdd = beforeRouteDefaults.add } = this.options
      return Promise.resolve(beforeRouteAdd(nameOrRoute)).then((valid) => {
        if (!valid)
          return
        return resolveComponentNameByRoute(nameOrRoute).then(this.add)
      })
    }
    else if ('matched' in nameOrRoute) {
      return this.add(nameOrRoute.matched.at(-1)!)
    }
  }

  /**
   * 移除路由缓存
   * @param name 需要移除的路由组件名称
   */
  remove(name: string): void
  /**
   * 移除路由缓存
   * @param route 需要移除的路由对象
   */
  remove(route: LoadableRoute): Promise<void>
  remove(nameOrRoute: string | LoadableRoute) {
    if (!nameOrRoute)
      return

    const values = this._values.value

    if (isString(nameOrRoute)) {
      if (values.has(nameOrRoute)) {
        values.delete(nameOrRoute)
        this._removeTime(nameOrRoute)
        this.set(this.values)
      }
    }
    else if ('components' in nameOrRoute) {
      const beforeRouteRemove = this.options.beforeRouteRemove || beforeRouteDefaults.remove
      return Promise.resolve(beforeRouteRemove(nameOrRoute)).then((valid) => {
        if (!valid)
          return
        return resolveComponentNameByRoute(nameOrRoute).then(this.remove)
      })
    }
    else if ('matched' in nameOrRoute) {
      return this.remove(nameOrRoute.matched.at(-1)!)
    }
  }

  /**
   * 刷新路由缓存
   * @param name 需要刷新的路由组件名称
   */
  refresh(name: string): void
  /**
   * 刷新路由缓存
   * @param route 需要刷新的路由对象
   */
  refresh(route: LoadableRoute): Promise<void>
  refresh(nameOrRoute: string | LoadableRoute) {
    if (!nameOrRoute)
      return

    if (isString(nameOrRoute)) {
      this.remove(nameOrRoute)
      nextTick(() => {
        this.add(nameOrRoute)
      })
    }
    else if ('components' in nameOrRoute) {
      const {
        beforeRouteAdd = beforeRouteDefaults.add,
        beforeRouteRemove = beforeRouteDefaults.remove,
      } = this.options

      return Promise.all([beforeRouteAdd(nameOrRoute), beforeRouteRemove(nameOrRoute)])
        .then((results) => results.every(Boolean))
        .then((valid) => {
          if (!valid)
            return
          return resolveComponentNameByRoute(nameOrRoute).then(this.refresh)
        })
    }
    else if ('matched' in nameOrRoute) {
      return this.refresh(nameOrRoute.matched.at(-1)!)
    }
  }

  /**
   * 清空缓存列表
   */
  clear = () => {
    this.set([])
  }

  /**
   * 设置缓存的名称列表，会覆盖旧列表
   * @param values 缓存名称列表
   */
  set = (values: string[]) => {
    this._values.value = new Set(values)
  }

  install = (sdk: AppSDKInternalInstance) => {
    const collector = once(() => {
      sdk.hook('sdk:router:navigate', async (direction, to, from) => {
        if (!this.isAuto)
          return

        if (direction === NavigationDirection.backward) {
          const needRemoveMatched = from.matched.filter((m) => !to.matched.includes(m))
          await Promise.all(needRemoveMatched.map(this.remove))
        }
        await Promise.all(to.matched.map(this.add))
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
    sdk.hook('sdk:cleanup', this.clear)

    return () => {
      unwatch()
      this.stopStaleTimer()
    }
  }
}
