// 构建时由 Vite 将 @site-router 指向完整路由或审核路由。
// TypeScript 默认解析完整路由；审核构建不会把业务页面打入静态产物。
export { RuntimeRouter as AppRouter } from '@site-router';
