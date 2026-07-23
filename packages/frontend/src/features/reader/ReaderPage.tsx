// packages/frontend/src/features/reader/ReaderPage.tsx
// 阅读引擎页面容器（阅读 feature 的入口）。
//
// 职责（任务 16.1）：
// - 从路由参数取 docId，拉取 ArticleViewModel（useArticle）。
// - 用 CSDN 皮肤渲染成"技术博客文章页"（Req 5.1/5.2）。
// - 设置浏览器标签页标题为技术博客风格文本（Req 5.3）。
//
// 该容器同时为后续任务预留插槽，便于渐进接入而不改动皮肤层：
// - controlsSlot：阅读控制（16.2 字号/行距/主题/翻页模式）。
// - sidebarSlot：章节目录 / 书签（16.4，默认注入 ReaderSidebar）。
// - 老板键（16.5）可在此容器层挂载 useBossKey。

import type { JSX, ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import { useEffect } from 'react';

import type { Bookmark, ChapterTocItem } from '../../api';
import { CsdnSkin, buildBlogTabTitle } from '../skins';
import { BossScreen } from './BossScreen';
import { ReaderSidebar } from './ReaderSidebar';
import { ReadingControls } from './ReadingControls';
import { useArticle } from './useArticle';
import { useBossKey } from './useBossKey';
import { useDocumentTitle } from './useDocumentTitle';
import { useReaderSidebar } from './useReaderSidebar';
import { useReadingProgress } from './useReadingProgress';
import { useReadingSettings } from './useReadingSettings';

export interface ReaderPageProps {
  /** 阅读控制条插槽（任务 16.2 注入）。 */
  controlsSlot?: ReactNode;
  /** 侧栏插槽：目录/书签（任务 16.4 注入）。 */
  sidebarSlot?: ReactNode;
}

export function ReaderPage({
  controlsSlot,
  sidebarSlot,
}: ReaderPageProps): JSX.Element {
  const { docId } = useParams<{ docId: string }>();
  const { article, loading, error, forbidden, reload } = useArticle(docId);

  // 任务 16.2：阅读控制设置（字号/行距/主题/翻页模式），变更后持久化到偏好。
  const settings = useReadingSettings();

  // 任务 16.5：老板键。激活时用 BossScreen 覆盖阅读界面（Req 9.1），
  // 并暂停进度上报（Req 9.2）；再次按下恢复界面与上报（Req 9.3）。
  // 老板键从偏好加载（默认 'Escape'，Req 9.4）。
  const bossKey = useBossKey();

  // 任务 16.3：进度自动保存与恢复。
  // - 重开文档时从 article.progress 恢复上次章节与偏移（Req 7.2）。
  // - 翻页/滚动改变位置时防抖保存进度（Req 7.1）。
  // - 老板键激活时通过 paused 暂停上报（Req 9.2）。
  const { progress, restored, reportProgress, flush } = useReadingProgress(
    docId,
    article?.progress,
    { paused: bossKey.active },
  );

  // 任务 16.4：章节目录与书签数据。
  const sidebar = useReaderSidebar(docId);

  // 从目录选择某章节：跳转到该章节起始处（Req 8.2）。
  const handleJumpToChapter = (chapter: ChapterTocItem) => {
    reportProgress({ chapterIdx: chapter.idx, charOffset: 0 });
    window.scrollTo({ top: 0 });
  };

  // 选择某书签：跳转到书签记录的章节序号与偏移处（Req 8.4）。
  const handleJumpToBookmark = (bookmark: Bookmark) => {
    reportProgress({
      chapterIdx: bookmark.chapterIdx,
      charOffset: bookmark.charOffset,
    });
    window.scrollTo({ top: bookmark.charOffset });
  };

  // 滚动阅读时按滚动百分比防抖上报进度（Req 7.1）。
  // 仅在进度已恢复后监听，避免恢复前用 0% 覆盖已保存位置。
  useEffect(() => {
    if (!restored) return undefined;

    const chapterIdx = article?.progress.chapterIdx ?? 0;

    const handleScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const percent = scrollable > 0 ? (scrollTop / scrollable) * 100 : 0;
      reportProgress({ chapterIdx, charOffset: scrollTop, percent });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      // 离开页面前落盘挂起的进度，减少丢失。
      flush();
    };
  }, [restored, article?.progress.chapterIdx, reportProgress, flush]);

  // Req 5.3：将标签页标题设为技术博客风格文本（如 "<title>_CSDN博客"）。
  // 加载中/出错时使用通用博客标题占位，避免暴露"阅读器"字样。
  const tabTitle = article
    ? buildBlogTabTitle(article.articleTitle)
    : buildBlogTabTitle('');
  useDocumentTitle(tabTitle);

  // 任务 16.5 / Req 9.1：老板键激活时立即以"正经内容"页覆盖阅读界面。
  // 所有 hook 已在上方调用，激活状态下阅读状态被保留，退出后可无缝恢复（Req 9.3）。
  if (bossKey.active) {
    return <BossScreen />;
  }

  if (loading) {
    return (
      <div role="status" aria-live="polite" style={statusStyle}>
        正在加载…
      </div>
    );
  }

  if (forbidden) {
    // Req 12.2：不泄露文档是否存在，仅提示无权访问。
    return (
      <div role="alert" style={statusStyle}>
        无权访问该内容。
      </div>
    );
  }

  if (error || !article) {
    return (
      <div role="alert" style={statusStyle}>
        <p>{error ?? '内容不可用'}</p>
        <button type="button" onClick={reload}>
          重试
        </button>
      </div>
    );
  }

  return (
    <CsdnSkin
      article={article}
      // 默认注入阅读控制条（任务 16.2）；如父级显式传入则以父级为准。
      controlsSlot={controlsSlot ?? <ReadingControls settings={settings} />}
      // 默认注入章节目录 / 书签侧栏（任务 16.4）；父级显式传入则以父级为准。
      sidebarSlot={
        sidebarSlot ?? (
          <ReaderSidebar
            sidebar={sidebar}
            currentChapterIdx={progress.chapterIdx}
            currentPosition={{
              chapterIdx: progress.chapterIdx,
              charOffset: progress.charOffset,
            }}
            onJumpToChapter={handleJumpToChapter}
            onJumpToBookmark={handleJumpToBookmark}
          />
        )
      }
      // 应用视觉设置到正文（Req 6.4）与呈现模式（Req 6.5）。
      bodyStyle={{
        fontSize: `${settings.fontSize}px`,
        lineHeight: settings.lineHeight,
      }}
      theme={settings.theme}
      readingMode={settings.mode}
    />
  );
}

const statusStyle: React.CSSProperties = {
  maxWidth: 800,
  margin: '80px auto',
  textAlign: 'center',
  color: '#555',
};
