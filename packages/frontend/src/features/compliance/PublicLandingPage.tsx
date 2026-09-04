import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import { IS_PUBLIC_MODE, SITE_NAME } from '../../app/site-config';
import styles from './ReviewLandingPage.module.css';

const defenseRoster = [
  {
    id: 'hero',
    mark: '人',
    name: '工位守卫',
    shortName: '唯一角色',
    description: '用方向键或 WASD 移动，自动攻击附近稽查，关键时刻释放专注脉冲。',
    action: '移动 · 自动攻击',
  },
  {
    id: 'stapler',
    mark: '订',
    name: '订书机',
    shortName: '单体塔',
    description: '便宜稳定，持续盯住单个目标，是最容易补齐的基础火力。',
    action: '稳定单体输出',
  },
  {
    id: 'coffee',
    mark: '咖',
    name: '咖啡机',
    shortName: '减速塔',
    description: '让路过的稽查慢下来，为角色和其他办公用品争取更多输出时间。',
    action: '范围减速',
  },
  {
    id: 'printer',
    mark: '印',
    name: '打印机',
    shortName: '范围塔',
    description: '用范围伤害清理扎堆的小股稽查，造价高但能稳住拥堵路段。',
    action: '范围伤害',
  },
] as const;

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
    id: 'tower-defense',
    mark: '守',
    title: '工位塔防',
    eyebrow: '摸鱼升职记',
    description: '移动一个工位守卫，用三种办公用品挡住沿固定路线来袭的稽查。',
    path: '/tower-defense',
    available: COMMUNITY_FEATURE_FLAGS.towerDefense,
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
    description: '展示社区职业、系统头像、荣誉与内容收藏，并由自己控制公开范围。',
    path: '/me',
    available: !IS_PUBLIC_MODE && COMMUNITY_FEATURE_FLAGS.profile,
    tone: 'violet',
  },
  {
    id: 'friends',
    mark: '友',
    title: '好友',
    eyebrow: '同事关系',
    description: '支持精确查找、好友申请、实时私聊、拉黑与举报。',
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
          <span className={styles.eyebrow}>摸摸公司 · 摸鱼成长社区</span>
          <h1 id="public-title">把工作里的角色，带进一个更有意思的办公室世界</h1>
          <p>
            {SITE_NAME}正在从工具站升级为办公室主题社区。
            在“摸鱼升职记”里，你会带着自己的角色布置办公用品，守住核心工位；也可以照料绿植、使用工具和认识同事。
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} to="/tower-defense">开始工位塔防</Link>
            <Link className={styles.secondaryAction} to="/tools">先用一个工具</Link>
          </div>
        </div>

        <aside className={styles.reviewCard} aria-label="工位塔防试玩说明">
          <span className={styles.statusDot} aria-hidden="true" />
          <strong>摸鱼升职记的第一条可玩循环</strong>
          <p>布塔 → 移动角色 → 自动迎敌 → 升级防线 → 守住三波，单局约 1～3 分钟。</p>
          <dl>
            <div><dt>场上角色</dt><dd>1 个</dd></div>
            <div><dt>办公用品塔</dt><dd>3 种</dd></div>
            <div><dt>本次稽查</dt><dd>3 波</dd></div>
          </dl>
        </aside>
      </section>

      <section id="product-map" className={styles.section} aria-labelledby="systems-title">
        <div className={styles.sectionHeading}>
          <span>产品地图</span>
          <h2 id="systems-title">九个系统，围绕职业、成长和好友展开</h2>
          <p>
            {IS_PUBLIC_MODE
              ? '首页和工位塔防可以直接体验，更多社区功能会陆续与大家见面。'
              : '选择你感兴趣的系统直接进入；需要保存成长进度的功能会请你先登录。'}
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
                <strong>{system.available ? '进入系统 →' : '敬请期待'}</strong>
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
          <span>第一版阵容</span>
          <h2 id="career-title">一个角色，三种办公用品</h2>
          <p>角色负责走位与补伤害，防御塔自动迎敌；不用盯屏，也能随时暂停。</p>
        </div>
        <div className={styles.careerGrid}>
          {defenseRoster.map((unit) => (
            <article key={unit.id}>
              <span aria-hidden="true">{unit.mark}</span>
              <small>{unit.shortName}</small>
              <h3>{unit.name}</h3>
              <p>{unit.description}</p>
              <strong>{unit.action}</strong>
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
