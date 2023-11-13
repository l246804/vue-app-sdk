import type { ConfigurableWindow, StorageLike, StorageLikeAsync } from '@vueuse/core'

export interface StorageOptions<A extends boolean = false> extends ConfigurableWindow {
  /**
   * 是否持久化数据到 `storage` 中
   * @default true
   */
  persisted?: boolean
  /**
   * Window's Storage
   * @default window.localStorage
   */
  storage?: [A] extends [true] ? StorageLikeAsync : StorageLike
  /**
   * key of `storage`
   */
  storageKey?: string
}
