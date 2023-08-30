import type { Fn, NoopFn } from '@rhao/types-base'
import { assign } from 'lodash-unified'
import type { ComputedRef } from 'vue'
import { computed, reactive } from 'vue'
import { type AppSDK } from '../sdk'

export interface AppSDKAnimationOptions {
  /**
   * 默认是否启用动画，路由切换后允许还原为该值
   * @default true
   */
  enabled?: boolean
  /**
   * 路由前进动画名称
   * @default 'forward'
   */
  valueForward?: string
  /**
   * 路由后退动画名称
   * @default 'backward'
   */
  valueBackward?: string
}

export interface AppSDKAnimation {
  /**
   * 动画启用状态
   */
  enabled: ComputedRef<boolean>
  /**
   * 动画名称
   */
  name: ComputedRef<string | undefined>
  /**
   * 是否允许在切换路由后还原启用状态，默认允许，可调用此函数更改允许状态
   */
  allowRevert: Fn<[state: boolean]>
  /**
   * 切换动画启用状态，默认单次切换，在切换路由后还原启用状态
   */
  toggle: Fn<[state?: boolean, once?: boolean]>
  /**
   * 启用动画，默认单次启用，在切换路由后还原启用状态
   */
  enable: Fn<[once?: boolean]>
  /**
   * 禁用动画，默认单次禁用，在切换路由后还原启用状态
   */
  disable: NoopFn
}

/**
 * 创建动画管理器插件
 */
export function createAnimationPlugin(options?: AppSDKAnimationOptions) {
  return (sdk: AppSDK) => {
    const hooks = sdk.hooks
    const router = sdk.router

    // 合并配置项
    const opts = assign(
      {
        enabled: true,
        valueForward: 'forward',
        valueBackward: 'backward',
      } as AppSDKAnimationOptions,
      options,
    ) as Required<AppSDKAnimationOptions>

    // 还原启用状态开关
    let isAllowRevert = true
    function allowRevert(state: boolean) {
      isAllowRevert = !!state
    }

    router.afterEach(() => {
      if (isAllowRevert) toggle(opts.enabled)
    })

    // 创建内部状态
    const state = reactive({
      // 当前路由是否为前进状态
      isForward: true,
      // 是否启用动画
      enabled: opts.enabled,
    })

    // 处理内部状态
    hooks.hook('sdk:router:direction', (direction) => {
      state.isForward = direction !== 'backward'
    })

    // 动态计算动画名称
    const name = computed(() => {
      return state.enabled ? (state.isForward ? opts.valueForward : opts.valueBackward) : undefined
    })

    function toggle(value = !state.enabled) {
      state.enabled = value
    }

    function enable() {
      toggle(true)
    }

    function disable() {
      toggle(false)
    }

    sdk.animation = {
      enabled: computed(() => state.enabled),
      name,
      allowRevert,
      toggle,
      enable,
      disable,
    }
  }
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    /**
     * 导航动画管理器
     */
    animation: AppSDKAnimation
  }
}
