import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  SITE_CONTACT,
  SITE_NAME,
  SITE_OPERATOR,
  contactHref,
} from '../../app/site-config';

export function ReviewTermsOfServicePage(): JSX.Element {
  const contactLink = contactHref();

  return (
    <main aria-labelledby="terms-of-service-title" className="compliance-page">
      <p><Link to="/">← 返回站点首页</Link></p>
      <h1 id="terms-of-service-title">服务条款</h1>
      <p><em>最近更新：2026-08-06</em></p>

      <p>本页面适用于{SITE_OPERATOR}运营的{SITE_NAME}上线审核版本。访问本网站即表示您已阅读并理解以下说明。</p>

      <h2>1. 当前服务范围</h2>
      <p>
        当前版本仅展示站点规划、合规状态及公开政策，不提供账户注册、登录、内容上传、互动、支付、广告或用户信息发布服务。
        页面所述规划不构成对未来功能或上线时间的承诺。
      </p>

      <h2>2. 访问规则</h2>
      <ul>
        <li>不得以自动化攻击、漏洞利用或其他方式破坏网站安全与稳定。</li>
        <li>不得冒用本站名义从事违法活动或发布虚假信息。</li>
        <li>不得绕过当前功能限制访问未开放的业务接口。</li>
      </ul>

      <h2>3. 知识产权</h2>
      <p>本网站的软件、界面、标识与文字内容由相应权利人依法享有权利。未经许可，不得复制、篡改或用于误导性商业宣传。</p>

      <h2>4. 服务状态与责任</h2>
      <p>
        当前为上线准备阶段，网站可能因审核、安全检查或维护暂时不可访问。我们会在适用法律要求的范围内承担责任，
        不排除或限制依法不得排除或限制的责任。
      </p>

      <h2>5. 条款更新</h2>
      <p>正式功能开放前，我们会根据实际服务范围更新本条款、隐私政策与必要的用户规则，并在页面标明最近更新日期。</p>

      <h2>6. 联系我们</h2>
      <p>联系方式：{contactLink ? <a href={contactLink}>{SITE_CONTACT}</a> : SITE_CONTACT}</p>

      <nav aria-label="合规页面导航">
        <p>另见：<Link to="/privacy-policy">隐私政策</Link></p>
      </nav>
    </main>
  );
}
