import type { Fn, NoopFn } from '@rhao/types-base'
import type { ComputedRef } from 'vue'
import { computed, nextTick } from 'vue'
import { useToggle } from '@vueuse/core'
import type { AppSDKPluginObject } from '../sdk'

export interface AnimationOptions {
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

export interface Animation extends AppSDKPluginObject {
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
   *
   * ***注意：禁用时需要设置 Transition.css 为 false，否则会影响切换效果***
   */
  disable: NoopFn
}

/**
 * 创建动画管理器，需安注册到 AppSDK 才能正常工作
 *
 * @example
 * ```ts
 * // sdk.ts
 * const animation = createAnimation({ ... })
 * const sdk = createSDK({ plugins: [animation] })
 *
 * // App.vue
 * console.log(animation === sdk.animation) // true
 * ```
 */
export function createAnimation(options: AnimationOptions = {}) {
  const {
    enabled: rawEnabled = true,
    valueForward = 'forward',
    valueBackward = 'backward',
  } = options

  // 当前路由是否为前进状态
  const [isForward, toggleForward] = useToggle(true)
  // 是否启用动画
  const [enabled, toggleEnabled] = useToggle(rawEnabled)
  // 动画名称
  const animationName = computed(() => {
    return enabled.value ? (isForward.value ? valueForward : valueBackward) : undefined
  })

  // 是否允许还原动画
  let isAllowRevert = true

  const animation: Animation = {
    enabled: computed(() => enabled.value),
    name: animationName,
    allowRevert: (value: boolean) => {
      isAllowRevert = !!value
    },
    toggle: toggleEnabled,
    enable: () => toggleEnabled(true),
    disable: () => toggleEnabled(false),
    install: (sdk) => {
      const { hooks } = sdk

      hooks.hook('sdk:router:direction', (direction) => {
        // 识别前进或后退
        toggleForward(direction !== 'backward')
      })

      hooks.hook('sdk:router:direction:end', () => {
        // 路由跳转结束后还原启用状态
        if (isAllowRevert) nextTick(() => toggleEnabled(rawEnabled))
      })

      sdk.animation = animation
    },
  }

  return animation
}

declare module 'vue-app-sdk' {
  export interface AppSDK {
    /**
     * 导航动画管理器
     */
    animation: Animation
  }
}
