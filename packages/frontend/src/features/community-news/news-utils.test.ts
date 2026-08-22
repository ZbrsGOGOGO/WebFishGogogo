import { describe, expect, it } from 'vitest';

import {
  communityNewsHttpsUrl,
  parseCommunityNewsTopics,
  validateCommunityNewsRevision,
} from './news-utils';

describe('community news client validation', () => {
  it('only accepts HTTPS source links and never accepts credentialed URLs', () => {
    expect(communityNewsHttpsUrl('https://news.example.com/story')).toBe('https://news.example.com/story');
    expect(communityNewsHttpsUrl('http://news.example.com/story')).toBeNull();
    expect(communityNewsHttpsUrl('https://user:secret@news.example.com/story')).toBeNull();
    expect(communityNewsHttpsUrl('javascript:alert(1)')).toBeNull();
  });

  it('normalizes and de-duplicates topic preferences without inventing tags', () => {
    expect(parseCommunityNewsTopics('TypeScript，AI typescript 质量_保障')).toEqual([
      'typescript', 'ai', '质量_保障',
    ]);
  });

  it('rejects mirrored or unsafe summaries and non-HTTPS original links', () => {
    const errors = validateCommunityNewsRevision({
      sourceId: 'source-1',
      originalTitle: '一条原文标题',
      summary: '<script>这是一段故意包含 HTML 的长摘要，客户端必须在提交服务端之前阻止它进入编辑流程。</script>',
      originalUrl: 'http://example.com/story',
      originalPublishedAt: new Date(Date.now() - 60_000).toISOString(),
      professionTags: [],
      topicTags: [],
      correctionNote: null,
    });
    expect(errors.summary).toMatch(/不能包含/);
    expect(errors.originalUrl).toMatch(/HTTPS/);
  });
});
