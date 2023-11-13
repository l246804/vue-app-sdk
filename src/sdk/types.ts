import type { AwaitableFn, Fn, NoopFn } from '@rhao/types-base'
import type { ConfigurableWindow, StorageLikeAsync } from '@vueuse/core'
import type { HookCallback, HookKeys, Hookable } from 'hookable'
import type { App } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'

export interface AppSDKRouteDetails<T = unknown> {
  data: T | undefined
}

export type AppSDKRouteDirection = 'forward' | 'backward'

export interface AppSDKRouterOptions extends ConfigurableWindow {
  /**
   * 是否持久化详情，如果设为 `true`，则会将 `details` 存储在 `Storage` 中，防止刷新丢失
   *
   * ***注意：持久化后会缓存每次前进的详情数据，只有在手动替换或页面后退时进行清理，也可执行 `router.clearDetails()` 清理全部缓存。***
   * @default true
   */
  persistedDetails?: boolean
  /**
   * 用于持久化详情的存储中心
   * @default localStorage
   */
  storage?: StorageLikeAsync
  /**
   * 持久化存储详情的键
   * @default '__VUE_APP_SDK__ROUTE_DETAILS_CACHE__'
   */
  storageKey?: string
  /**
   * 识别方向，用于触发指定的 hooks，默认除过 `back()` 和 `go(-n)` 会被识别为后退，其他识别为前进
   */
  identifyDirection?: AwaitableFn<
    [
      to: RouteLocationNormalized,
      from: RouteLocationNormalized,
      currentDirection: AppSDKRouteDirection,
    ],
    AppSDKRouteDirection
  >
}

export interface AppSDKConfigHooks {
  /**
   * SDK 集中清理时触发
   */
  'sdk:cleanup': NoopFn
}

export interface AppSDKHooks extends Hookable<AppSDKConfigHooks> {
  /**
   * 同步执行 configHooks
   */
  callHookSync<NameT extends HookKeys<AppSDKConfigHooks> = HookKeys<AppSDKConfigHooks>>(
    name: NameT,
    ...arguments_: Parameters<
      AppSDKConfigHooks[NameT] extends HookCallback ? AppSDKConfigHooks[NameT] : never
    >
  ): void
}

export type AppSDKPluginFunction = Fn<[sdk: AppSDK]>
export interface AppSDKPluginObject { install: AppSDKPluginFunction }

export type AppSDKPlugin = AppSDKPluginFunction | AppSDKPluginObject

export interface AppSDKOptions {
  /**
   * 扩展路由器配置项
   */
  router?: AppSDKRouterOptions
  /**
   * 扩展插件列表
   */
  plugins?: AppSDKPlugin[]
}

export interface AppSDK {
  /**
   * 配置项
   */
  readonly options: AppSDKOptions
  /**
   * Vue 实例
   */
  readonly app: App
  /**
   * Vue 路由器
   */
  readonly router: Router
  /**
   * hooks 管理器
   */
  readonly hooks: AppSDKHooks
  /**
   * 集中清理缓存和旧数据资源，不会干扰到 AppSDK 及插件功能正常运行
   */
  cleanup(): void
  /**
   * 自动被 `app.use` 调用，调用后将挂载 AppSDK 并初始化插件运行
   */
  install(app: App): void
}
