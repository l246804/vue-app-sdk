import type { HookCallback, Hookable } from 'hookable'
import { createHooks as _createHooks } from 'hookable'
import type { AppSDKConfigHooks, AppSDKHooks } from './types'

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
