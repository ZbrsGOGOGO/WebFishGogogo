import type {
  CommunityContentChannel,
  CommunityModerationStatus,
  CommunityPostType,
  CommunityPublicationStatus,
} from '../../api/community';

export const CHANNEL_LABELS: Record<CommunityContentChannel, string> = {
  general: '综合经验',
  developer: '程序员',
  'product-manager': '产品经理',
  qa: '测试',
  sales: '销售',
  'human-resources': '人力资源管理',
  questions: '求助问答',
  retrospectives: '项目复盘',
  tools: '工具技巧',
};

export const POST_TYPE_LABELS: Record<CommunityPostType, string> = {
  experience: '经验',
  question: '问答',
  retrospective: '复盘',
};

export const PUBLICATION_LABELS: Record<CommunityPublicationStatus, string> = {
  draft: '草稿',
  pending_review: '审核中',
  published: '已发布',
};

export const MODERATION_LABELS: Record<CommunityModerationStatus, string> = {
  normal: '治理正常',
  limited: '已限制',
  hidden: '已隐藏',
};
