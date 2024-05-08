import type { PageMetadata } from 'vue-app-sdk'

export interface TabPage
  extends Pick<
    PageMetadata,
    'path' | 'name' | 'title' | 'icon' | 'isKeepAlive' | 'isAffix' | 'isUniqInTabs'
  > {
  /**
   * 标签页 ID
   */
  id: string
  /**
   * 页面元数据 ID
   */
  pageId: PageMetadata['id']
  /**
   * 标签页完整路径
   */
  fullPath: string
  /**
   * 组件名称，用于 `KeepAlive` 缓存
   */
  componentName?: string
}
