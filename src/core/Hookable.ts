import type { KeyOf } from '@rhao/types-base'
import { tryOnScopeDispose } from '@vueuse/core'
import type { HookCallback } from 'hookable'
import { Hookable } from 'hookable'

type InferCallback<HT, HN extends keyof HT> = HT[HN] extends HookCallback ? HT[HN] : never

const defaultTask = { run: (function_: HookCallback) => function_() }
const _createTask = () => defaultTask
// @ts-expect-error 代码无误
const createTask = typeof console.createTask !== 'undefined' ? console.createTask : _createTask

function syncSerialTaskCaller<
  T extends HookCallback = HookCallback,
  P extends unknown[] = Parameters<HookCallback>,
>(hooks: T[], args: P) {
  const name = args.shift()
  const task = createTask(name)
  return hooks.forEach((hookFunction) => task.run(() => hookFunction(...args)))
}

export class AppSDKHookable<
  HooksT extends Record<string, any> = Record<string, HookCallback>,
  HookNameT extends KeyOf<HooksT, string> = KeyOf<HooksT, string>,
> extends Hookable<HooksT, HookNameT> {
  constructor() {
    super()
  }

  callHookSync = <NameT extends HookNameT>(
    name: NameT,
    ...arguments_: Parameters<InferCallback<HooksT, NameT>>
  ) => {
    arguments_.unshift(name)
    this.callHookWith(syncSerialTaskCaller, name, ...arguments_)
  }

  /**
   * 注册事件并在 `onScopeDispose()` 时自动移除监听
   */
  hookScope = <NameT extends HookNameT>(name: NameT, function_: InferCallback<HooksT, NameT>) => {
    const unhook = this.hook(name, function_)
    tryOnScopeDispose(unhook)
    return unhook
  }
}
