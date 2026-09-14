/**
 * 掌心故事仅把用户亲自填写的观察转成创作提示；不分析照片，也不作命运预测。
 */
export type PalmLineShape = 'unknown' | 'curved' | 'straight' | 'branching';
export type PalmHand = 'left' | 'right' | 'both';
export type BirthTimeSlot = '' | 'morning' | 'daytime' | 'evening' | 'night';

export interface PalmStoryInput {
  hand: PalmHand;
  upperLine: PalmLineShape;
  middleLine: PalmLineShape;
  sideArc: PalmLineShape;
  birthDate: string;
  birthTime: BirthTimeSlot;
}

export interface PalmStorySection {
  label: string;
  evidence: string;
  prompt: string;
}

export interface PalmStoryReport {
  title: string;
  sections: PalmStorySection[];
  stages: PalmStorySection[];
}

const SHAPE_LABELS: Record<Exclude<PalmLineShape, 'unknown'>, string> = {
  curved: '偏弯曲',
  straight: '偏平直',
  branching: '有分叉',
};

const LINE_PROMPTS: Record<
  'upperLine' | 'middleLine' | 'sideArc',
  Record<Exclude<PalmLineShape, 'unknown'>, string>
> = {
  upperLine: {
    curved: '写下最近一件让你心里一暖的小事，把它画成一条弧线。',
    straight: '试着用一句简短的话，给最近的好心情取个名字。',
    branching: '列出两种让自己放松的方式，选一种今天尝试。',
  },
  middleLine: {
    curved: '给眼前的问题想一个不按常理的解法，先别急着评价。',
    straight: '把下一件待办拆成三个很小的步骤。',
    branching: '把两个看似无关的点子拼在一起，看看会出现什么。',
  },
  sideArc: {
    curved: '为这周安排一个舒展身心的空白时段。',
    straight: '选一个熟悉的小习惯，给它做一次轻量调整。',
    branching: '给接下来的休息时间准备两个可切换的选项。',
  },
};

const THEME_NAMES: Record<Exclude<PalmLineShape, 'unknown'>, string> = {
  curved: '弧光手记',
  straight: '直线手记',
  branching: '岔路手记',
};

const EXPRESSION_PROMPTS: Record<Exclude<PalmLineShape, 'unknown'>, string> = {
  curved: '如果把弧线当成一种表达方式，可以试试先讲感受，再补上具体需求；观察哪一部分更像今天的自己。',
  straight: '如果把直线当成一种表达方式，可以试试先讲清楚事实，再留一句给感受的空间。',
  branching: '如果把分叉当成一种表达方式，可以列出两种说法，挑一个更适合当下情境的版本。',
};

const WORK_PROMPTS: Record<Exclude<PalmLineShape, 'unknown'>, string> = {
  curved: '把正在做的事画成一条可转弯的路线：哪些环节可以留出试错空间？',
  straight: '把正在做的事画成一条清晰直线：最小的下一步是什么？',
  branching: '把正在做的事画成两条可选支路：什么时候需要收拢选择？',
};

const RELATION_PROMPTS: Record<Exclude<PalmLineShape, 'unknown'>, string> = {
  curved: '下一次交流时，先问对方“你现在最在意哪一部分”，看看会不会更容易对齐。',
  straight: '下一次交流时，试着把自己的边界说成一句温和而具体的话。',
  branching: '下一次交流时，试着提供两个都能接受的选择，听听对方的想法。',
};

const STAGE_TITLES = ['01 · 此刻观察', '02 · 小步试验', '03 · 节奏调整', '04 · 听取回应', '05 · 回看再写'] as const;
const STAGE_PROMPTS: Record<Exclude<PalmLineShape, 'unknown'>, readonly [string, string, string, string, string]> = {
  curved: [
    '先描出一条当下最想保留的生活曲线，写下它为何重要。',
    '在接下来的一周留一个可以转弯的小计划，不要求一次走对。',
    '找出一个过紧的安排，试着给它加一处缓冲。',
    '与信任的人聊聊你的新尝试，只收集感受，不急着下结论。',
    '回看这张卡：哪个转弯让你更自在？不合适的部分直接改掉。',
  ],
  straight: [
    '选出今天最清晰的一条主线，写下它服务于什么目标。',
    '把目标缩成一件十分钟内能开始的小事。',
    '检视清单里有没有一项可以暂停，让节奏更可持续。',
    '向信任的人解释你的安排，问问哪些地方还不够清楚。',
    '回看这张卡：哪些步骤有用，哪些规则可以放松？',
  ],
  branching: [
    '把眼前的两个可能方向各写成一句话，暂时不排名。',
    '挑一条成本很低的支路做小实验，给自己保留退路。',
    '为多选项设置一个收拢时点，减少反复切换的负担。',
    '请信任的人提出第三种看法，留意自己听到后的真实反应。',
    '回看这张卡：哪条路值得继续探索，哪条可以暂时搁置？',
  ],
};

const BIRTH_TIME_LABELS: Record<Exclude<BirthTimeSlot, ''>, string> = {
  morning: '清晨',
  daytime: '白天',
  evening: '傍晚',
  night: '夜间',
};

const BIRTH_TIME_PROMPTS: Record<Exclude<BirthTimeSlot, ''>, string> = {
  morning: '给卡片配一抹晨光色，写下一个想重新开始的小计划。',
  daytime: '给卡片配一抹日光色，写下今天最值得认真做的一件事。',
  evening: '给卡片配一抹晚霞色，记下今天可以放下的一件事。',
  night: '给卡片配一抹夜蓝色，留一句只说给自己的鼓励。',
};

function birthSeason(date: string): '春' | '夏' | '秋' | '冬' | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

const SEASON_PROMPTS: Record<'春' | '夏' | '秋' | '冬', string> = {
  春: '试着用嫩绿、浅粉或雨后的颜色，设计这张卡片的心情背景。',
  夏: '试着用海蓝、明黄或树荫的颜色，设计这张卡片的心情背景。',
  秋: '试着用琥珀、赭红或暖棕的颜色，设计这张卡片的心情背景。',
  冬: '试着用雾白、松绿或深蓝的颜色，设计这张卡片的心情背景。',
};

export function buildPalmStory(input: PalmStoryInput): PalmStoryReport | null {
  const sections: PalmStorySection[] = [];
  const hand = input.hand === 'both' ? '双手' : input.hand === 'left' ? '左手' : '右手';
  const lines: Array<{ key: 'upperLine' | 'middleLine' | 'sideArc'; label: string }> = [
    { key: 'upperLine', label: '上方横线' },
    { key: 'middleLine', label: '中部横线' },
    { key: 'sideArc', label: '拇指侧弧线' },
  ];
  const observed = lines.filter((line) => input[line.key] !== 'unknown');
  if (observed.length === 0) return null;
  for (const line of lines) {
    const shape = input[line.key];
    if (shape === 'unknown') continue;
    sections.push({
      label: line.label,
      evidence: `你手动记录了${hand}的${line.label}“${SHAPE_LABELS[shape]}”。`,
      prompt: LINE_PROMPTS[line.key][shape],
    });
  }
  const expressionShape = (input.upperLine !== 'unknown' ? input.upperLine : input.middleLine !== 'unknown' ? input.middleLine : input.sideArc) as Exclude<PalmLineShape, 'unknown'>;
  const workShape = (input.middleLine !== 'unknown' ? input.middleLine : input.sideArc !== 'unknown' ? input.sideArc : input.upperLine) as Exclude<PalmLineShape, 'unknown'>;
  const relationShape = (input.upperLine !== 'unknown' ? input.upperLine : input.sideArc !== 'unknown' ? input.sideArc : input.middleLine) as Exclude<PalmLineShape, 'unknown'>;
  const themeLine = observed[0];
  const themeShape = input[themeLine.key] as Exclude<PalmLineShape, 'unknown'>;
  sections.push({
    label: '掌纹主题',
    evidence: `取自你手动记录的${hand}${themeLine.label}“${SHAPE_LABELS[themeShape]}”；这是卡片命名，不是身份标签。`,
    prompt: `这次的画面主题叫“${THEME_NAMES[themeShape]}”。试着把它当成一个故事标题，而不是对自己的定论。`,
  });
  sections.push({
    label: '表达与性格自问',
    evidence: `以你标记的${input.upperLine !== 'unknown' ? '上方横线' : input.middleLine !== 'unknown' ? '中部横线' : '拇指侧弧线'}“${SHAPE_LABELS[expressionShape]}”作比喻；不是性格测量。`,
    prompt: EXPRESSION_PROMPTS[expressionShape],
  });
  sections.push({
    label: '工作风格练习',
    evidence: `以你标记的${input.middleLine !== 'unknown' ? '中部横线' : input.sideArc !== 'unknown' ? '拇指侧弧线' : '上方横线'}“${SHAPE_LABELS[workShape]}”作比喻；不判断能力或职业前景。`,
    prompt: WORK_PROMPTS[workShape],
  });
  sections.push({
    label: '人际相处练习',
    evidence: `以你标记的${input.upperLine !== 'unknown' ? '上方横线' : input.sideArc !== 'unknown' ? '拇指侧弧线' : '中部横线'}“${SHAPE_LABELS[relationShape]}”作比喻；不预测关系结果。`,
    prompt: RELATION_PROMPTS[relationShape],
  });
  const season = birthSeason(input.birthDate);
  if (season) {
    sections.push({
      label: '季节视觉意象',
      evidence: `你填写的日期落在${season}季；这里只借用季节做画面意象，不是五行命盘、性格或运势推断。`,
      prompt: SEASON_PROMPTS[season],
    });
  }
  if (input.birthTime) {
    sections.push({
      label: '时段配色',
      evidence: `你选择了${BIRTH_TIME_LABELS[input.birthTime]}时段；它仅影响卡片的创作提示。`,
      prompt: BIRTH_TIME_PROMPTS[input.birthTime],
    });
  }
  const stages: PalmStorySection[] = STAGE_TITLES.map((label, index) => ({
    label,
    evidence: `以你手动记录的${hand}${themeLine.label}“${SHAPE_LABELS[themeShape]}”为创作线索；以下是五步自我探索建议，不代表未来会发生什么。`,
    prompt: STAGE_PROMPTS[themeShape][index],
  }));
  return { title: `${THEME_NAMES[themeShape]} · 你写的掌心故事`, sections, stages };
}
