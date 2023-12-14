import { resolve } from 'node:path'
import { cwd } from 'node:process'
import type { DefaultTheme } from 'vitepress'
import { defineConfig } from 'vitepress'
import { batchUnset, eachTree } from 'nice-fns'
import typedocSidebar from '../api/typedoc-sidebar.json'

const sidebar: DefaultTheme.SidebarItem[] = typedocSidebar
eachTree(
  sidebar,
  (node) => {
    if (!node.items) batchUnset(node, ['collapsed'])
  },
  { childrenKey: 'items' },
)

// https://vitepress.dev/reference/site-config
export default defineConfig({
  outDir: resolve(cwd(), 'website'),
  base: '/vue-app-sdk/',
  title: 'vue-app-sdk',
  lang: 'zh-CN',
  description: '一款 Vue 应用软件开发工具集合。',
  themeConfig: {
    logo: 'https://cn.vitejs.dev/logo.svg',

    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '插件', link: '/api/' },
      {
        text: '发行版本',
        link: 'https://github.com/l246804/vue-app-sdk/blob/dev/CHANGELOG.md',
        target: '_blank',
      },
    ],

    sidebar: [
      {
        text: '指南',
        items: [
          {
            text: '安装',
            link: '/guide/installation',
          },
          {
            text: '快速开始',
            link: '/guide/quick-start',
          },
        ],
      },

      {
        text: '插件列表',
        items: sidebar,
        link: '/api/',
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/l246804/vue-app-sdk' }],
  },
})
