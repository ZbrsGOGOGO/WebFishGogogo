import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  SITE_CONTACT,
  SITE_NAME,
  SITE_OPERATOR,
  contactHref,
} from '../../app/site-config';

export function ReviewPrivacyPolicyPage(): JSX.Element {
  const contactLink = contactHref();

  return (
    <main aria-labelledby="privacy-policy-title" className="compliance-page">
      <p><Link to="/">← 返回站点首页</Link></p>
      <h1 id="privacy-policy-title">隐私政策</h1>
      <p><em>最近更新：2026-08-06</em></p>

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
      <p>当前审核版本不使用广告、第三方行为分析、个性化推荐或跨站跟踪服务，也不通过 Cookie 建立用户画像。</p>

      <h2>4. 保存、共享与安全</h2>
      <p>
        必要的安全日志仅在实现安全运营所需的最短期限内保存。除法律法规另有规定或有权机关依法要求外，
        我们不会出售、出租或向第三方提供访问日志中的个人信息。我们采取访问控制、传输加密和最小权限等措施保护信息。
      </p>

      <h2>5. 您的权利</h2>
      <p>您可以就个人信息的查阅、更正、删除、限制处理或政策问题联系我们。我们将在核验身份后依法处理合理请求。</p>

      <h2>6. 未成年人保护</h2>
      <p>当前审核版本不提供注册或互动功能，也不以未成年人为特定服务对象。正式服务开放前将根据实际功能补充相应保护措施。</p>

      <h2>7. 政策更新与联系</h2>
      <p>服务功能或数据处理方式发生变化时，我们会更新本政策并标明日期。</p>
      <p>联系方式：{contactLink ? <a href={contactLink}>{SITE_CONTACT}</a> : SITE_CONTACT}</p>

      <nav aria-label="合规页面导航">
        <p>另见：<Link to="/terms-of-service">服务条款</Link></p>
      </nav>
    </main>
  );
}
