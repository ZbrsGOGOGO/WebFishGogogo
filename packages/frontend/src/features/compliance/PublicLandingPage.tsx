import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { IS_PUBLIC_MODE, SITE_NAME } from '../../app/site-config';
import { PROFESSION_DEFINITIONS } from '../office-battle/office-battle-domain';
import styles from './ReviewLandingPage.module.css';

const systems = [
  {
    id: 'home',
    mark: '首',
    title: '首页',
    eyebrow: '每日总览',
    description: '把今日热点、好友动态、成长进度和快捷入口放在同一页。',
    path: '/',
    available: true,
    tone: 'violet',
  },
  {
    id: 'news',
    mark: '热',
    title: '热点新闻',
    eyebrow: '行业速览',
    description: '按职业筛选技术、产品、测试、销售与人力领域的可靠资讯。',
    path: '/news',
    available: COMMUNITY_FEATURE_FLAGS.news,
    tone: 'orange',
  },
  {
    id: 'community',
    mark: '享',
    title: '经验交流',
    eyebrow: '职业社区',
    description: '分享方法、复盘项目、收藏有用回答，并建立内容治理机制。',
    path: '/community',
    available: COMMUNITY_FEATURE_FLAGS.community || COMMUNITY_FEATURE_FLAGS.chat,
    tone: 'cyan',
  },
  {
    id: 'farm',
    mark: '农',
    title: '农场',
    eyebrow: '工位绿植',
    description: '简化成一键照料与离线成长，不让种植步骤变成负担。',
    path: '/farm',
    available: COMMUNITY_FEATURE_FLAGS.farm,
    tone: 'green',
  },
  {
    id: 'ledou',
    mark: '斗',
    title: '乐斗',
    eyebrow: '办公室项目攻防',
    description: '选择职业、搭配六件装备，观看十回合内结束的自动战斗。',
    path: '/ledou',
    available: COMMUNITY_FEATURE_FLAGS.ledou,
    tone: 'rose',
  },
  {
    id: 'feed',
    mark: '喂',
    title: '投喂',
    eyebrow: '同事补给',
    description: '给好友送咖啡、零食与士气，不出售概率道具或付费奖励。',
    path: '/feed',
    available: COMMUNITY_FEATURE_FLAGS.feed,
    tone: 'orange',
  },
  {
    id: 'invite',
    mark: '邀',
    title: '邀请',
    eyebrow: '组建小队',
    description: '邀请真实好友加入职业小队，奖励以防刷和真实关系为前提。',
    path: '/invite',
    available: COMMUNITY_FEATURE_FLAGS.invite,
    tone: 'blue',
  },
  {
    id: 'profile',
    mark: '我',
    title: '我的主页',
    eyebrow: '职业档案',
    description: '展示职业、装备、荣誉与内容收藏，并由自己控制公开范围。',
    path: '/me',
    available: !IS_PUBLIC_MODE && COMMUNITY_FEATURE_FLAGS.profile,
    tone: 'violet',
  },
  {
    id: 'friends',
    mark: '友',
    title: '好友',
    eyebrow: '同事关系',
    description: '支持邀请、投喂和异步挑战，先完成隐私、拉黑与举报能力。',
    path: '/friends',
    available: COMMUNITY_FEATURE_FLAGS.friends,
    tone: 'cyan',
  },
] as const;

export function PublicLandingPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="public-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>ZBRS · 办公室轻社区</span>
          <h1 id="public-title">把工作里的角色，带进一个更有意思的办公室世界</h1>
          <p>
            {SITE_NAME}正在从工具站升级为办公室主题社区。
            你可以选择自己的职业，用装备构筑角色，在短时乐斗、轻量农场和好友互动中持续成长。
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} to="/ledou">开始办公室乐斗</Link>
            <Link className={styles.secondaryAction} to="/tools">先用一个工具</Link>
          </div>
        </div>

        <aside className={styles.reviewCard} aria-label="乐斗试玩说明">
          <span className={styles.statusDot} aria-hidden="true" />
          <strong>第一条可玩循环已经开始</strong>
          <p>选职业 → 看装备 → 挑对手 → 读战报 → 换上新装备，单局约半分钟。</p>
          <dl>
            <div><dt>战斗职业</dt><dd>5 种</dd></div>
            <div><dt>装备位置</dt><dd>6 个</dd></div>
            <div><dt>最长战斗</dt><dd>10 回合</dd></div>
          </dl>
        </aside>
      </section>

      <section id="product-map" className={styles.section} aria-labelledby="systems-title">
        <div className={styles.sectionHeading}>
          <span>产品地图</span>
          <h2 id="systems-title">九个系统，围绕职业、成长和好友展开</h2>
          <p>
            {IS_PUBLIC_MODE
              ? '首页和乐斗提供公开体验，其余系统会在社区版通过各自发布闸门后开放。'
              : '卡片状态与当前发布闸门同步；已开放系统可直接进入，账号功能会在进入后安全校验。'}
          </p>
        </div>
        <div className={styles.systemGrid}>
          {systems.map((system) => {
            const content = (
              <>
                <div className={styles.systemTopline}>
                  <span className={styles.systemMark} aria-hidden="true">{system.mark}</span>
                  <small>{system.eyebrow}</small>
                </div>
                <h3>{system.title}</h3>
                <p>{system.description}</p>
                <strong>{system.available ? '进入系统 →' : '已纳入产品路线'}</strong>
              </>
            );
            return system.available && system.path ? (
              <Link
                id={`system-${system.id}`}
                className={styles.systemCard}
                data-tone={system.tone}
                to={system.path}
                key={system.id}
              >
                {content}
              </Link>
            ) : (
              <article
                id={`system-${system.id}`}
                className={styles.systemCard}
                data-tone={system.tone}
                key={system.id}
              >
                {content}
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="career-title">
        <div className={styles.sectionHeading}>
          <span>职业方向</span>
          <h2 id="career-title">五种办公室职业，各有自己的战斗节奏</h2>
          <p>职业决定基础能力和专属行动，装备决定你如何把优势放大。</p>
        </div>
        <div className={styles.careerGrid}>
          {PROFESSION_DEFINITIONS.map((profession) => (
            <article key={profession.id}>
              <span aria-hidden="true">{profession.mark}</span>
              <small>{profession.shortName}</small>
              <h3>{profession.name}</h3>
              <p>{profession.slogan}</p>
              <strong>{profession.skillName}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.utilityStrip} aria-label="现有公开内容">
        <div>
          <strong>工作台仍然保留</strong>
          <p>11 款浏览器工具与轻量小游戏继续作为社区里的实用角落。</p>
        </div>
        <nav aria-label="实用内容入口">
          <Link to="/tools">打开工具箱</Link>
          <Link to="/games">进入小游戏</Link>
        </nav>
      </section>
    </main>
  );
}
