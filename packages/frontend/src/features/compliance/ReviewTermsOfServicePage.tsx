import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { SITE_NAME } from '../../app/site-config';

export function ReviewTermsOfServicePage(): JSX.Element {
  return (
    <main aria-labelledby="terms-of-service-title" className="compliance-page">
      <p><Link to="/">← 返回站点首页</Link></p>
      <h1 id="terms-of-service-title">服务条款</h1>
      <p><em>最近更新：2026-08-06</em></p>

      <p>本页面适用于{SITE_NAME}。访问和使用本网站即表示您已阅读并理解以下说明。</p>

      <h2>1. 服务范围</h2>
      <p>
        本网站提供产品与功能介绍、在线效率工具、隐私政策和服务条款等公开内容。
        页面中有关产品方向的说明，不构成对具体功能或更新时间的承诺。
      </p>

      <h2>2. 访问规则</h2>
      <ul>
        <li>不得以自动化攻击、漏洞利用或其他方式破坏网站安全与稳定。</li>
        <li>不得冒用本站名义从事违法活动或发布虚假信息。</li>
        <li>不得尝试访问未公开的系统接口，或干扰网站正常运行。</li>
      </ul>

      <h2>3. 知识产权</h2>
      <p>本网站的软件、界面、标识与文字内容由相应权利人依法享有权利。未经许可，不得复制、篡改或用于误导性商业宣传。</p>

      <h2>4. 服务状态与责任</h2>
      <p>
        网站可能因系统维护、安全防护、网络故障或不可抗力暂时无法访问。我们会在适用法律要求的范围内承担责任，
        不排除或限制依法不得排除或限制的责任。
      </p>

      <h2>5. 条款更新</h2>
      <p>我们会根据实际服务范围更新本条款、隐私政策与必要的使用规则，并在页面标明最近更新日期。</p>

      <nav aria-label="网站页面导航">
        <p>另见：<Link to="/privacy-policy">隐私政策</Link></p>
      </nav>
    </main>
  );
}
