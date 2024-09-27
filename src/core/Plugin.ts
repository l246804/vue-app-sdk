import type { AppSDKInternalInstance } from './SDK'

/**
 * 插件标识，通过类型描述可以使 `sdk.getPlugin()` 获取插件类型提示。
 *
 * @example
 * ```ts
 * // 定义插件标识
 * const MyPluginID: PluginID<typeof MyPlugin> = Symbol('my plugin')
 *
 * // 定义插件
 * const MyPlugin = {
 *   // 设置插件标识
 *   id: MyPluginID,
 *
 *   // 统计插件安装次数
 *   count: 0,
 *
 *   // 插件安装操作
 *   install() {
 *     // 安装次数自增
 *     this.count++
 *   }
 * }
 *
 * // 创建插件实例
 * const sdk = new AppSDK()
 *
 * // 注册自定义插件
 * sdk.use(MyPlugin)
 *
 * // 根据标识获取插件并具备类型提示
 * sdk.getPlugin(MyPluginID).count
 * // => 1
 * ```
 */
// eslint-disable-next-line ts/no-wrapper-object-types
export interface PluginID<_ = unknown> extends Symbol {}

/**
 * 卸载函数
 */
export type Uninstall = () => void

/**
 * AppSDK Plugin
 */
export interface Plugin {
  /**
   * 插件标识
   */
  id: PluginID | string

  /**
   * 插件安装函数
   * @param sdk AppSDK 实例
   * @returns 卸载函数，优先级高于设置 `uninstall`
   */
  install: (sdk: AppSDKInternalInstance) => Uninstall | void

  /**
   * 插件卸载函数，`install()` 返回卸载函数时该设置将无效
   * @param sdk AppSDK 实例
   *
   * @example
   * ```ts
   * const MyPlugin = {
   *   id: 'myPlugin',
   *   install() {
   *     return () => {
   *       // ✔️ 同时存在时执行这里
   *       console.log('卸载函数')
   *     }
   *   },
   *   uninstall() {
   *     // ❌ 同时存在时将不会执行
   *     console.log('卸载函数')
   *   }
   * }
   * ```
   */
  uninstall?: (sdk: AppSDKInternalInstance) => void
}

/**
 * 推断插件类型
 */
export type InferPlugin<ID> = ID extends PluginID<infer P> ? P : unknown
