import {
  type AppSDKInternalInstance,
  NavigationDirection,
  type Plugin,
  type PluginID,
} from 'vue-app-sdk'
import type { MaybeRefOrGetter } from 'vue'
import { nextTick, ref, toValue } from 'vue'

export interface AnimationOptions {
  /**
   * 路由前进动画名称
   * @default 'forward'
   */
  forwardName?: MaybeRefOrGetter<string>
  /**
   * 路由后退动画名称
   * @default 'backward'
   */
  backwardName?: MaybeRefOrGetter<string>
}

/**
 * Animation Plugin ID
 */
const ANIMATION_ID: PluginID<Animation> = Symbol('animation')

export { ANIMATION_ID }

/**
 * 路由动画插件
 */
export class Animation implements Plugin {
  constructor(
    /**
     * 配置项
     */
    public options: AnimationOptions = {},
  ) {}

  id = ANIMATION_ID

  /**
   * 是否在路由导航后自动延迟启用动画
   */
  private _isAutoEnabled = true
  /**
   * 是否在路由导航后自动延迟启用动画
   * @readonly
   */
  get isAutoEnabled() {
    return this._isAutoEnabled
  }

  /**
   * 动画启用状态
   */
  private _isEnabled = ref(true)
  /**
   * 动画启用状态
   * @readonly
   */
  get isEnabled() {
    return this._isEnabled.value
  }

  /**
   * 路由导航时的动画名称，禁用动画时将返回 `undefined`
   */
  get name() {
    return this.isEnabled ? this._animationName : undefined
  }

  /**
   * 当前使用的动画名称
   */
  private _animationName = this.forwardName

  /**
   * 前进动画名称
   * @readonly
   */
  get forwardName() {
    return toValue(this.options.forwardName) || 'forward'
  }

  /**
   * 后退动画名称
   * @readonly
   */
  get backwardName() {
    return toValue(this.options.backwardName) || 'backward'
  }

  /**
   * 设置是否在路由导航后自动延迟启用动画状态
   * @param value 状态值
   */
  setAutoEnabled = (value: boolean) => {
    this._isAutoEnabled = value
  }

  /**
   * 设置动画启用状态
   * @param value 状态值
   */
  setEnabled = (value: boolean) => {
    this._isEnabled.value = value
  }

  /**
   * 启用动画
   */
  enable = () => {
    this.setEnabled(true)
  }

  /**
   * 禁用动画
   */
  disable = () => {
    this.setEnabled(false)
  }

  install = (sdk: AppSDKInternalInstance) => {
    sdk.hook('sdk:router:navigate', (direction) => {
      // 更改当前使用的动画名称
      this._animationName
        = direction === NavigationDirection.backward ? this.backwardName : this.forwardName

      // 延迟启用动画
      if (this._isAutoEnabled)
        nextTick(() => this.enable())
    })

    return () => {
      this._isAutoEnabled = true
      this._isEnabled.value = true
      this._animationName = this.forwardName
    }
  }
}
