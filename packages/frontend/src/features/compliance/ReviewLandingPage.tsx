import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  SITE_CONTACT,
  SITE_DOMAIN,
  SITE_NAME,
  SITE_OPERATOR,
  contactHref,
} from '../../app/site-config';
import styles from './ReviewLandingPage.module.css';

const scopeItems = [
  {
    mark: '文',
    title: '个人文本整理',
    description: '帮助用户整理本人合法拥有的文本资料，并保存个人阅读进度。',
  },
  {
    mark: '工',
    title: '实用效率工具',
    description: '提供文本、时间与常用数据处理等轻量工具，不涉及交易或付费服务。',
  },
  {
    mark: '闲',
    title: '轻量休闲互动',
    description: '规划提供无充值、无提现、无概率付费的单机休闲功能。',
  },
] as const;

const statusItems = [
  ['站点介绍', '已开放'],
  ['隐私政策与服务条款', '已开放'],
  ['账户注册与登录', '审核期间关闭'],
  ['内容上传与互动功能', '审核期间关闭'],
] as const;

export function ReviewLandingPage(): JSX.Element {
  const contactLink = contactHref();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} to="/" aria-label={`${SITE_NAME}首页`}>
          <span className={styles.brandMark} aria-hidden="true">Z</span>
          <span>
            <strong>{SITE_NAME}</strong>
            <small>上线准备页</small>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="公开页面">
          <Link to="/privacy-policy">隐私政策</Link>
          <Link to="/terms-of-service">服务条款</Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="review-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>当前为合规审核版本</span>
          <h1 id="review-title">让个人资料与常用工具，保持简单、清楚、可控</h1>
          <p>
            {SITE_NAME}是一款面向个人用户的轻量效率工作台，规划提供文本整理、实用工具与轻量休闲互动功能。
            当前处于上线准备阶段，仅开放站点说明与合规页面。
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} to="/privacy-policy">查看隐私政策</Link>
            <Link className={styles.secondaryAction} to="/terms-of-service">查看服务条款</Link>
          </div>
        </div>

        <aside className={styles.reviewCard} aria-label="审核状态">
          <span className={styles.statusDot} aria-hidden="true" />
          <strong>审核材料已就绪</strong>
          <p>注册、上传、互动与全部业务接口均暂未开放。</p>
          <dl>
            <div>
              <dt>运营性质</dt>
              <dd>当前为非经营性展示</dd>
            </div>
            <div>
              <dt>收费与交易</dt>
              <dd>不提供</dd>
            </div>
            <div>
              <dt>用户信息发布</dt>
              <dd>不提供</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={styles.section} aria-labelledby="scope-title">
        <div className={styles.sectionHeading}>
          <span>站点规划</span>
          <h2 id="scope-title">清晰、有限的产品范围</h2>
          <p>正式功能仅会在备案、安全检查和运营准备完成后开放。</p>
        </div>
        <div className={styles.scopeGrid}>
          {scopeItems.map((item) => (
            <article className={styles.scopeCard} key={item.title}>
              <span className={styles.scopeMark} aria-hidden="true">{item.mark}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.statusSection}`} aria-labelledby="status-title">
        <div className={styles.sectionHeading}>
          <span>当前开放状态</span>
          <h2 id="status-title">审核期间只提供必要公开信息</h2>
        </div>
        <div className={styles.statusList}>
          {statusItems.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong data-open={value === '已开放'}>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.operator} aria-labelledby="operator-title">
        <div>
          <span>运营信息</span>
          <h2 id="operator-title">公开、可核验的站点信息</h2>
        </div>
        <dl>
          <div>
            <dt>网站主办者</dt>
            <dd>{SITE_OPERATOR}</dd>
          </div>
          {SITE_DOMAIN ? (
            <div>
              <dt>网站域名</dt>
              <dd>{SITE_DOMAIN}</dd>
            </div>
          ) : null}
          <div>
            <dt>联系渠道</dt>
            <dd>
              {contactLink ? <a href={contactLink}>{SITE_CONTACT}</a> : SITE_CONTACT}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
