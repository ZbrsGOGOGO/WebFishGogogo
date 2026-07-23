// packages/frontend/src/components/compliance/content-declaration.ts
// 合规文案常量：自有合法内容声明与备案/页脚友好信息。
//
// 这些常量被上传界面（任务 15）、自有内容声明组件与全站页脚共享消费，
// 集中定义以保证全站合规文案一致（Req 13.1, 13.4）。

/**
 * ICP/备案号占位符。
 *
 * 上线前将此占位符替换为主体真实备案号（例如 "皖ICP备12345678号"），
 * 或通过构建期环境变量注入。留空/占位时页脚仍展示"备案信息待补充"提示，
 * 不影响其余合规声明的呈现。
 */
export const ICP_BEIAN_NUMBER = '皖ICP备XXXXXXXX号';

/** 工信部备案查询官网（页脚备案号按惯例链接至此）。 */
export const ICP_BEIAN_URL = 'https://beian.miit.gov.cn/';

/**
 * 页脚展示的"内容为用户上传且合法"声明（Req 13.4）。
 * 简短版本，适合在页脚一行内展示。
 */
export const USER_CONTENT_FOOTER_STATEMENT =
  '本站所有阅读内容均为用户自行上传，且由用户保证其合法拥有。本站不提供任何盗版、赌博、博彩或违法内容。';

/**
 * 上传界面展示、需用户确认的"自有合法内容声明"标题（Req 13.1）。
 */
export const SELF_OWNED_CONTENT_DECLARATION_TITLE = '自有合法内容声明';

/**
 * 上传界面展示、需用户确认的"自有合法内容声明"正文（Req 13.1）。
 *
 * 逐条列出用户在上传前必须确认的合规承诺；上传 UI（任务 15）将其与
 * 确认勾选框一起展示，未勾选禁止上传（Req 2.2）。
 */
export const SELF_OWNED_CONTENT_DECLARATION_ITEMS: readonly string[] = [
  '我确认所上传的内容为本人合法拥有或已获得合法授权的文本。',
  '我确认所上传内容不涉及盗版、侵权作品的分发或传播。',
  '我确认所上传内容不包含赌博、博彩、色情、暴力或任何违反法律法规的信息。',
  '我理解本站仅供个人合法阅读用途，并将对所上传内容承担全部法律责任。',
];

/**
 * 上传确认勾选框旁展示的简短确认语（Req 13.1）。
 */
export const SELF_OWNED_CONTENT_CONFIRM_LABEL =
  '我已阅读并同意上述《自有合法内容声明》，确认所上传内容为本人合法拥有。';
