import type { SetOptional, WithChildren } from '@rhao/types-base'
import type { PageMetadata } from './interface'
import { eachTree } from 'nice-fns'

type _PageMetadata = SetOptional<PageMetadata, 'id'>

/**
 * 定义静态页面元数据，为数据补充父子关联关系，便于统一处理接口数据与静态数据
 * @param pages 页面元数据列表
 *
 * @example
 * ```ts
 * // 推荐：使用 unplugin-macros 定义为编译宏，不会增加运行时开销
 * // 注意：编译宏传入引用类型时仅支持字面量声明
 * import { defineStaticPages } from 'vue-app-sdk' assert { type: 'macro' }
 *
 * // 使用宏编译
 * const pages = defineStaticPages([
 *   {
 *     name: 'parent-name',
 *     path: '/parent-path',
 *     // ...
 *     children: [
 *       {
 *         name: 'child-name',
 *         path: 'child-path',
 *         // ...
 *       }
 *     ]
 *   }
 * ])
 *
 * // 编译后
 * const pages = [
 *   {
 *     id: '1',
 *     name: 'parent-name',
 *     path: '/parent-path',
 *     // ...
 *     children: [
 *       {
 *         id: '2',
 *         parentId: '1',
 *         name: 'child-name',
 *         path: 'child-path',
 *         // ...
 *       }
 *     ]
 *   }
 * ]
 * ```
 */
export function defineStaticPages(pages: WithChildren<_PageMetadata, 'children', false>[]) {
  let id = 1
  eachTree(pages, (page, _, __, ___, links) => {
    // 没有子级时认为是末梢节点，遍历父级链路添加 id
    if (!page.children?.length) {
      links.forEach((item, index) => {
        if (item.id == null && index === 0) {
          item.id = String(id++)
        }
        else if (index > 0) {
          item.id ??= String(id++)
          item.parentId ??= links[index - 1].id
        }
      })
    }
  })
  return pages
}
