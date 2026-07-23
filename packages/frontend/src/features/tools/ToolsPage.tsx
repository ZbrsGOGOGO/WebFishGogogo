// packages/frontend/src/features/tools/ToolsPage.tsx
// 工具聚合页：工具目录列表、职业化推荐、分类筛选/名称搜索、工具启动。
// _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.7_

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from 'react';
import {
  Profession,
  type Tool,
  type ToolRecommendation,
} from '@stealth-reader/shared';

import {
  toolsApi,
  type ToolLaunchResult,
  type ToolListResult,
} from '../../api';
import { ToolRunnerModal, useToolRunner } from './runtime';

/** listTools 结果统一归一为 { tools, noMatch, message }。 */
function normalizeListResult(
  result: Tool[] | ToolListResult,
): ToolListResult {
  if (Array.isArray(result)) {
    return { tools: result, noMatch: result.length === 0, message: null };
  }
  return result;
}

/** 所有受支持职业（来自共享 Profession 枚举）。 */
const PROFESSIONS = Object.values(Profession);

export function ToolsPage(): JSX.Element {
  // 工具目录（全部可用工具，Req 14.1）或筛选/搜索结果（Req 14.3/14.4）。
  const [tools, setTools] = useState<Tool[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  const [noMatchMessage, setNoMatchMessage] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // 筛选条件：分类精确匹配 + 名称关键字。
  const [category, setCategory] = useState('');
  const [queryText, setQueryText] = useState('');

  // 职业化推荐（Req 14.2/14.7）。
  const [recommendation, setRecommendation] =
    useState<ToolRecommendation | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(true);

  // 启动工具状态（Req 14.5）。
  const [launchResult, setLaunchResult] = useState<ToolLaunchResult | null>(
    null,
  );
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  // 工具运行器（在 Modal 中渲染工具真实界面，替换仅展示可用状态的旧行为）。
  const toolRunner = useToolRunner();

  /** 载入工具目录 / 筛选结果。 */
  const loadTools = useCallback(
    async (nextCategory: string, nextQuery: string): Promise<void> => {
      setListLoading(true);
      setListError(null);
      try {
        const trimmedCategory = nextCategory.trim();
        const trimmedQuery = nextQuery.trim();
        const result = await toolsApi.listTools({
          category: trimmedCategory || undefined,
          q: trimmedQuery || undefined,
        });
        const normalized = normalizeListResult(result);
        setTools(normalized.tools);
        setNoMatch(normalized.noMatch);
        setNoMatchMessage(normalized.message);
      } catch (error) {
        setListError(toMessage(error));
        setTools([]);
      } finally {
        setListLoading(false);
      }
    },
    [],
  );

  // 首次进入：载入全部工具（Req 14.1）并按已持久化职业生成推荐（Req 14.7）。
  useEffect(() => {
    void loadTools('', '');
  }, [loadTools]);

  useEffect(() => {
    let active = true;
    setRecommendLoading(true);
    // 不带 profession 参数：使用用户已持久化的职业（若有）生成推荐。
    toolsApi
      .recommendTools()
      .then((result) => {
        if (active) {
          setRecommendation(result);
        }
      })
      .catch(() => {
        // 推荐失败不阻断工具目录展示；保持无推荐态。
        if (active) {
          setRecommendation(null);
        }
      })
      .finally(() => {
        if (active) {
          setRecommendLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  /** 选择职业：持久化并即时刷新推荐（Req 14.2/14.6）。 */
  async function handleSelectProfession(profession: Profession): Promise<void> {
    setRecommendLoading(true);
    try {
      const result = await toolsApi.recommendTools(profession);
      setRecommendation(result);
    } catch (error) {
      setListError(toMessage(error));
    } finally {
      setRecommendLoading(false);
    }
  }

  /** 提交筛选/搜索。 */
  function handleFilterSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();
    void loadTools(category, queryText);
  }

  /** 重置筛选并回到全部工具。 */
  function handleResetFilter(): void {
    setCategory('');
    setQueryText('');
    void loadTools('', '');
  }

  /**
   * 启动工具（Req 14.5）：在 Modal 中渲染工具真实界面。
   * 仍调用 launchTool 以获取/记录可用状态，但主 UX 是打开工具界面。
   */
  async function handleLaunch(tool: Tool): Promise<void> {
    // 立即打开运行器，渲染对应 slug 的工具组件。
    toolRunner.open(tool.slug, tool.name);

    setLaunchingId(tool.id);
    setLaunchResult(null);
    try {
      const result = await toolsApi.launchTool(tool.id);
      setLaunchResult(result);
    } catch (error) {
      setListError(toMessage(error));
    } finally {
      setLaunchingId(null);
    }
  }

  // 可选分类集合（由当前工具集合派生，供筛选下拉）。
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tool of tools) {
      if (tool.category) {
        set.add(tool.category);
      }
    }
    if (category.trim()) {
      set.add(category.trim());
    }
    return Array.from(set).sort();
  }, [tools, category]);

  const hasActiveFilter = category.trim() !== '' || queryText.trim() !== '';

  return (
    <section aria-labelledby="tools-title">
      <h1 id="tools-title">工具</h1>

      {/* 职业选择器（Req 14.2/14.7）。 */}
      <section aria-labelledby="profession-title">
        <h2 id="profession-title">按职业推荐</h2>
        <div role="group" aria-label="职业选择器">
          {PROFESSIONS.map((profession) => (
            <button
              key={profession}
              type="button"
              aria-pressed={recommendation?.profession === profession}
              disabled={recommendLoading}
              onClick={() => void handleSelectProfession(profession)}
            >
              {profession}
            </button>
          ))}
        </div>

        {recommendLoading ? (
          <p>推荐加载中…</p>
        ) : recommendation && recommendation.tools.length > 0 ? (
          <div>
            <p>为「{recommendation.profession}」推荐：</p>
            <ToolList
              tools={recommendation.tools}
              launchingId={launchingId}
              onLaunch={handleLaunch}
              emptyMessage={null}
            />
          </div>
        ) : recommendation ? (
          <p>暂无该职业的推荐工具。</p>
        ) : (
          <p>选择职业以获取个性化推荐。</p>
        )}
      </section>

      {/* 分类筛选 + 名称搜索（Req 14.3/14.4）。 */}
      <section aria-labelledby="filter-title">
        <h2 id="filter-title">工具目录</h2>
        <form onSubmit={handleFilterSubmit} role="search">
          <label>
            分类
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            名称搜索
            <input
              type="search"
              name="q"
              value={queryText}
              placeholder="按工具名称搜索"
              onChange={(e) => setQueryText(e.target.value)}
            />
          </label>
          <button type="submit" disabled={listLoading}>
            {listLoading ? '加载中…' : '筛选'}
          </button>
          {hasActiveFilter ? (
            <button type="button" onClick={handleResetFilter}>
              重置
            </button>
          ) : null}
        </form>

        {listError ? (
          <p role="alert" style={{ color: 'crimson' }}>
            {listError}
          </p>
        ) : null}

        {launchResult ? (
          <p role="status">
            已启动「{launchResult.slug}」，可用状态：
            {launchResult.available ? '可用' : '不可用'}
          </p>
        ) : null}

        {listLoading ? (
          <p>工具加载中…</p>
        ) : (
          <ToolList
            tools={tools}
            launchingId={launchingId}
            onLaunch={handleLaunch}
            emptyMessage={
              noMatch || tools.length === 0
                ? noMatchMessage ?? '未匹配到任何工具。'
                : null
            }
          />
        )}
      </section>

      {/* 工具运行器：在 Modal 中渲染选中工具的真实界面（Req 14.5）。 */}
      <ToolRunnerModal
        slug={toolRunner.activeTool?.slug ?? null}
        title={toolRunner.activeTool?.title}
        onClose={toolRunner.close}
      />
    </section>
  );
}

interface ToolListProps {
  tools: Tool[];
  launchingId: string | null;
  onLaunch: (tool: Tool) => void | Promise<void>;
  emptyMessage: string | null;
}

/** 工具卡片列表；无工具时展示空态提示（Req 14.4）。 */
function ToolList({
  tools,
  launchingId,
  onLaunch,
  emptyMessage,
}: ToolListProps): JSX.Element {
  if (tools.length === 0) {
    return (
      <p role="status" data-testid="tools-empty">
        {emptyMessage ?? '暂无工具。'}
      </p>
    );
  }

  return (
    <ul
      aria-label="工具列表"
      style={{ listStyle: 'none', padding: 0, margin: 0 }}
    >
      {tools.map((tool) => (
        <li key={tool.id}>
          <article aria-labelledby={`tool-${tool.id}-name`}>
            <h3 id={`tool-${tool.id}-name`}>
              {tool.icon ? <span aria-hidden="true">{tool.icon} </span> : null}
              {tool.name}
            </h3>
            {tool.category ? <p>分类：{tool.category}</p> : null}
            {tool.description ? <p>{tool.description}</p> : null}
            <button
              type="button"
              disabled={launchingId === tool.id}
              onClick={() => void onLaunch(tool)}
            >
              {launchingId === tool.id ? '启动中…' : '启动'}
            </button>
          </article>
        </li>
      ))}
    </ul>
  );
}

/** 将任意错误规整为可展示的消息。 */
function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '操作失败，请稍后重试';
}
