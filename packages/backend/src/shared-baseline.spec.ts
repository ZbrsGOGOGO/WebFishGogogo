import fc from 'fast-check';
import {
  Profession,
  Theme,
  DEFAULT_CHARS_PER_PAGE,
  SUPPORTED_ENCODINGS,
} from '@stealth-reader/shared';

// 脚手架基线冒烟测试：验证 Jest + fast-check + 共享类型可用。
describe('shared baseline', () => {
  it('exposes the supported profession set', () => {
    expect(Object.values(Profession)).toEqual([
      '开发',
      '设计',
      '运营',
      '财务',
      '销售',
      '学生',
      '其他',
    ]);
  });

  it('exposes reading defaults and theme enum', () => {
    expect(DEFAULT_CHARS_PER_PAGE).toBeGreaterThan(0);
    expect(Theme.Light).toBe('light');
    expect(Theme.Dark).toBe('dark');
  });

  it('fast-check runs against supported encodings', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SUPPORTED_ENCODINGS), (encoding) => {
        return SUPPORTED_ENCODINGS.includes(encoding);
      }),
    );
  });
});
