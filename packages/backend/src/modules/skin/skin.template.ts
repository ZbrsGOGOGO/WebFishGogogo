// backend/src/modules/skin/skin.template.ts
import { ArticleViewModel, FakeMeta, ReadingProgress } from '@stealth-reader/shared';

/**
 * 皮肤渲染输入契约（关切点 3.3 Skin Contract）。
 *
 * 皮肤层只消费这份标准化输入 + 由 FakeMetaGenerator 生成的 fakeMeta，
 * 不直接依赖文档真实存储细节（对象存储 key、编码、原始文件等）。
 */
export interface SkinRenderInput {
  /** 伪装文章标题（通常取当前章节标题）。 */
  title: string;
  /** 当前页的纯文本正文（已由分页器切片，皮肤仅负责视觉呈现）。 */
  body: string;
  /** 文档 id，仅用于派生稳定的假元数据（不用于访问真实存储）。 */
  documentId: string;
  /** 当前阅读进度视图模型。 */
  progress: ReadingProgress;
}

/**
 * 皮肤模板接口：一个可插拔的渲染器。
 *
 * 每个模板由唯一 `id` 标识，`render` 将标准化输入 + 假元数据转换为
 * 完整的 `ArticleViewModel`。新增皮肤只需实现该接口并注册，无需改动
 * 阅读引擎或存储层（保持三层解耦，见 design.md 关切点 2）。
 */
export interface SkinTemplate {
  /** 皮肤唯一标识（如 'csdn'）。 */
  readonly id: string;
  /** 面向用户展示的皮肤名称。 */
  readonly displayName: string;
  /**
   * 渲染为标准视图模型。纯函数式：仅依赖入参，无副作用。
   */
  render(input: SkinRenderInput, fakeMeta: FakeMeta): ArticleViewModel;
}
