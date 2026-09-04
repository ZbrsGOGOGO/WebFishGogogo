import { useMemo, useState, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { SITE_NAME } from '../../app/site-config';
import { ToolRunnerModal } from './runtime/ToolRunnerModal';
import styles from './PublicToolsPage.module.css';

export interface PublicToolDefinition {
  slug: string;
  name: string;
  category: string;
  description: string;
  mark: string;
}

/**
 * 公开站点的精简工具白名单。
 *
 * 这些工具只使用浏览器内的 React 状态和本地计算，不需要账户、后端接口或
 * 浏览器持久化。未列在这里的完整站工具不会出现在公开页面或深链接中。
 */
export const PUBLIC_TOOLS: readonly PublicToolDefinition[] = [
  {
    slug: 'off-work-countdown',
    name: '下班倒计时',
    category: '时间',
    description: '设置下班时间，实时查看今天或明天还剩多久。',
    mark: 'OFF',
  },
  {
    slug: 'timer',
    name: '计时器',
    category: '时间',
    description: '使用正计时、倒计时和番茄钟安排专注与休息。',
    mark: '00:00',
  },
  {
    slug: 'date-calculator',
    name: '日期计算',
    category: '时间',
    description: '计算两个日期的间隔，或在指定日期上加减天数。',
    mark: '31',
  },
  {
    slug: 'calculator',
    name: '计算器',
    category: '计算',
    description: '快速完成四则运算、百分比与正负数计算。',
    mark: '±',
  },
  {
    slug: 'currency-converter',
    name: '汇率换算',
    category: '计算',
    description: '按手动输入的参考汇率换算常用货币金额。',
    mark: '¥$',
  },
  {
    slug: 'unit-converter',
    name: '单位换算',
    category: '转换',
    description: '换算常用长度、重量与温度单位。',
    mark: '⇄',
  },
  {
    slug: 'text-tools',
    name: '文本整理',
    category: '文本',
    description: '完成大小写转换、逐行去重、清理空行、排序与空格整理。',
    mark: 'Aa',
  },
  {
    slug: 'word-counter',
    name: '字数统计',
    category: '文本',
    description: '实时统计字符、词、行与中日韩文字数量。',
    mark: '123',
  },
  {
    slug: 'json-formatter',
    name: 'JSON 格式化',
    category: '开发',
    description: '在浏览器内格式化、压缩并校验 JSON 文本。',
    mark: '{ }',
  },
  {
    slug: 'timestamp-converter',
    name: '时间戳转换',
    category: '时间',
    description: '在 Unix 时间戳与本地日期时间之间双向转换。',
    mark: 'UTC',
  },
  {
    slug: 'color-converter',
    name: '颜色转换',
    category: '设计',
    description: '转换 HEX、RGB 与 HSL，并实时预览颜色。',
    mark: '#',
  },
] as const;

const TOOL_CATEGORIES = [
  '全部',
  '时间',
  '计算',
  '转换',
  '文本',
  '开发',
  '设计',
] as const;

type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export function PublicToolsPage(): JSX.Element {
  const { toolId } = useParams<{ toolId?: string }>();
  const navigate = useNavigate();
  const activeTool = PUBLIC_TOOLS.find((tool) => tool.slug === toolId) ?? null;
  const unknownTool = toolId !== undefined && activeTool === null;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ToolCategory>('全部');
  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return PUBLIC_TOOLS.filter((tool) => {
      const categoryMatches = category === '全部' || tool.category === category;
      const queryMatches =
        normalizedQuery.length === 0 ||
        `${tool.name} ${tool.category} ${tool.description}`
          .toLocaleLowerCase('zh-CN')
          .includes(normalizedQuery);
      return categoryMatches && queryMatches;
    });
  }, [category, query]);

  const clearFilters = (): void => {
    setQuery('');
    setCategory('全部');
  };

  return (
    <main className={styles.page} aria-labelledby="public-tools-title">
      <header className={styles.header}>
        <Link className={styles.brand} to="/" aria-label={`${SITE_NAME}首页`}>
          <span className={styles.brandMark} aria-hidden="true">摸</span>
          <span>
            <strong>{SITE_NAME}</strong>
            <small>个人效率工作台</small>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="公开页面">
          <Link to="/">首页</Link>
          <Link className={styles.currentLink} to="/tools" aria-current="page">
            实用工具
          </Link>
          <Link to="/games">轻量游戏</Link>
          <Link to="/privacy-policy">隐私政策</Link>
          <Link to="/terms-of-service">服务条款</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>浏览器本地工具</span>
        <h1 id="public-tools-title">常用的小工具，打开就能用</h1>
        <p>
          无需注册或登录。11 款工具的输入内容只在当前浏览器内处理，
          不发送到本站接口，也不会保存到服务器。
        </p>
        <div className={styles.trustRow} aria-label="工具特点">
          <span>无需账户</span>
          <span>本地处理</span>
          <span>无上传</span>
        </div>
      </section>

      {unknownTool ? (
        <section className={styles.notice} role="alert">
          <div>
            <strong>这个工具不存在或暂未公开</strong>
            <p>请选择下方已经开放的本地工具。</p>
          </div>
          <Link to="/tools">返回工具列表</Link>
        </section>
      ) : null}

      <section className={styles.catalog} aria-labelledby="tool-catalog-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>实用工具</span>
            <h2 id="tool-catalog-title">11 款轻量工具</h2>
          </div>
          <p>
            {filteredTools.length === PUBLIC_TOOLS.length
              ? '按场景挑选，所有计算均在当前页面完成。'
              : `当前显示 ${filteredTools.length} 款工具。`}
          </p>
        </div>

        <div className={styles.filterPanel} aria-label="筛选工具">
          <label className={styles.searchField}>
            <span>搜索工具</span>
            <input
              type="search"
              value={query}
              placeholder="搜索名称、分类或用途"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.categoryFilters} aria-label="工具分类">
            {TOOL_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? styles.activeFilter : undefined}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {filteredTools.length > 0 ? (
          <ul className={styles.toolGrid}>
          {filteredTools.map((tool) => {
            const headingId = `public-tool-${tool.slug}`;
            return (
              <li key={tool.slug}>
                <article className={styles.toolCard} aria-labelledby={headingId}>
                  <div className={styles.cardTopline}>
                    <span className={styles.toolMark} aria-hidden="true">
                      {tool.mark}
                    </span>
                    <span className={styles.category}>{tool.category}</span>
                  </div>
                  <div className={styles.cardCopy}>
                    <h3 id={headingId}>{tool.name}</h3>
                    <p>{tool.description}</p>
                  </div>
                  <Link className={styles.openLink} to={`/tools/${tool.slug}`}>
                    打开{tool.name}
                    <span aria-hidden="true">→</span>
                  </Link>
                </article>
              </li>
            );
          })}
          </ul>
        ) : (
          <div className={styles.emptyTools} role="status">
            <strong>没有找到匹配的工具</strong>
            <p>换个关键词，或查看全部 11 款工具。</p>
            <button type="button" onClick={clearFilters}>查看全部工具</button>
          </div>
        )}
      </section>

      <ToolRunnerModal
        slug={activeTool?.slug ?? null}
        title={activeTool?.name}
        onClose={() => navigate('/tools')}
      />
    </main>
  );
}
