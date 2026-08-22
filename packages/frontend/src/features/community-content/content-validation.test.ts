import { describe, expect, it } from 'vitest';

import {
  communityContentLinkWarnings,
  parseCommunityTags,
  validateCommunityPost,
} from './content-validation';

describe('community content validation', () => {
  it('enforces title, body and tag boundaries', () => {
    expect(validateCommunityPost({
      type: 'experience', channel: 'general', title: '短', body: '也短', tags: ['a', 'b', 'c', 'd', 'e', 'f'], bodyFormat: 'plain_text',
    })).toMatchObject({ title: expect.any(String), body: expect.any(String), tags: expect.any(String) });
  });

  it('rejects images and HTML in restricted markdown and flags risky links', () => {
    const body = '这里是一段满足长度的正文 ![图片](https://example.com/a.png) <script>alert(1)</script>';
    expect(validateCommunityPost({ type: 'experience', channel: 'general', title: '一个有效的经验标题', body, tags: [], bodyFormat: 'restricted_markdown' }).body).toBeTruthy();
    expect(communityContentLinkWarnings(body)[0]).toContain('人工审核');
  });

  it('normalizes and deduplicates comma-separated tags', () => {
    expect(parseCommunityTags('前端， 安全,前端')).toEqual(['前端', '安全']);
  });
});
