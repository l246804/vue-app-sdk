import type { HookCallback, HookKeys, InferCallback } from 'easy-hookable'
import { tryOnScopeDispose } from '@vueuse/core'
import { Hookable } from 'easy-hookable'

export class AppSDKHookable<
  HooksT extends Record<string, any> = Record<string, HookCallback>,
  HookNameT extends HookKeys<HooksT> = HookKeys<HooksT>,
> extends Hookable<HooksT, HookNameT> {
  constructor() {
    super()
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
