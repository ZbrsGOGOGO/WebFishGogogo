// packages/frontend/src/features/compliance/PrivacyPolicyPage.tsx
// 隐私政策页面（公开、无需登录）：满足上线/应用审核的合规要求（Req 13.2, 13.5）。

import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  IS_REVIEW_MODE,
  SITE_CONTACT,
  SITE_NAME,
  SITE_OPERATOR,
  contactHref,
} from '../../app/site-config';

export interface PrivacyPolicyPageProps {
  reviewMode?: boolean;
}

/**
 * 隐私政策页面。
 *
 * 需求追溯：
 * - Req 13.2：THE Reader_System SHALL 提供可访问的隐私政策页面。
 * - Req 13.5：WHEN 用户访问任意合规页面, THE Compliance_Pages SHALL 返回对应的政策内容。
 *
 * 说明：本产品为自托管的个人阅读应用，仅处理用户自有、合法拥有的文本内容。
 * 下列条款为通用基线模板，部署方应结合自身主体信息、司法辖区与实际数据处理流程复核后使用。
 */
export function PrivacyPolicyPage({
  reviewMode = IS_REVIEW_MODE,
}: PrivacyPolicyPageProps = {}): JSX.Element {
  const lastUpdated = '2026-08-06';
  const contactLink = contactHref();

  if (reviewMode) {
    return (
      <main aria-labelledby="privacy-policy-title" className="compliance-page">
        <p><Link to="/">← 返回站点首页</Link></p>
        <h1 id="privacy-policy-title">隐私政策</h1>
        <p><em>最近更新：{lastUpdated}</em></p>

        <p>
          本政策说明{SITE_OPERATOR}运营的{SITE_NAME}在当前上线审核阶段如何处理信息。
          当前版本仅提供站点说明、隐私政策与服务条款，不开放账户注册、登录、内容上传、互动、支付或信息发布功能。
        </p>

        <h2>1. 当前收集的信息</h2>
        <p>
          当前审核版本不收集账户资料、用户上传内容、支付信息或个性化偏好。服务器可能为保障安全与稳定记录必要的访问日志，
          包括访问时间、请求地址、网络地址和浏览器基本信息。
        </p>

        <h2>2. 信息使用目的</h2>
        <ul>
          <li>保障页面正常访问，识别异常请求与网络攻击。</li>
          <li>排查服务故障，维护站点安全和稳定。</li>
          <li>依法配合有权机关提出的合法要求。</li>
        </ul>

        <h2>3. Cookie、统计与第三方服务</h2>
        <p>
          当前审核版本不使用广告、第三方行为分析、个性化推荐或跨站跟踪服务，也不通过 Cookie 建立用户画像。
        </p>

        <h2>4. 保存、共享与安全</h2>
        <p>
          必要的安全日志仅在实现安全运营所需的最短期限内保存。除法律法规另有规定或有权机关依法要求外，
          我们不会出售、出租或向第三方提供访问日志中的个人信息。我们采取访问控制、传输加密和最小权限等措施保护信息。
        </p>

        <h2>5. 您的权利</h2>
        <p>
          您可以就个人信息的查阅、更正、删除、限制处理或政策问题联系我们。我们将在核验身份后依法处理合理请求。
        </p>

        <h2>6. 未成年人保护</h2>
        <p>
          当前审核版本不提供注册或互动功能，也不以未成年人为特定服务对象。正式服务开放前将根据实际功能补充相应保护措施。
        </p>

        <h2>7. 政策更新与联系</h2>
        <p>服务功能或数据处理方式发生变化时，我们会更新本政策并标明日期。</p>
        <p>
          联系方式：{contactLink ? <a href={contactLink}>{SITE_CONTACT}</a> : SITE_CONTACT}
        </p>

        <nav aria-label="合规页面导航">
          <p>另见：<Link to="/terms-of-service">服务条款</Link></p>
        </nav>
      </main>
    );
  }

  return (
    <main aria-labelledby="privacy-policy-title" className="compliance-page">
      <h1 id="privacy-policy-title">隐私政策</h1>
      <p>
        <em>最近更新：{lastUpdated}</em>
      </p>

      <p>
        本隐私政策说明 ZBRS 技术工具工坊（以下简称"本应用"）在您使用服务过程中如何收集、使用、存储与保护您的个人信息。
        本应用是自托管的技术工具与私人文档平台；阅读功能仅用于处理您<strong>自有且合法拥有</strong>的文本内容。请在使用前仔细阅读本政策。
      </p>

      <h2>1. 我们收集的信息</h2>
      <ul>
        <li>
          <strong>账户信息：</strong>注册与登录时提供的邮箱及加盐哈希后的密码（本应用不以明文形式存储密码）。
        </li>
        <li>
          <strong>用户上传内容：</strong>您主动上传的文本文档及其解析后生成的章节数据。这些内容仅归属于您本人。
        </li>
        <li>
          <strong>阅读与偏好数据：</strong>阅读进度、书签、便签、界面偏好（字号、行距、主题、皮肤、老板键、职业等）。
        </li>
        <li>
          <strong>必要的技术数据：</strong>为保障服务安全与可用性所需的会话与访问日志。
        </li>
      </ul>

      <h2>2. 我们如何使用信息</h2>
      <ul>
        <li>提供核心功能：文档管理、阅读渲染、进度与书签的保存与恢复。</li>
        <li>保存并同步您的个性化偏好设置。</li>
        <li>保障账户与内容的访问安全，执行归属鉴权，防止越权访问。</li>
      </ul>

      <h2>3. 信息的存储与安全</h2>
      <p>
        您的密码以加盐哈希形式存储。文档内容与阅读数据仅对其归属用户可见，本应用对所有内容访问接口执行归属鉴权校验，
        拒绝任何越权访问请求。作为自托管应用，数据存储于部署方所控制的服务器与对象存储中。
      </p>

      <h2>4. 信息的共享</h2>
      <p>
        本应用不会将您的个人信息或上传内容出售、出租或以其他方式向第三方披露，法律法规另有强制规定或经您明确同意的情形除外。
      </p>

      <h2>5. 您的权利</h2>
      <ul>
        <li>您可以随时浏览、搜索与删除您上传的文档。</li>
        <li>您可以修改个人偏好设置。</li>
        <li>您可以联系部署方请求访问、更正或删除您的个人数据。</li>
      </ul>

      <h2>6. 内容合规</h2>
      <p>
        本应用仅供处理用户自有、合法拥有的内容。上传内容的合法性由上传用户负责。本应用明确排除盗版内容分发、
        赌博/博彩及任何违法用途。
      </p>

      <h2>7. 政策的变更</h2>
      <p>
        我们可能会不时更新本隐私政策。更新后的政策将在本页面发布，并注明最近更新日期。
      </p>

      <h2>8. 联系我们</h2>
      <p>
        如对本隐私政策有任何疑问，请通过部署方公示的联系方式与我们联系。
      </p>

      <nav aria-label="合规页面导航">
        <p>
          另见：<Link to="/terms-of-service">服务条款</Link>
        </p>
      </nav>
    </main>
  );
}
