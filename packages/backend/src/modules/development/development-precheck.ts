import type {
  DevelopmentAttachment,
  DevelopmentCategory,
  DevelopmentPrecheck,
} from '@stealth-reader/shared';

export interface DevelopmentPrecheckInput {
  title: string;
  category: DevelopmentCategory;
  description: string;
  attachments: DevelopmentAttachment[];
}

const ACCEPTANCE_PATTERN =
  /(?:验收|完成标准|期望结果|预期结果|应当|必须|acceptance|expected|definition\s+of\s+done)/iu;
const REPRODUCTION_PATTERN =
  /(?:复现|重现|操作步骤|当前结果|实际结果|repro(?:duce|duction)?|steps?\s+to)/iu;
const SCOPE_PATTERN =
  /(?:范围|不包含|不需要|边界|影响用户|目标用户|out\s+of\s+scope|in\s+scope)/iu;
const UI_CONTEXT_PATTERN =
  /(?:截图|视频|浏览器|分辨率|设备|移动端|桌面端|响应式|screenshot|browser|viewport|device)/iu;
const GAME_RULE_PATTERN =
  /(?:玩法|规则|操作|胜利|失败|数值|平衡|关卡|分数|gameplay|controls?|win|lose|balance)/iu;

const RISK_RULES: ReadonlyArray<{
  pattern: RegExp;
  finding: string;
}> = [
  {
    pattern: /(?:账号|登录|密码|权限|身份|会话|auth|password|permission|session)/iu,
    finding: '内容可能涉及账号、身份或权限边界，实施前需要安全复核。',
  },
  {
    pattern: /(?:删除|清空|覆盖|迁移|数据库|回滚|delete|drop|truncate|migration|rollback|database)/iu,
    finding: '内容可能涉及数据变更或破坏性操作，需要明确备份、回滚和数据保留方案。',
  },
  {
    pattern: /(?:支付|金额|价格|订单|交易|payment|price|billing|order|transaction)/iu,
    finding: '内容可能涉及金额或交易语义，需要业务 owner 确认规则与对账边界。',
  },
  {
    pattern: /(?:部署|上线|生产(?:环境)?|密钥|隐私|个人信息|deploy|production|secret|privacy|personal\s+data)/iu,
    finding: '内容可能涉及生产、秘密或隐私数据，需要人工确认授权和发布边界。',
  },
];

/**
 * Produces a deterministic rules-only precheck. User-provided strings are
 * classified as inert evidence: they are never interpreted as commands and
 * cannot change the fixed owner-decision or AI-review flags.
 */
export function buildDevelopmentPrecheck(
  input: DevelopmentPrecheckInput,
): DevelopmentPrecheck {
  const description = typeof input.description === 'string' ? input.description : '';
  const title = typeof input.title === 'string' ? input.title : '';
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const evidence = `${title}\n${description}`;
  const textAttachments = attachments.filter(
    (attachment) => attachment.extraction === 'text',
  ).length;
  const metadataOnlyAttachments = attachments.length - textAttachments;
  const attachmentWarnings = attachments.reduce(
    (total, attachment) =>
      total + (Array.isArray(attachment.warnings) ? attachment.warnings.length : 0),
    0,
  );
  const findings: string[] = [
    '本结果仅由固定规则生成，不代表 AI 或人工已审阅用户提供的内容。',
  ];
  const questions: string[] = [];

  if (!description.trim() || description.trim().length < 40) {
    questions.push('请补充背景、当前状态、期望结果和明确的不做范围。');
  }
  if (!ACCEPTANCE_PATTERN.test(description)) {
    questions.push('请补充可独立验证的验收标准，包括成功与失败边界。');
  }

  switch (input.category) {
    case 'bug':
      if (!REPRODUCTION_PATTERN.test(description)) {
        questions.push('请补充稳定复现步骤、实际结果、预期结果及环境信息。');
      }
      break;
    case 'feature':
      if (!SCOPE_PATTERN.test(description)) {
        questions.push('请 owner 确认功能边界、目标用户以及本次明确不包含的范围。');
      }
      break;
    case 'ui':
      if (!UI_CONTEXT_PATTERN.test(description)) {
        questions.push('请补充目标设备、视口/分辨率、浏览器和视觉参考。');
      }
      break;
    case 'game':
      if (!GAME_RULE_PATTERN.test(description)) {
        questions.push('请补充玩法循环、操作方式、胜负条件及数值/平衡预期。');
      }
      break;
    case 'other':
      if (!SCOPE_PATTERN.test(description)) {
        questions.push('请 owner 明确请求类型、交付边界和不包含的范围。');
      }
      break;
  }

  if (attachments.length === 0 && (input.category === 'bug' || input.category === 'ui')) {
    questions.push('如问题与界面或运行环境有关，请补充已脱敏的截图、日志或最小复现资料。');
  }
  if (metadataOnlyAttachments > 0) {
    findings.push(
      `${metadataOnlyAttachments} 个附件仅完成元数据检查，内容需由人工打开审阅。`,
    );
    questions.push('请 owner 确认已人工查看所有仅元数据检查的附件。');
  }
  if (attachmentWarnings > 0) {
    findings.push(
      `附件安全检查产生 ${attachmentWarnings} 条提醒，需在决策前逐项人工确认。`,
    );
  }
  for (const rule of RISK_RULES) {
    if (rule.pattern.test(evidence)) findings.push(rule.finding);
  }

  questions.push('请 owner 明确决定接受、要求补充或拒绝，并确认实施范围与优先级。');

  return {
    kind: 'rules',
    summary:
      `规则预检：${categoryLabel(input.category)}请求，` +
      `描述 ${description.length} 个字符，附件 ${attachments.length} 个` +
      `（文本提取 ${textAttachments} 个，仅元数据 ${metadataOnlyAttachments} 个）。`,
    findings,
    questions,
    requiresOwnerDecision: true,
    aiReviewed: false,
  };
}

function categoryLabel(category: DevelopmentCategory): string {
  switch (category) {
    case 'bug':
      return '缺陷';
    case 'feature':
      return '功能';
    case 'ui':
      return '界面';
    case 'game':
      return '游戏';
    case 'other':
      return '其他';
  }
}
