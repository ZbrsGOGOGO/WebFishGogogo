import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { SITE_NAME } from '../../app/site-config';
import styles from './ReviewLandingPage.module.css';

const scopeItems = [
  {
    mark: '文',
    title: '文本处理',
    description: '提供文本整理、字数统计等浏览器本地工具，输入内容不会上传。',
  },
  {
    mark: '数',
    title: '数据格式',
    description: '快速格式化与校验 JSON，并完成常用颜色格式转换。',
  },
  {
    mark: '时',
    title: '时间日期',
    description: '完成时间戳转换、日期间隔计算与日期加减。',
  },
] as const;

export function ReviewLandingPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} to="/" aria-label={`${SITE_NAME}首页`}>
          <span className={styles.brandMark} aria-hidden="true">Z</span>
          <span>
            <strong>{SITE_NAME}</strong>
            <small>个人效率工作台</small>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="公开页面">
          <Link to="/tools">实用工具</Link>
          <Link to="/privacy-policy">隐私政策</Link>
          <Link to="/terms-of-service">服务条款</Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="review-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>轻量个人效率工作台</span>
          <h1 id="review-title">让个人资料与常用工具，保持简单、清楚、可控</h1>
          <p>
            {SITE_NAME}面向个人日常使用场景，从文本整理与常用工具出发，
            持续打磨简单、清楚、可控的轻量体验。
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} to="/tools">打开实用工具</Link>
            <Link className={styles.secondaryAction} to="/privacy-policy">查看隐私政策</Link>
          </div>
        </div>

        <aside className={styles.reviewCard} aria-label="服务说明">
          <span className={styles.statusDot} aria-hidden="true" />
          <strong>简单、实用、克制</strong>
          <p>围绕个人文本与日常效率场景，持续完善清晰、易用的轻量功能。</p>
          <dl>
            <div>
              <dt>服务定位</dt>
              <dd>个人效率工具</dd>
            </div>
            <div>
              <dt>使用体验</dt>
              <dd>轻量、直观</dd>
            </div>
            <div>
              <dt>产品原则</dt>
              <dd>清晰、可控</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={styles.section} aria-labelledby="scope-title">
        <div className={styles.sectionHeading}>
          <span>工具能力</span>
          <h2 id="scope-title">现在就能使用的轻量工具</h2>
          <p>无需注册或登录，打开工具即可在浏览器内完成处理。</p>
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

    </main>
  );
}
