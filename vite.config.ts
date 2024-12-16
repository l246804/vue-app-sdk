import type { PackageJson } from '@rhao/types-base'
import type { OutputOptions } from 'rollup'
import type { UserConfig } from 'vite'
import { basename, resolve } from 'node:path'
import glob from 'fast-glob'
import { defineConfig } from 'vite'
import Dts from 'vite-plugin-dts'
import pkg from './package.json'

// 输出格式后缀
const esmExt = '.js'
const cjsExt = '.cjs'

// 输出目录
export const outDir = resolve(__dirname, 'dist')

// 入口目录
const entryDir = resolve(__dirname, 'src')
export const entryFile = 'src/index'

// 生成外部依赖配置
export function genExternals() {
  const { peerDependencies = {} } = pkg as PackageJson
  // 需要外化的依赖列表
  const deps = new Set<string | RegExp>([...Object.keys(peerDependencies)])

  // 移除 node 内置依赖
  deps.add(/^node(:.+)?$/)

  return [...deps].map((p) => (p instanceof RegExp ? p : new RegExp(`^${p}$|^${p}/.+`)))
}

// 生成模块输出配置
function genOutput(format: 'cjs' | 'esm') {
  return {
    // 输出的代码格式
    format,
    // 是否保留源码文件结构
    preserveModules: true,
    // 源码根目录
    preserveModulesRoot: entryDir,
    // 入口文件名
    entryFileNames(info) {
      let name = '[name]'
      if (/node_modules/.test(info.name)) {
        name = info.name.split('node_modules/').at(-1)!
        name = `vendors/${name}`
      }
      return name + (format === 'esm' ? esmExt : cjsExt)
    },
    // 导出模式
    exports: 'named',
  } as OutputOptions
}

export default defineConfig(() => {
  return {
    build: {
      outDir,
      minify: false,
      lib: {
        entry: entryFile,
      },
      rollupOptions: {
        external: genExternals(),
        // 避免 treeshake 时丢失 index.ts
        input: glob.sync(`${basename(entryDir)}/**/index.ts`, { deep: 2 }),
        output: [genOutput('esm'), genOutput('cjs')],
      },
    },
    resolve: {
      alias: {
        '@': entryDir,
        'vue-app-sdk': entryDir,
      },
    },
    plugins: [Dts({ include: [entryDir] })],
  } as UserConfig
})
