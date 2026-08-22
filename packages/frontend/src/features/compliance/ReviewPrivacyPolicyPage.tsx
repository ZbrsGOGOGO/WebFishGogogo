import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  SITE_CONTACT,
  SITE_NAME,
  SITE_OPERATOR,
  contactHref,
} from '../../app/site-config';

export interface ReviewPrivacyPolicyPageProps {
  includeGames?: boolean;
}

export function ReviewPrivacyPolicyPage({
  includeGames = false,
}: ReviewPrivacyPolicyPageProps): JSX.Element {
  const privacyDisclosureReady = Boolean(SITE_OPERATOR && SITE_CONTACT);
  const privacyContactHref = contactHref(SITE_CONTACT);

  return (
    <main aria-labelledby="privacy-policy-title" className="compliance-page">
      <p><Link to="/">← 返回站点首页</Link></p>
      <h1 id="privacy-policy-title">隐私政策</h1>
      <p><em>最近更新：2026-08-22</em></p>

      <p>
        本政策说明您访问{SITE_NAME}时，网站如何处理与保护相关信息。
        {includeGames
          ? '本网站提供公开内容、浏览器本地效率工具、轻量单机游戏和办公室乐斗试玩，不要求用户注册账户，也不提供在线支付或个性化推荐。'
          : '本网站提供公开内容浏览和浏览器本地运行的在线效率工具，不要求用户注册账户，也不提供在线支付或个性化推荐。'}
      </p>

      {privacyDisclosureReady ? (
        <section aria-labelledby="privacy-controller-title">
          <h2 id="privacy-controller-title">个人信息处理者与联系方法</h2>
          <p>个人信息处理者：{SITE_OPERATOR}</p>
          <p>
            个人信息权利请求：
            {privacyContactHref ? (
              <a href={privacyContactHref}>{SITE_CONTACT}</a>
            ) : (
              SITE_CONTACT
            )}
          </p>
        </section>
      ) : null}

      <h2>1. 我们处理的信息</h2>
      {includeGames ? (
        <p>
          本网站不会主动收集账户资料、工具输入、游戏过程、支付信息或个性化偏好。当前公开版的 Web 与网关容器不持久化常规应用日志，
          Nginx 也不记录访问日志；网络地址等连接信息仅在处理当前请求时短暂经过本站应用，响应完成后不写入本站应用日志文件。
        </p>
      ) : (
        <p>
          本网站不会主动收集账户资料、工具输入、游戏过程、支付信息或个性化偏好。服务器可能为保障安全与稳定记录必要的访问日志，
          包括访问时间、请求地址、网络地址和浏览器基本信息。
        </p>
      )}
      <p>您在在线工具中输入的文本、JSON、日期、颜色等数据仅在当前浏览器内处理，不会发送到本站服务器。</p>
      {includeGames ? (
        <p>
          部分单机游戏会使用浏览器本地存储保存最高分；办公室乐斗会在本机保存所选职业、
          六个装备位、等级和试玩胜负记录。这些记录不会上传到本站服务器，
          您可以通过浏览器的网站数据设置随时删除。
        </p>
      ) : null}

      <h2>2. 信息使用目的</h2>
      <ul>
        <li>保障页面正常访问，识别异常请求与网络攻击。</li>
        <li>排查服务故障，维护站点安全和稳定。</li>
        <li>依法配合有权机关提出的合法要求。</li>
      </ul>

      <h2>3. Cookie{includeGames ? '、本地存储' : ''}与第三方服务</h2>
      <p>
        本网站不使用广告、第三方行为分析、个性化推荐或跨站跟踪服务，也不通过 Cookie 建立用户画像。
        {includeGames
          ? '浏览器本地存储仅用于保存部分单机游戏记录和办公室乐斗试玩进度。'
          : null}
      </p>

      <h2>4. 保存、共享与安全</h2>
      {includeGames ? (
        <p>
          当前公开版本的常规访问日志保存期限为 0 天：Web 与网关容器均禁用日志持久化，Nginx 也关闭访问日志；
          网络地址等连接信息在请求完成后不写入本站应用日志文件。域名解析、证书签发、网络运营商或云基础设施提供者可能依法独立处理相关数据，
          其处理不属于本站应用日志；如本站今后需要另行留存日志，将在启用前更新本政策并设置明确期限。
        </p>
      ) : (
        <p>
          必要日志按文件容量轮转：每个服务实例最多保留 5 个、每个不超过 10MB 的日志文件，
          达到上限后自动覆盖最早记录；安全事件调查或法律法规另有要求的除外。除法律法规另有规定或有权机关依法要求外，
          我们不会出售、出租或向第三方提供访问日志中的个人信息。我们采取访问控制、传输加密和最小权限等措施保护信息。
        </p>
      )}

      <h2>5. 您的权利</h2>
      <p>
        您可以通过本页列明的“个人信息权利请求”渠道，申请查阅、更正、删除、限制处理个人信息，
        或咨询本政策。我们将在核验身份后依法处理合理请求。
      </p>

      <h2>6. 未成年人保护</h2>
      <p>本网站不以未成年人为特定服务对象。未成年人应在监护人指导下浏览和使用网站内容。</p>

      <h2>7. 政策更新</h2>
      <p>服务功能或数据处理方式发生变化时，我们会更新本政策并标明日期。</p>

      <nav aria-label="网站页面导航">
        <p>另见：<Link to="/terms-of-service">服务条款</Link></p>
      </nav>
    </main>
  );
}
