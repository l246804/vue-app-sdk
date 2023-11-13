import type { RemovableRef, Serializer } from '@vueuse/core'
import { useStorage, useStorageAsync } from '@vueuse/core'
import { ref, shallowRef } from 'vue'
import type { RouteRecordNormalized } from 'vue-router'
import { isFunction, isObject, isObjectLike, noop } from 'lodash-unified'
import type { Fn } from '@rhao/types-base'
import type { StorageOptions } from '../types'
import type { AppSDK } from '../sdk'

/**
 * 创建可持久化的 `ref` 变量
 */
export function createPersistentRef<T, A extends boolean = false>(
  options: StorageOptions<A> & { storageKey: string; shallow?: boolean; value: T },
  isAsync = false,
  serializer?: Serializer<T>,
) {
  const { persisted, window, storage, storageKey, shallow = false, value } = options
  if (persisted) {
    return (isAsync ? useStorageAsync : useStorage)(storageKey, value, storage as any, {
      shallow,
      window,
      serializer,
    })
  }
  return (shallow ? shallowRef(value) : ref(value)) as RemovableRef<T>
}

const routeNameMap = new WeakMap<RouteRecordNormalized, string>()

/**
 * 根据路由获取组件名，若存在异步路由则通过回调动态设置
 */
export function getComponentNameByRoute(
  route?: RouteRecordNormalized,
  callback: Fn<[name: string]> = noop,
) {
  const components = route?.components
  if (!components) return ''

  if (routeNameMap.has(route)) return routeNameMap.get(route)!

  const component = components.default
  if (!component || !isObject(component)) return ''

  const resolveName = (data) => {
    const name = data.name || data.__name || ''
    if (name) routeNameMap.set(route, name)
    return name
  }

  if (isFunction(component) || 'then' in component)
    asyncGetComponentNameByRoute(route).then(callback)
  else if (isObjectLike(component)) return resolveName(component)

  return ''
}

/**
 * 异步根据路由获取组件名
 */
export async function asyncGetComponentNameByRoute(route?: RouteRecordNormalized) {
  const components = route?.components
  if (!components) return ''

  if (routeNameMap.has(route)) return routeNameMap.get(route)!

  let component = components.default as any
  if (!component || !isObject(component)) return ''

  if (isFunction(component)) component = component()
  if (component && isFunction(component.then)) component = await component
  if (component && isObject(component.default)) component = component.default
  if (!component) return ''

  const name = component.name || component.__name || ''
  if (name) routeNameMap.set(route, name)
  return name
}

/**
 * 创建 AppSDK 引用
 */
export function createSDKRef(pluginName: string) {
  let _sdk: AppSDK | null = null
  const resolveSDK = () => {
    if (!_sdk)
      throw new Error(`[VueAppSDK ${pluginName}] - Please install the plugin first!`)
    return _sdk
  }
  const setSDK = (sdk: AppSDK) => {
    _sdk = sdk
  }
  return {
    resolveSDK,
    setSDK,
  }
}
