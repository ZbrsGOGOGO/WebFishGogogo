import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { SITE_NAME } from '../../app/site-config';
import styles from './ReviewLandingPage.module.css';

const scopeItems = [
  {
    mark: '文',
    title: '文本与数据工具',
    description:
      '整理文本、统计字数、格式化 JSON；所有输入只在当前浏览器内处理。',
  },
  {
    mark: '时',
    title: '时间与颜色转换',
    description:
      '完成时间戳、日期间隔与常用颜色格式转换，打开页面即可使用。',
  },
  {
    mark: '玩',
    title: '轻量单机游戏',
    description:
      '提供贪食蛇、方块消除等无需账户的单机玩法，不含充值、提现或概率付费。',
  },
] as const;

export function PublicLandingPage(): JSX.Element {
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
          <Link to="/games">轻量游戏</Link>
          <Link to="/privacy-policy">隐私政策</Link>
          <Link to="/terms-of-service">服务条款</Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="public-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>轻量个人效率工作台</span>
          <h1 id="public-title">常用工具与轻松一刻，打开就能用</h1>
          <p>
            {SITE_NAME}提供浏览器本地效率工具和轻量单机游戏。
            无需注册登录，工具内容与游戏过程不会上传到本站服务器。
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} to="/tools">打开实用工具</Link>
            <Link className={styles.secondaryAction} to="/games">进入游戏中心</Link>
          </div>
        </div>

        <aside className={styles.reviewCard} aria-label="服务特点">
          <span className={styles.statusDot} aria-hidden="true" />
          <strong>简单、直接、轻量</strong>
          <p>将计算和游戏尽量留在浏览器里，减少等待，也减少不必要的数据处理。</p>
          <dl>
            <div>
              <dt>实用工具</dt>
              <dd>6 款</dd>
            </div>
            <div>
              <dt>单机游戏</dt>
              <dd>4 款</dd>
            </div>
            <div>
              <dt>账户要求</dt>
              <dd>无需账户</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={styles.section} aria-labelledby="scope-title">
        <div className={styles.sectionHeading}>
          <span>当前功能</span>
          <h2 id="scope-title">效率与休闲，保持清楚的边界</h2>
          <p>工具在浏览器中完成计算；游戏为单机玩法，不提供交易或用户间互动。</p>
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
