import { Component, type ReactNode, type JSX } from 'react';
import styles from './CommunityHome.module.css';

/** A decorative chunk must never take the user's working page down with it. */
export class WorkspaceSceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  render(): ReactNode | JSX.Element {
    return this.state.failed ? <div className={styles.scenePlaceholder} role="status"><span>3D 场景暂时没有加载成功</span><small>已切换为轻量视图，其余功能不受影响。可关闭 3D 视角继续使用。</small></div> : this.props.children;
  }
}
