# `vue-app-sdk`

`Vue` 应用软件开发工具包。

## 安装

依赖于 `vue` 和 `vue-router`。

```shell
pnpm add vue vue-router vue-app-sdk
```

## 基础使用

```ts
// plugins/sdk.ts
import { createAppSDK } from 'vue-app-sdk'

export const sdk = createAppSDK({
  // ...
})
```

```ts
// main.ts
import { createApp } from 'vue'
import { router } from 'router/index'
import { sdk } from 'plugins/sdk'
import App from './App.vue'

const app = createApp(App)

// 必须先安装路由器再安装 SDK
app.use(router)
app.use(sdk)

app.mount('#app')
```

```html
<!-- xxx.vue -->
<script setup lang="ts">
import { useAppSDK } from 'vue-app-sdk'

const sdk = useAppSDK()
</script>
```

## 扩展 SDK

```ts
// plugins/sdk.ts
// ...
import { createAnimationPlugin } from 'vue-app-sdk/plugins/animation'

const sdk = createAppSDK({
  plugins: [
    // 注册转场动画插件
    createAnimationPlugin({
      valueForward: 'forward',
      valueBackward: 'backward',
    })
  ]
})
```

```html
<!-- App.vue -->
<script setup lang="ts">
import { useAppSDK } from 'vue-app-sdk'

const { name: transitionName, ...animationControls } = useAppSDK().animation

const router = useRouter()
function replacePage() {
  // 启用状态默认会在切换路由后还原，可通过 allowRevert 禁止还原
  // animationControls.allowRevert(false)
  // 需要禁用导航动画时
  // 禁用时需要设置 Transition.css 为 false，否则会影响切换效果
  animationControls.disable()
  router.replace('/a')
}

function pushPage() {
  // 除过 back() 和 go(-n) 时自动认为是前进，会采用 valueForward 动画
  router.push('/b')
}

function backPage() {
  // 会采用 valueBackward 动画
  router.back()
}
</script>

<template>
  <RouterView v-slot="{ Component: routerComp }">
    <Transition :name="transitionName" :css="!!transitionName">
      <Component :is="routerComp" />
    </Transition>
  </RouterView>
</template>

<style scoped>
.forward-active {
  /* ... */
}

.backward-active {
  /* ... */
}
</style>
```

## 开发插件

```ts
// myPlugin.ts
import type { AppSDKPlugin } from 'vue-app-sdk'

// 若不需要接收参数也可直接返回插件函数
export function createMyPlugin(): AppSDKPlugin {
  return (sdk) => {
    // ...

    // 也可不挂载
    sdk.myPlugin = {
      // ...
    }
  }
}
```

## 热更新时内存引用失效

引入下面的函数用于修复 `vite` 开发时部分文件热更新可能导致内存引用丢失问题。

```ts
// sdk.ts
import { fixHotUpdateVite } from '@neucloud/vue-app-sdk'

fixHotUpdateVite()
```

## 迁移至 v1.x

由于部分原因无法发布 v1.x 版本，故此请直接查看 v2.x 迁移步骤。

## 迁移至 v2.x

- 更改配置项传入方式 `app.use(sdk, {})` 为 createAppSDK({})
- 更改插件注册方式 `sdk.use(plugin)` 为 `createAppSDK({ plugins: [plugin] })`
- 移除 `sdk:mount`、`sdk:unmount` 事件
