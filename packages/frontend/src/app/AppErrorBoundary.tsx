import { Component, type JSX, type ReactNode } from 'react';

import styles from './AppErrorBoundary.module.css';

/** Recover render/lazy-chunk failures without automatic reload loops or raw errors. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <main className={styles.page}>
      <section className={styles.panel} role="alert" aria-labelledby="page-recovery-title">
        <h1 id="page-recovery-title">页面暂时无法加载</h1>
        <p>网络中断、站点更新或页面异常可能导致这个问题。你可以重新加载当前页，或返回首页。</p>
        <p>重新加载可能丢失尚未保存的输入；线上游戏仍会继续计时。</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => window.location.reload()}>重新加载当前页</button>
          <a href="/">返回首页</a>
        </div>
      </section>
    </main> satisfies JSX.Element;
  }
}
