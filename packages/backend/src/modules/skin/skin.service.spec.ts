import { NotFoundException } from '@nestjs/common';
import { ReadingProgress } from '@stealth-reader/shared';

import { generateFakeMeta } from './fake-meta.generator';
import { SkinService } from './skin.service';
import { SkinRenderInput, SkinTemplate } from './skin.template';

describe('SkinService', () => {
  let service: SkinService;

  const progress: ReadingProgress = {
    documentId: 'doc-1',
    chapterIdx: 0,
    charOffset: 0,
    percent: 0,
  };

  const baseInput: SkinRenderInput = {
    title: '第一章 起点',
    body: '第一段。\n\n第二段第一行\n第二段第二行。',
    documentId: 'doc-1',
    progress,
  };

  beforeEach(() => {
    service = new SkinService();
  });

  it('默认注册 csdn 皮肤', () => {
    expect(service.has('csdn')).toBe(true);
    expect(service.listSkins()).toContainEqual({
      id: 'csdn',
      displayName: 'CSDN 技术博客',
    });
  });

  it('render 产出符合契约的 ArticleViewModel（Req 5.1, 5.4）', () => {
    const vm = service.render('csdn', baseInput);

    expect(vm.skinId).toBe('csdn');
    expect(vm.articleTitle).toBe('第一章 起点');
    // 仅消费标准化输入的 progress，不依赖真实存储
    expect(vm.progress).toEqual(progress);
    // htmlBody 渲染为博客正文：分段 <p>，段内换行 <br/>
    expect(vm.htmlBody).toContain('<p>第一段。</p>');
    expect(vm.htmlBody).toContain('<br/>');
  });

  it('render 的 fakeMeta 由 documentId 稳定派生（Req 5.2）', () => {
    const vm = service.render('csdn', baseInput);
    expect(vm.fakeMeta).toEqual(generateFakeMeta('doc-1'));
  });

  it('对正文中的 HTML 特殊字符进行转义，防止注入', () => {
    const vm = service.render('csdn', {
      ...baseInput,
      body: '<script>alert(1)</script>',
    });
    expect(vm.htmlBody).not.toContain('<script>');
    expect(vm.htmlBody).toContain('&lt;script&gt;');
  });

  it('未知皮肤抛出 NotFoundException', () => {
    expect(() => service.render('unknown', baseInput)).toThrow(NotFoundException);
  });

  it('支持注册新皮肤模板而无需改动渲染逻辑（模板注册表可插拔）', () => {
    const plainTemplate: SkinTemplate = {
      id: 'plain',
      displayName: '朴素文本',
      render: (input, fakeMeta) => ({
        articleTitle: input.title,
        htmlBody: input.body,
        fakeMeta,
        progress: input.progress,
        skinId: 'plain',
      }),
    };
    service.register(plainTemplate);

    expect(service.has('plain')).toBe(true);
    const vm = service.render('plain', baseInput);
    expect(vm.skinId).toBe('plain');
    expect(vm.htmlBody).toBe(baseInput.body);
  });
});
