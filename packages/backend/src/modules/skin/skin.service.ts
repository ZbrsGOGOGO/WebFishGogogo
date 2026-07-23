// backend/src/modules/skin/skin.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ArticleViewModel } from '@stealth-reader/shared';

import { csdnTemplate } from './csdn.template';
import { generateFakeMeta } from './fake-meta.generator';
import { SkinRenderInput, SkinTemplate } from './skin.template';

/**
 * 面向 API 的皮肤概要信息（供 `GET /skins` 使用，Controller 见 Task 7.4）。
 */
export interface SkinSummary {
  id: string;
  displayName: string;
}

/**
 * 皮肤服务（Skin_Layer）。
 *
 * 采用"模板注册表 + 数据契约"模式（design.md 3.3 Skin Contract）：
 * - 维护一个 skinId → {@link SkinTemplate} 的注册表，模板可插拔可替换；
 * - `render` 仅消费标准化的 {@link SkinRenderInput}，并用 {@link generateFakeMeta}
 *   由 documentId 派生稳定假元数据，产出 {@link ArticleViewModel}；
 * - 不依赖文档真实存储细节（不接触对象存储、编码或原始文件），满足 Req 5.4。
 *
 * 承载 Requirement 5：
 * - 5.1 将当前章节正文渲染为 CSDN 风格技术博客文章视图；
 * - 5.2 展示假标题栏/面包屑/阅读量/点赞/收藏/标签/专栏等伪装元数据（经 fakeMeta 提供）；
 * - 5.4 仅消费标准化 ArticleViewModel，不直接依赖文档真实存储细节。
 */
@Injectable()
export class SkinService {
  /** skinId → 模板 的注册表。 */
  private readonly registry = new Map<string, SkinTemplate>();

  constructor() {
    // 默认注册 CSDN 皮肤（V1 唯一皮肤）。V2 可注册更多模板而无需改动阅读引擎。
    this.register(csdnTemplate);
  }

  /**
   * 注册一个皮肤模板。若同 id 已存在则覆盖（便于测试与热替换）。
   */
  register(template: SkinTemplate): void {
    this.registry.set(template.id, template);
  }

  /**
   * 判断指定皮肤是否已注册。
   */
  has(skinId: string): boolean {
    return this.registry.has(skinId);
  }

  /**
   * 列出所有可用皮肤概要（供 `GET /skins`，Task 7.4）。
   */
  listSkins(): SkinSummary[] {
    return Array.from(this.registry.values()).map((template) => ({
      id: template.id,
      displayName: template.displayName,
    }));
  }

  /**
   * 以指定皮肤渲染标准化输入为 ArticleViewModel。
   *
   * Preconditions:
   *   - skinId 已注册（否则抛 NotFoundException）
   * Postconditions:
   *   - 返回的 ArticleViewModel.skinId === skinId
   *   - fakeMeta 对同一 input.documentId 稳定一致（由 generateFakeMeta 保证幂等）
   *   - 无副作用（仅消费入参，不访问真实存储）
   *
   * _Requirements: 5.1, 5.2, 5.4_
   */
  render(skinId: string, input: SkinRenderInput): ArticleViewModel {
    const template = this.registry.get(skinId);
    if (!template) {
      throw new NotFoundException(`未知皮肤: ${skinId}`);
    }

    const fakeMeta = generateFakeMeta(input.documentId);
    return template.render(input, fakeMeta);
  }
}
