import { isFunction } from 'lodash-unified'
import { inject } from 'vue'
import type { App, InjectionKey } from 'vue'
import { createHooks } from './hooks'
import type { AppSDK, AppSDKOptions, AppSDKPluginFunction, AppSDKPluginObject } from './types'
import { enhanceRouter } from './enhanceRouter'

export const APP_SDK_KEY: InjectionKey<AppSDK> = Symbol('App SDK')

/**
 * 获取 AppSDK 实例
 */
export function useAppSDK() {
  return inject(APP_SDK_KEY)!
}

/**
 * 创建 VueAppSDK
 *
 * @example
 * ```ts
 * // router.ts
 * export const router = createRouter({ ... })
 *
 * // sdk.ts
 * export const sdk = createAppSDK({ ... })
 *
 * // main.ts
 * const app = createApp({ ... })
 *
 * // 需先挂载路由器再挂载 SDK
 * app.use(router).use(sdk)
 *
 * app.mount('#app')
 * ```
 */
export function createAppSDK(options: AppSDKOptions = {}) {
  const { plugins = [] } = options
  const hooks = createHooks()

  let isInitialed = false
  const sdk: any = {
    options,
    hooks,
    cleanup,
    install(app: App) {
      if (isInitialed) return
      isInitialed = true

      const props = app.config.globalProperties
      const router = props.$router
      if (!router) throw new Error('[VueAppSDK] - Please install vue-router first!')

      // 挂载 app、router
      sdk.app = app
      sdk.router = router

      // 挂载至全局 $appSDK 并全局注入
      props.$appSDK = sdk
      app.provide(APP_SDK_KEY, sdk)

      // 增强路由器
      enhanceRouter(sdk, sdk.options.router)

      // 初始化插件运行
      runPlugins()
    },
  }

  function runPlugins() {
    plugins.forEach((plugin) => {
      const install: AppSDKPluginFunction = (plugin as AppSDKPluginObject)?.install || plugin
      isFunction(install) && install(sdk as AppSDK)
    })
  }

  function cleanup() {
    hooks.callHookSync('sdk:cleanup')
  }

  return sdk as Omit<AppSDK, 'app' | 'router'>
}

declare module 'vue' {
  export interface ComponentCustomProperties {
    $appSDK: AppSDK
  }
}
