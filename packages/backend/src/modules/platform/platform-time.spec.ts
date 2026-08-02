import { toBusinessLocalDate } from './platform-time';

describe('Asia/Shanghai business date', () => {
  it('uses Shanghai midnight rather than UTC midnight', () => {
    expect(toBusinessLocalDate(new Date('2026-07-23T15:59:59.000Z'))).toBe(
      '2026-07-23',
    );
    expect(toBusinessLocalDate(new Date('2026-07-23T16:00:00.000Z'))).toBe(
      '2026-07-24',
    );
  });

  it('handles the year boundary', () => {
    expect(toBusinessLocalDate(new Date('2026-12-31T16:00:00.000Z'))).toBe(
      '2027-01-01',
    );
  });

  it('rejects an invalid instant', () => {
    expect(() => toBusinessLocalDate(new Date('invalid'))).toThrow(RangeError);
  });
});
