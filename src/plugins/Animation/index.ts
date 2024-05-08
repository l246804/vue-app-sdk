import type { AnimationOptions } from './Animation'
import { Animation } from './Animation'

export * from './Animation'

/**
 * 创建路由动画插件
 * @param options 配置项
 */
export function createAnimation(options: AnimationOptions) {
  return new Animation(options)
}
