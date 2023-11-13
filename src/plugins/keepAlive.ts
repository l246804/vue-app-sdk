import { type KeepAliveOptions, createKeepAlive } from '../keepAlive'

/**
 * 创建 KeepAlive 管理器插件
 * @deprecated "createKeepAlivePlugin" has been deprecated, please use "createKeepAlive"
 */
export function createKeepAlivePlugin(options: KeepAliveOptions = {}) {
  const keepAlive = createKeepAlive(options)
  console.warn('[VueAppSDK KeepAlive] - "createKeepAlivePlugin" has been deprecated, please use "createKeepAlive"')
  return keepAlive.install
}
