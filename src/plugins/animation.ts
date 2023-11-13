import type { AnimationOptions } from '../animation'
import { createAnimation } from '../animation'

/**
 * 创建动画管理器插件
 * @deprecated "createAnimationPlugin" has been deprecated, please use "createAnimation"
 */
export function createAnimationPlugin(options: AnimationOptions = {}) {
  const animation = createAnimation(options)
  console.warn('[VueAppSDK Animation] - "createAnimationPlugin" has been deprecated, please use "createAnimation"')
  return animation.install
}
