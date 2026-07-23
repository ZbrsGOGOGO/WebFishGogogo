// packages/frontend/src/features/skins/index.ts
// 伪装/皮肤层出口。皮肤以"数据契约"方式消费 ArticleViewModel（Req 5.4）。

export { CsdnSkin } from './csdn/CsdnSkin';
export type { CsdnSkinProps } from './csdn/CsdnSkin';
export { buildBlogTabTitle } from './tab-title';
