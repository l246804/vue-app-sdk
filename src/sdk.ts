import { assign, isFunction } from 'lodash-unified'
import { inject } from 'vue'
import type { App, ComponentCustomProperties, InjectionKey, Plugin } from 'vue'
import { type Router, routerKey } from 'vue-router'
import type { Fn, PartialWithout } from '@rhao/types-base'
import { type AppSDKHooks, createHooks } from './hooks'
import { type AppSDKRouterOptions, extendRouter } from './extendRouter'

export interface AppSDKOptions {
  /**
   * 扩展路由器配置项
   */
  router?: AppSDKRouterOptions
}

export interface AppSDK {
  /**
   * 配置项
   */
  options: AppSDKOptions
  /**
   * Vue 实例
   */
  app: App
  /**
   * Vue 路由器
   */
  router: Router
  /**
   * Vue 实例全局属性，等同于 `app.config.globalProperties`
   */
  globProps: ComponentCustomProperties & Record<string, any>
  /**
   * hooks 管理器
   */
  hooks: AppSDKHooks
}

export type AppSDKPlugin = Fn<[sdk: AppSDK]>

type _AppSDK = PartialWithout<AppSDK, 'options' | 'hooks'> &
Plugin<[options?: AppSDKOptions]> & { use: Fn<[plugin: AppSDKPlugin], _AppSDK> }

export const APP_SDK_KEY: InjectionKey<AppSDK> = Symbol('App SDK')

/**
 * 获取 AppSDK 实例
 */
export function useAppSDK() {
  return inject(APP_SDK_KEY)!
}

/**
 * 创建应用 SDK
 *
 * @example
 * ```ts
 * // router.ts
 * export const router = createRouter({ ... })
 *
 * // sdk.ts
 * export const sdk = createAppSDK()
 *
 * // main.ts
 * const app = createApp({ ... })
 *
 * // 需先挂载路由器再挂载 SDK
 * app.use(router).use(sdk, { ... })
 *
 * app.mount('#app')
 * ```
 */
export function createAppSDK() {
  const sdk: _AppSDK = {
    options: {} as AppSDKOptions,
    hooks: createHooks(),
    use,
    install,
  }

  const plugins: AppSDKPlugin[] = []
  function use(plugin: AppSDKPlugin) {
    !plugins.includes(plugin) && plugins.push(plugin)
    return sdk
  }

  function runPlugins() {
    plugins.forEach((plugin) => isFunction(plugin) && plugin(sdk as AppSDK))
  }

  function mountSDK() {
    sdk.globProps!.$appSDK = sdk as AppSDK
    // 注入 SDK
    sdk.app!.provide(APP_SDK_KEY, sdk as AppSDK)

    runPlugins()

    // 通知 mount
    sdk.hooks.callHookParallel('sdk:mount')

    // 重写 unmount
    const mountApp = sdk.app!.unmount
    sdk.app!.unmount = function () {
      sdk.hooks.callHookParallel('sdk:unmount')
      return mountApp()
    }
  }

  function install(app: App, options?) {
    const globProps = app.config.globalProperties
    const router = globProps.$router
    if (!router) console.warn('[VueAppSDK] - Please install vue-router first!')

    assign(sdk.options, options)

    sdk.app = app
    sdk.globProps = globProps

    sdk.router = router
    if (!router) {
      app.runWithContext(() => {
        sdk.router = inject(routerKey)
        extendRouter(sdk as AppSDK, sdk.options.router)
        mountSDK()
      })
    }
    else {
      extendRouter(sdk as AppSDK, sdk.options.router)
      mountSDK()
    }
  }

  return sdk
}

declare module 'vue' {
  export interface ComponentCustomProperties {
    $appSDK: AppSDK
  }
}
