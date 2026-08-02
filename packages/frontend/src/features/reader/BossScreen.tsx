// packages/frontend/src/features/reader/BossScreen.tsx
// 老板键"正经内容"伪装页（任务 16.5 / Req 9.1）。
//
// 当老板键激活时，由 ReaderPage 用本组件覆盖阅读界面，展示一份看起来完全
// 正常的工作文档（项目周报），以便在有人靠近时迅速隐藏阅读内容。
//
// 设计说明：
// - 纯静态展示组件，无任何"阅读器/小说"字样，内容为通用办公文档占位。
// - 以 position: fixed 全屏覆盖，确保盖住底层阅读界面。
// - 不承载业务逻辑；激活/退出与进度暂停由 useBossKey + ReaderPage 负责。

import type { JSX } from 'react';

import styles from './boss-screen.module.css';

export interface BossScreenProps {
  /** 伪装文档标题，默认一份周报标题。 */
  title?: string;
}

export function BossScreen({
  title = '项目周报 - 本周工作总结',
}: BossScreenProps): JSX.Element {
  return (
    <div className={styles.root} role="document" data-testid="boss-screen">
      {/* 模拟文档编辑器工具栏 */}
      <div className={styles.toolbar} aria-hidden="true">
        <span className={styles.menuItem}>文件</span>
        <span className={styles.menuItem}>编辑</span>
        <span className={styles.menuItem}>视图</span>
        <span className={styles.menuItem}>插入</span>
        <span className={styles.menuItem}>格式</span>
        <span className={styles.menuItem}>工具</span>
      </div>

      <article className={styles.doc}>
        <h1 className={styles.docTitle}>{title}</h1>
        <p className={styles.docSubtitle}>
          汇报周期：本周一 至 本周五 · 部门：技术研发部
        </p>

        <h2 className={styles.sectionTitle}>一、本周工作进展</h2>
        <ul>
          <li>完成核心模块的接口联调，联调通过率 100%。</li>
          <li>修复历史遗留缺陷 8 项，其中高优先级 3 项已全部关闭。</li>
          <li>推进单元测试覆盖率从 72% 提升至 85%。</li>
          <li>参与需求评审 2 次，输出技术方案文档 1 份。</li>
        </ul>

        <h2 className={styles.sectionTitle}>二、关键指标</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>指标</th>
              <th>目标</th>
              <th>实际</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>任务完成率</td>
              <td>90%</td>
              <td>94%</td>
              <td>达成</td>
            </tr>
            <tr>
              <td>缺陷修复时效</td>
              <td>≤ 2 天</td>
              <td>1.6 天</td>
              <td>达成</td>
            </tr>
            <tr>
              <td>代码评审覆盖</td>
              <td>100%</td>
              <td>100%</td>
              <td>达成</td>
            </tr>
          </tbody>
        </table>

        <h2 className={styles.sectionTitle}>三、下周计划</h2>
        <ul>
          <li>启动性能优化专项，完成首轮压测与瓶颈分析。</li>
          <li>完善部署文档并推进灰度发布方案评审。</li>
          <li>持续跟进线上监控告警，保障服务稳定性。</li>
        </ul>

        <h2 className={styles.sectionTitle}>四、风险与协调事项</h2>
        <p>
          第三方接口联调存在一定排期依赖，已与对接方确认交付时间，暂无阻塞性风险。
          需产品同学在下周一前确认剩余需求细节，以便按计划推进。
        </p>
      </article>
    </div>
  );
}
