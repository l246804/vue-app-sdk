import type { RemovableRef, Serializer } from '@vueuse/core'
import { useStorage, useStorageAsync } from '@vueuse/core'
import { ref, shallowRef } from 'vue'
import { createLogger, isArray, isFunction } from 'nice-fns'
import { loadRouteLocation } from 'vue-router'
import type {
  RouteComponent,
  RouteLocationMatched,
  RouteLocationNormalized,
  RouteLocationNormalizedLoaded,
  RouteRecordNormalized,
} from 'vue-router'
import type { Nullish } from '@rhao/types-base'
import type { StorageOptions } from '@/types'

export const logger = createLogger('VueAppSDK')

export const assign = Object.assign

/**
 * 创建可持久化的 `ref` 变量
 */
export function createPersistentRef<T, A extends boolean>(
  options: StorageOptions<A> & { storageKey: string, shallow?: boolean, value: T },
  isAsync?: A,
  serializer?: Serializer<T>,
) {
  const { persistent, window, storage, storageKey, shallow = false, value } = options
  if (persistent) {
    return (isAsync ? useStorageAsync : useStorage)(storageKey, value, storage as any, {
      shallow,
      window,
      serializer,
    })
  }
  return (shallow ? shallowRef(value) : ref(value)) as RemovableRef<T>
}

/**
 * 是否时 ES 模块
 */
export function isESModule(obj) {
  return obj.__esModule || obj[Symbol.toStringTag] === 'Module'
}

/**
 * 模拟 `loadRouteLocation` 加载路由组件
 */
export async function loadRouteRecord(route: RouteRecordNormalized) {
  const components = route.components
  if (!components)
    return route

  await Promise.all(
    Object.keys(components).reduce((promises, name) => {
      const rawComponent = components[name]
      if (isFunction(rawComponent) && !('displayName' in rawComponent)) {
        promises.push(
          // @ts-expect-error 逻辑无误
          rawComponent().then((resolved) => {
            if (!resolved) {
              return Promise.reject(
                new Error(
                  `Couldn't resolve component "${name}" at "${route.path}". Ensure you passed a function that returns a promise.`,
                ),
              )
            }
            const resolvedComponent = isESModule(resolved) ? resolved.default : resolved
            // replace the function with the resolved component
            // cannot be null or undefined because we went into the for loop
            components[name] = resolvedComponent
          }),
        )
      }
      return promises
    }, []),
  )

  return route
}

export type LoadableRoute = RouteLocationNormalized | RouteRecordNormalized

/**
 * 路由是否未加载
 */
export function isUnloadedRoute(route: RouteRecordNormalized) {
  return Object.values(route.components || {}).some(
    (rawComponent) => isFunction(rawComponent) && !('displayName' in rawComponent),
  )
}

/**
 * 加载路由
 */
export function loadRoute(route: RouteLocationNormalized): Promise<RouteLocationNormalizedLoaded>
export function loadRoute(route: RouteRecordNormalized): Promise<RouteLocationMatched>
export function loadRoute(route: LoadableRoute) {
  if ('matched' in route && isArray(route))
    return loadRouteLocation(route)
  if ('components' in route && route.components)
    return loadRouteRecord(route)
  return Promise.resolve(route)
}

/**
 * 获取组件名称
 */
export function getComponentName(component) {
  if (!component)
    return ''
  // 1. Template component name
  // 2. Functional component name
  // 3. Template file name
  return component.name || component.displayName || component.__name || ''
}

/**
 * 同步组件名称
 */
export function syncComponentName(component, name: string) {
  if (!component)
    return component

  if (isFunction(component)) {
    // 函数式组件
    if ('displayName' in component)
      return component

    // 普通函数
    return () => syncComponentName(component(), name)
  }

  // Promise
  if ('then' in component)
    return component.then((resolved) => syncComponentName(resolved, name))

  // 组件对象
  const resolved: RouteComponent = isESModule(component) ? component.default : component
  assign(resolved, { name })

  return component
}

/**
 * 根据路由获取组件名称
 * @param route 路由
 */
export async function resolveComponentNameByRoute(route: RouteRecordNormalized | Nullish) {
  if (!route)
    return ''
  const promise = isUnloadedRoute(route) ? loadRoute(route) : Promise.resolve(route)
  const result = await promise
  return getComponentName(result.components && result.components.default)
}
