import type { ConfigurableWindow, StorageLike, StorageLikeAsync } from '@vueuse/core'

/**
 * 支持持久化的通用配置项
 */
export interface StorageOptions<Async extends boolean = false> extends ConfigurableWindow {
  /**
   * 是否持久化数据到 `storage` 中
   * @default true
   */
  persistent?: boolean
  /**
   * 存储中心，支持实现 `Storage` 接口的对象
   * @default window.localStorage
   */
  storage?: [Async] extends [true] ? StorageLikeAsync : StorageLike
  /**
   * 持久化到存储中心的键
   */
  storageKey?: string
}
