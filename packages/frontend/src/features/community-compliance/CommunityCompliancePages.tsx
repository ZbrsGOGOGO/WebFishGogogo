import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_LEGAL_VERSIONS } from '../../app/community-legal';
import { SITE_NAME } from '../../app/site-config';

function ComplianceNav(): JSX.Element {
  return (
    <nav aria-label="社区合规文件">
      <Link to="/privacy-policy">隐私政策</Link>{' · '}
      <Link to="/terms-of-service">服务条款</Link>{' · '}
      <Link to="/community-guidelines">社区规范</Link>
    </nav>
  );
}

export function CommunityPrivacyPolicyPage(): JSX.Element {
  return (
    <main className="compliance-page">
      <h1>隐私政策</h1>
      <p>版本：{COMMUNITY_LEGAL_VERSIONS.privacy}</p>
      <p>{SITE_NAME}社区版会处理创建账号、维持安全会话和提供用户主动使用功能所必需的信息。本页描述社区版事实，不适用于仅在浏览器本地运行的匿名试玩记录。</p>
      <h2>我们处理的信息</h2>
      <ul>
        <li>账号资料：邮箱、昵称、随机公开编号、系统头像和乐斗职业。</li>
        <li>安全信息：会话摘要、登录时间、大致地区、风险事件和必要网络安全日志。</li>
        <li>用户主动产生的数据：主页设置、通知状态，以及后续开放的好友、内容、绿植和乐斗资产。</li>
        <li>需要发布内容或即时交流时，按适用要求保存最少的身份核验结果；手机号和身份信息不会展示在公开主页。</li>
      </ul>
      <h2>Cookie 与访问令牌</h2>
      <p>刷新凭据保存在 HttpOnly、Secure、SameSite Cookie 中；短期访问令牌只驻留在当前页面内存，不写入 localStorage。退出、修改密码或高风险事件可撤销会话。</p>
      <h2>公开范围</h2>
      <p>昵称、系统头像、乐斗职业和公开帖子可对所有人可见；装备、绿植、荣誉等默认仅好友可见。邮箱、手机号、身份信息和登录设备始终不公开。</p>
      <h2>保存与权利</h2>
      <p>业务数据按提供服务所需期限保存，网络安全与争议记录按适用要求隔离保存。用户可以访问、更正、调整公开范围、退出设备或申请注销账号。</p>
      <ComplianceNav />
    </main>
  );
}

export function CommunityTermsOfServicePage(): JSX.Element {
  return (
    <main className="compliance-page">
      <h1>服务条款</h1>
      <p>版本：{COMMUNITY_LEGAL_VERSIONS.terms}</p>
      <p>注册并使用{SITE_NAME}社区版，表示你按注册页分别确认本条款、隐私政策、社区规范和成年声明。</p>
      <h2>账号</h2>
      <ul>
        <li>Beta 阶段需要有效准入码，并完成邮箱验证。</li>
        <li>请保护登录凭据，不得转让、批量注册或冒用他人身份。</li>
        <li>昵称和资料不得冒充官方机构、新闻媒体或认证专业人士。</li>
      </ul>
      <h2>服务边界</h2>
      <p>功能按发布闸门逐步开放。办公室乐斗职业仅是虚构玩法，不代表对现实职业、能力或身份的评价。匿名试玩奖励不能迁移为正式账号资产。</p>
      <h2>处置与申诉</h2>
      <p>对危害安全、骚扰、诈骗、批量刷取或绕过限制的行为，平台可以限制发布、暂停社交、停用或封禁账号。受限账号仍可在允许范围内查看原因并提出申诉。</p>
      <h2>注销</h2>
      <p>注销前会说明主页、内容、好友、绿植和乐斗资产影响，并提供 7 天冷静期。争议证据和法定记录不会因注销被不当删除。</p>
      <ComplianceNav />
    </main>
  );
}

export function CommunityGuidelinesPage(): JSX.Element {
  return (
    <main className="compliance-page">
      <h1>社区规范</h1>
      <p>版本：{COMMUNITY_LEGAL_VERSIONS.communityGuidelines}</p>
      <p>经验交流用于分享可核验的方法、项目复盘和善意职业交流。每位用户都应为自己发布的内容负责。</p>
      <h2>鼓励</h2>
      <ul>
        <li>说明背景、约束、做法和结果，区分事实与个人经验。</li>
        <li>尊重不同岗位，不以乐斗职业标签评价现实中的个人。</li>
        <li>引用可靠来源，不转载无权发布的完整内容。</li>
      </ul>
      <h2>禁止</h2>
      <ul>
        <li>诈骗、色情、仇恨、严重骚扰、威胁、违法交易和恶意引流。</li>
        <li>泄露真实姓名、电话、精确地址、公司内部秘密或他人账号信息。</li>
        <li>批量灌水、操纵热度、绕过拉黑或利用多个账号刷取奖励。</li>
      </ul>
      <h2>举报与审核</h2>
      <p>内容和互动功能开放后会提供举报入口。高风险内容可先审后发或立即隐藏，并保留必要证据快照与审计记录。</p>
      <ComplianceNav />
    </main>
  );
}
