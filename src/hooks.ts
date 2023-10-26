import type { Fn, NoopFn } from '@rhao/types-base'
import type { HookCallback, HookKeys, Hookable } from 'hookable'
import { createHooks as _createHooks } from 'hookable'
import type { AppSDKRouteDetails, AppSDKRouteDirection } from './extendRouter'

export interface AppSDKConfigHooks {
  /**
   * SDK 集中清理时触发
   */
  'sdk:cleanup': NoopFn
  /**
   * 路由前进或后退时触发
   */
  'sdk:router:direction': Fn<[direction: AppSDKRouteDirection]>
  /**
   * 路由前进时触发
   */
  'sdk:router:forward': NoopFn
  /**
   * 路由后退时触发
   */
  'sdk:router:backward': NoopFn
  /**
   * 路由跳转成功时触发
   */
  'sdk:router:details': Fn<[targetPath: string, details: AppSDKRouteDetails]>
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

const defaultTask = { run: (function_: HookCallback) => function_() }
const _createTask = () => defaultTask
// @ts-expect-error
// eslint-disable-next-line no-console
const createTask = typeof console.createTask !== 'undefined' ? console.createTask : _createTask

export function syncSerialTaskCaller<
  T extends HookCallback = HookCallback,
  P extends unknown[] = Parameters<HookCallback>,
>(hooks: T[], args: P) {
  const name = args.shift()
  const task = createTask(name)
  return hooks.forEach((hookFunction) => task.run(() => hookFunction(...args)))
}

export function createHooks() {
  const hooks = _createHooks<AppSDKConfigHooks>() as AppSDKHooks
  function callHookSync(this: Hookable<AppSDKConfigHooks>, name, ...args) {
    args.unshift(name)
    this.callHookWith(syncSerialTaskCaller, name, ...args)
  }
  hooks.callHookSync = callHookSync.bind(hooks)
  return hooks
}
