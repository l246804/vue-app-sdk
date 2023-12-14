# 快速开始

本节将介绍如何在项目中使用 Vue App SDK。

## 用法

Vue App SDK 提供了基于 ES Module 的开箱即用的 Tree Shaking 功能。

```ts
// sdk.ts
import { createAppSDK, createBetterRouter, createSSO } from 'vue-app-sdk'

export const SDK = createAppSDK({
  // 注册插件，扩展 SDK 功能
  plugins: [
    createSSO({
      // ...
    }),
    createBetterRouter({
      // ...
    })
  ],
})
```

## 开始使用

现在你可以启动项目了。对于每个插件的用法，请查阅对应的[独立文档](/api/)。
