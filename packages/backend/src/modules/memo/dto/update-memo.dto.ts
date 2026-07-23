/**
 * PUT /memo 请求体：便签自动保存的最新内容。
 *
 * 便签为纯文本，内容可为空字符串（表示清空便签）。防抖由前端负责，
 * 后端仅持久化最新值（Req 10.1）。
 */
export interface UpdateMemoDto {
  content: string;
}
