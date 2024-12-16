import type { OutputOptions } from 'rollup'
import type { UserConfig } from 'vite'
import { defineConfig } from 'vite'
import pkg from './package.json'
import viteConfig, { entryFile, genExternals, outDir } from './vite.config'

// 生成 UMD 输出配置
function genUMDOutput() {
  const pkgName = pkg.name.slice(pkg.name.lastIndexOf('/') + 1)
  const name = pkgName
    .replace(/\.|_/g, '-')
    .replace(/-(?=\d)/g, '')
    .replace(/^[A-Z]|(?<=\d)[A-Z]/gi, (m) => m.toUpperCase())
    .replace(/-[A-Z]/gi, (m) => m[1].toUpperCase())

  return {
    // 输出的代码格式
    format: 'umd',
    // 暴露模块名
    name,
    // 外部依赖引用
    globals: {
      'vue': 'Vue',
      'vue-router': 'VueRouter',
    },
    // 入口文件名
    entryFileNames: 'umd.min.js',
  } as OutputOptions
}

export default defineConfig((env) => {
  return {
    ...viteConfig(env),

    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: entryFile,
      },
      rollupOptions: {
        external: genExternals(),
        output: [genUMDOutput()],
      },
    },
    plugins: [],
  } as UserConfig
})
