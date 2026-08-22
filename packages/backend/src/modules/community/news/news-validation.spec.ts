import { randomUUID } from 'node:crypto';

import {
  parseNewsRevisionInput,
  parseNewsSourceInput,
  strictNewsObject,
} from './news-validation';

describe('editorial news request validation', () => {
  it('accepts only concise summaries and HTTPS source links without credentials', () => {
    const revision = parseNewsRevisionInput({
      sourceId: randomUUID(),
      originalTitle: 'Official release notes',
      summary:
        'This independently written summary states only the material update and directs readers to the original source.',
      originalUrl: 'https://news.example.test/releases/one#fragment',
      originalPublishedAt: '2026-08-20T00:00:00.000Z',
      professionTags: ['developer'],
      topicTags: ['Technology', 'technology'],
    });

    expect(revision.originalUrl).toBe('https://news.example.test/releases/one');
    expect(revision.topicTags).toEqual(['technology']);
    expect(() =>
      parseNewsRevisionInput({
        ...revisionBody(),
        originalUrl: 'https://user:secret@news.example.test/releases/one',
      }),
    ).toThrow(expect.objectContaining({ response: { code: 'INVALID_ORIGINAL_URL' } }));
    expect(() =>
      parseNewsRevisionInput({
        ...revisionBody(),
        originalUrl: 'https://news.example.test/releases/one?access_token=secret',
      }),
    ).toThrow(expect.objectContaining({ response: { code: 'INVALID_ORIGINAL_URL' } }));
    expect(() =>
      parseNewsRevisionInput({
        ...revisionBody(),
        summary:
          '<strong>This copied markup is intentionally long enough to meet the summary minimum but remains forbidden.</strong>',
      }),
    ).toThrow(expect.objectContaining({ response: { code: 'INVALID_NEWS_SUMMARY' } }));
  });

  it('requires evidence metadata and a finite expiry for licensed sources', () => {
    expect(() =>
      parseNewsSourceInput({
        name: 'Licensed Wire',
        sourceType: 'licensed',
        homepageUrl: 'https://wire.example.test/',
        trustRank: 80,
        authorizationStatus: 'verified',
        authorizationEvidenceRef: 'vault/news/license-1',
      }),
    ).toThrow(expect.objectContaining({ response: { code: 'NEWS_LICENSE_EXPIRY_REQUIRED' } }));

    expect(
      parseNewsSourceInput({
        name: 'Owned Editorial Desk',
        sourceType: 'owned',
        homepageUrl: 'https://editorial.example.test/',
        trustRank: 70,
        authorizationStatus: 'verified',
        authorizationEvidenceRef: 'dms/news/policy-v1',
      }),
    ).toMatchObject({ sourceType: 'owned', authorizationStatus: 'verified' });
  });

  it('rejects unrecognized fields so raw article bodies or credentials cannot enter', () => {
    expect(() => strictNewsObject({ summary: 'ok', fullBody: 'mirrored text' }, ['summary'])).toThrow(
      expect.objectContaining({
        response: { code: 'UNEXPECTED_NEWS_FIELD', fields: ['fullBody'] },
      }),
    );
  });

  function revisionBody(): Record<string, unknown> {
    return {
      sourceId: randomUUID(),
      originalTitle: 'Official release notes',
      summary:
        'This independently written summary states only the material update and directs readers to the original source.',
      originalUrl: 'https://news.example.test/releases/one',
      originalPublishedAt: '2026-08-20T00:00:00.000Z',
      professionTags: [],
      topicTags: [],
    };
  }
});
