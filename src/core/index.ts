import type { AppSDKOptions } from './SDK'
import { AppSDK } from './SDK'

export * from './SDK'
export * from './Router'
export * from './Plugin'

/**
 * 创建 AppSDK 实例
 */
export function createAppSDK(options: AppSDKOptions = {}) {
  return new AppSDK(options)
}
