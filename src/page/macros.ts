/* eslint-disable no-new-func */
import { forEachTree } from '@rhao/lodash-x'
import type { PartialWith } from '@rhao/types-base'
import type { AppMode, Metadata, MetadataWithChildren } from './types'

type _MetadataWithChildren<M extends AppMode> = PartialWith<Metadata<M>, 'id'> & {
  /**
   * 子级页面列表
   */
  children?: _MetadataWithChildren<M>[]
}

/**
 * 定义静态页面元数据，为数据补充父子关联关系，便于统一处理接口数据与静态数据
 *
 * @example
 * ```ts
 * // 推荐：使用 unplugin-macros 定义为编译宏，不会增加运行时开销
 * import { defineStaticPages } from 'vue-app-sdk/page/macros' assert { type: 'macro' }
 *
 * // 如果使用宏编译则必须传入字面量值，否则无法编译通过
 * // 不使用宏编译时可传入数组数据
 *
 * // 使用宏编译
 * const pages = defineStaticPages<'pc'>(`[
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
 * ]`)
 *
 * // 不使用宏编译
 * const pages = defineStaticPages<'pc'>([
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
export function defineStaticPages<M extends AppMode>(
  codeOrPages: string | _MetadataWithChildren<M>[],
) {
  const pages: _MetadataWithChildren<M>[]
    = typeof codeOrPages === 'string' ? new Function(`return ${codeOrPages}`)() : codeOrPages
  let id = 1

  forEachTree(pages, (page, _, __, ___, links) => {
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

  return pages as MetadataWithChildren<M>[]
}
