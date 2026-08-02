/**
 * PATCH /reading/:docId/progress 请求体：阅读进度的最新值（Req 7.1/7.2）。
 *
 * documentId 由路由参数 :docId 提供，故请求体中无需携带；此处仅描述客户端
 * 上报的定位字段。percent 允许缺省（由服务端/仓储收敛到 [0, 100]）。
 */
export interface SaveProgressDto {
  chapterIdx: number;
  charOffset: number;
  percent?: number;
}
