import { describe, expect, it } from 'vitest';

import { buildPalmStory, type PalmStoryInput } from './palmStoryLogic';

const empty: PalmStoryInput = {
  hand: 'left', upperLine: 'unknown', middleLine: 'unknown', sideArc: 'unknown', birthDate: '', birthTime: '',
};

describe('buildPalmStory', () => {
  it('never derives a palm report from a date or time without a manual mark', () => {
    expect(buildPalmStory({ ...empty, birthDate: '2000-04-12', birthTime: 'morning' })).toBeNull();
  });

  it('explains every interpretation from user-marked lines and offers five non-predictive stages', () => {
    const report = buildPalmStory({ ...empty, upperLine: 'curved', middleLine: 'branching', sideArc: 'straight' });
    expect(report?.title).toContain('弧光手记');
    expect(report?.sections.map((section) => section.label)).toEqual(expect.arrayContaining([
      '掌纹主题', '表达与性格自问', '工作风格练习', '人际相处练习',
    ]));
    expect(report?.sections.find((section) => section.label === '工作风格练习')?.evidence).toContain('中部横线“有分叉”');
    expect(report?.stages).toHaveLength(5);
    expect(report?.stages.every((stage) => stage.evidence.includes('不代表未来会发生什么'))).toBe(true);
  });

  it('uses date/time only as optional visual inspiration, not a birth chart', () => {
    const report = buildPalmStory({ ...empty, hand: 'right', sideArc: 'curved', birthDate: '2000-05-01', birthTime: 'night' });
    expect(report?.sections.find((section) => section.label === '季节视觉意象')?.evidence).toContain('不是五行命盘');
    expect(report?.sections.find((section) => section.label === '时段配色')?.evidence).toContain('夜间');
    expect(report?.sections.find((section) => section.label === '拇指侧弧线')?.evidence).toContain('右手');
    const invalid = buildPalmStory({ ...empty, sideArc: 'curved', birthDate: '2000-02-30' });
    expect(invalid?.sections.some((section) => section.label === '季节视觉意象')).toBe(false);
  });
});
