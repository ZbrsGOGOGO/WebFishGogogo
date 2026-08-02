import { PLATFORM_TIME_ZONE } from './platform.constants';

/**
 * 将 UTC 时刻投影为指定业务时区的 YYYY-MM-DD。
 * 使用 formatToParts，避免依赖运行环境的日期字符串排列方式。
 */
export function toBusinessLocalDate(
  instant: Date,
  timeZone = PLATFORM_TIME_ZONE,
): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('instant must be a valid Date');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  if (!year || !month || !day) {
    throw new Error(`Unable to resolve local date for time zone ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}
