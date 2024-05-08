# `vue-app-sdk`

一款 `Vue` 应用软件开发工具集合，自身仅基于 `vue-router` 扩展不同应用场景下的通用功能，根据实际需求安装不同插件来满足各种场景下的敏捷开发。

## 安装

依赖于 `vue` 和 `vue-router`。

```shell
pnpm add vue vue-router vue-app-sdk
```

```ts
// main.ts
// ...

const app = createApp(App)

// 必须先安装路由器再安装 SDK
app.use(router)
app.use(sdk)

app.mount('#app')
```

## 扩展 SDK

```ts
// plugins/sdk.ts
// ...
import { createAnimation } from 'vue-app-sdk'

const sdk = createAppSDK({
  plugins: [
    // 注册转场动画插件
    createAnimation({
      valueForward: 'forward',
      valueBackward: 'backward',
    }),
  ]
})
```

## 功能详情

[SDK - Vue 应用软件开发工具](https://github.com/l246804/vue-app-sdk/wiki/SDK)

## 内置插件

- [Animation - 转场动画管理](https://github.com/l246804/vue-app-sdk/wiki/Animation)
- [KeepAlive - 路由页面缓存管理](https://github.com/l246804/vue-app-sdk/wiki/KeepAlive)
- [BetterScroller - 路由滚动位置管理](https://github.com/l246804/vue-app-sdk/wiki/BetterScroller)
- [FeatureAuth - 应用功能权限](https://github.com/l246804/vue-app-sdk/wiki/FeatureAuth)
- [Page - 前后端标准化页面数据管理](https://github.com/l246804/vue-app-sdk/wiki/Page)
- [SSO - 单点登录管理](https://github.com/l246804/vue-app-sdk/wiki/SSO)
- [Tabs - 标签页列表管理](https://github.com/l246804/vue-app-sdk/wiki/Tabs)
- [Token - 应用令牌信息管理](https://github.com/l246804/vue-app-sdk/wiki/Token)

## ~~热更新时内存引用失效~~

引入下面的函数用于修复 `vite` 开发时部分文件热更新可能导致内存引用丢失问题。

```ts
// sdk.ts
import { fixHotUpdateVite } from 'vue-app-sdk'

if (import.meta.env.DEV)
  fixHotUpdateVite()
```

## 迁移至 v1.x

由于部分原因无法发布 v1.x 版本，故此请直接查看 v2.x 迁移步骤。

## 迁移至 v2.x

- 更改配置项传入方式 `app.use(sdk, {})` 为 `createAppSDK({})`
- 更改插件注册方式 `sdk.use(plugin)` 为 `createAppSDK({ plugins: [plugin] })`
- 移除 `sdk:mount`、`sdk:unmount` 事件

## 迁移至 v3.x

- 优化插件体系，变更插件使用方式
- 优化插件功能，变更插件执行方式
