// @ts-nocheck
/**
 * 修复 Vite 开发时部分文件热更新可能导致内部变量引用丢失，暂时的解决方案是刷新页面
 */
export function fixHotUpdateVite() {
  if (import.meta.hot) {
    const needReload = import.meta.hot.data.needReload
    if (needReload) location.reload()
    else import.meta.hot.data.needReload = true
  }
}
