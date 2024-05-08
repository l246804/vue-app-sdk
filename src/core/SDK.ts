import { type App, type InjectionKey, inject } from 'vue'
import type { Router } from 'vue-router'
import type { AnyFn, IfUnknown, SetRequired } from '@rhao/types-base'
import { AppSDKHookable } from './Hookable'
import type { RouterOptions } from './Router'
import { Router as AppSDKRouter } from './Router'
import type { InferPlugin, Plugin } from './Plugin'
import { logger } from '@/utils'

/**
 * AppSDK 内部实例
 */
export type AppSDKInternalInstance = SetRequired<AppSDK, 'app' | 'router'>

export interface AppSDKHooks {
  /**
   * AppSDK 执行 `cleanup` 和 `destroy` 时触发，用于清理内存占用，推荐清理不影响插件或功能正常运行的数据
   */
  'sdk:cleanup': () => void
}

export interface AppSDKOptions {
  /**
   * 路由配置
   */
  router?: RouterOptions
}

/**
 * Vue Instance Injection Key
 */
export const APP_KEY: InjectionKey<App<any>> = Symbol('Vue App')

/**
 * AppSDK Injection Key
 */
export const APP_SDK_KEY: InjectionKey<AppSDKInternalInstance> = Symbol('App SDK')

/**
 * 组件 `setup()` 中获取 AppSDK 实例
 */
export function useAppSDK() {
  return inject(APP_SDK_KEY)!
}

/**
 * SDK for VueApp
 */
export class AppSDK extends AppSDKHookable<AppSDKHooks> {
  constructor(
    /**
     * 配置项
     */
    public options: AppSDKOptions = {},
  ) {
    super()
  }

  /**
   * 是否已初始化
   */
  isInitialed = false

  /**
   * Vue 实例
   */
  app?: App

  /**
   * VueRouter 实例
   */
  router?: Router

  /**
   * 插件列表
   */
  private _plugins: Plugin[] = []
  /**
   * 插件列表
   * @readonly
   */
  get plugins() {
    return this._plugins
  }

  /**
   * 内置插件列表
   * @readonly
   */
  private get _builtinPlugins() {
    return [new AppSDKRouter(this.options.router)] as Plugin[]
  }

  /**
   * 全部插件列表
   * @readonly
   */
  private get _allPlugins() {
    return [...this._builtinPlugins, ...this._plugins] as (Plugin & { _un?: AnyFn })[]
  }

  /**
   * 注册插件
   * @param plugin 插件
   */
  use = (plugin: Plugin) => {
    const index = this._plugins.findIndex((p) => p.id === plugin.id)
    if (index > -1) {
      logger.warn(`插件 "${plugin.id}" 已注册，将被覆盖！`)
      this._plugins.splice(index, 1)
    }
    this._plugins.push(plugin)
    return this
  }

  /**
   * 根据插件 ID 获取插件实例
   * @param id 插件 ID
   */
  getPlugin = <T, ID extends Plugin['id'] = Plugin['id']>(id: ID) => {
    return this._plugins.find((p) => p.id === id) as IfUnknown<T, InferPlugin<ID>, T> | undefined
  }

  /**
   * 根据插件 ID 列表获取插件实例列表
   * @param ids 插件 ID 列表
   */
  getPlugins = <IDs extends Plugin['id'][] = Plugin['id'][]>(...ids: IDs) => {
    return ids.map((id) => this.getPlugin(id)) as { [K in keyof IDs]: InferPlugin<IDs[K]> }
  }

  /**
   * 集中清理插件缓存，不会影响插件正常运行
   */
  cleanup = () => {
    this.callHookSync('sdk:cleanup')
  }

  /**
   * 安装插件列表
   */
  private _installPlugins = () => {
    // 先执行卸载
    this._uninstallPlugins()

    this._allPlugins.forEach((plugin) => {
      const uninstall = plugin.install(this as AppSDKInternalInstance)
      plugin._un = uninstall || plugin.uninstall?.bind(plugin, this as AppSDKInternalInstance)
    })
  }

  /**
   * 卸载插件列表
   */
  private _uninstallPlugins = () => {
    this._allPlugins.forEach((p) => {
      p._un?.()
      p._un = undefined
    })
  }

  /**
   * 手动初始化 AppSDK
   * @param app Vue 应用实例
   */
  init = (app: App) => {
    // 更改初始化状态
    if (this.isInitialed)
      return
    this.isInitialed = true

    // 重写 unmount
    const { unmount } = app
    app.unmount = (...args) => {
      this.destroy()
      return unmount(...args)
    }

    const props = app.config.globalProperties
    const router = props.$router

    // 检测 vue-router 是否已安装
    if (!router)
      throw new Error(logger.format('请先安装 vue-router！'))

    this.app = app
    this.router = router

    // 全局挂载 AppSDK
    props.$appSDK = this
    app.provide(APP_KEY, app)
    app.provide(APP_SDK_KEY, this as AppSDKInternalInstance)

    // 安装插件
    this._installPlugins()
  }

  /**
   * 手动销毁 AppSDK，会依次执行清理缓存、卸载插件、移除全部事件监听并释放内部数据。
   */
  destroy = () => {
    // 先集中清理缓存
    this.cleanup()
    // 卸载插件并移除所有事件
    this._uninstallPlugins()
    this.removeAllHooks()

    // 清理数据内存
    this._plugins.length = 0
    this.app = undefined
    this.router = undefined
    this.isInitialed = false
  }

  /**
   * 安装到 Vue 实例
   * @param app Vue 应用实例
   */
  install = (app: App) => {
    this.init(app)
  }
}

declare module 'vue' {
  export interface ComponentCustomProperties {
    /**
     * AppSDK 实例
     */
    $appSDK: AppSDK
  }
}
