import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';
import {
  Profession,
  type Tool,
} from '@stealth-reader/shared';

import {
  toolsApi,
  type ToolListResult,
} from '../../api';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Tag,
} from '../../components/ui';
import {
  ToolRunnerModal,
  isToolRegistered,
  useToolRunner,
} from './runtime';
import {
  FEATURED_TOOL_SLUGS,
  LOCAL_TOOL_CATALOG,
  mergeWithRemoteCatalog,
} from './localCatalog';
import styles from './ToolsPage.module.css';

const PROFESSIONS = Object.values(Profession);
const PROFESSION_STORAGE_KEY = 'zbrs.tools.profession';
const GENERAL_PREFERENCE = '__general__';

const PROFESSION_HINTS: Record<Profession, string> = {
  [Profession.Dev]: '开发调试',
  [Profession.Design]: '设计配色',
  [Profession.Ops]: '内容效率',
  [Profession.Finance]: '数据计算',
  [Profession.Sales]: '业务换算',
  [Profession.Student]: '学习专注',
  [Profession.Other]: '日常通用',
};

const TOOL_ICON_GLYPHS: Readonly<Record<string, string>> = {
  clock: '18:00',
  timer: '00:25',
  calendar: '31',
  calculator: '÷',
  currency: '¥',
  exchange: '⇄',
  text: 'Aa',
  count: '123',
  json: '{ }',
  timestamp: '⌛',
  regex: '.*',
  palette: '◐',
};

function normalizeListResult(result: Tool[] | ToolListResult): Tool[] {
  return Array.isArray(result) ? result : result.tools;
}

function cloneLocalCatalog(): Tool[] {
  return LOCAL_TOOL_CATALOG.map((tool) => ({
    ...tool,
    professions: [...tool.professions],
  }));
}

function readStoredProfession(): Profession | null {
  try {
    const value = window.localStorage.getItem(PROFESSION_STORAGE_KEY);
    return PROFESSIONS.includes(value as Profession)
      ? (value as Profession)
      : null;
  } catch {
    return null;
  }
}

function hasStoredProfessionChoice(): boolean {
  try {
    return window.localStorage.getItem(PROFESSION_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function storeProfession(profession: Profession | null): void {
  try {
    if (profession === null) {
      window.localStorage.setItem(
        PROFESSION_STORAGE_KEY,
        GENERAL_PREFERENCE,
      );
    } else {
      window.localStorage.setItem(PROFESSION_STORAGE_KEY, profession);
    }
  } catch {
    // 隐私模式或存储被禁用时，当前会话中的选择仍然有效。
  }
}

function toolGlyph(tool: Tool): string {
  const icon = tool.icon?.trim();
  if (!icon) {
    return 'TOOL';
  }
  return TOOL_ICON_GLYPHS[icon] ?? (icon.length <= 4 ? icon : 'TOOL');
}

interface ToolGridProps {
  tools: Tool[];
  selectedProfession: Profession | null;
  onOpen: (tool: Tool) => void;
}

function ToolGrid({
  tools,
  selectedProfession,
  onOpen,
}: ToolGridProps): JSX.Element {
  return (
    <ul className={styles.toolGrid} aria-label="本机工具列表">
      {tools.map((tool) => {
        const headingId = `tool-${tool.slug}-name`;
        const descriptionId = `tool-${tool.slug}-description`;
        const available = tool.enabled && isToolRegistered(tool.slug);
        const professionMatch =
          selectedProfession !== null &&
          tool.professions.includes(selectedProfession);
        const featured = FEATURED_TOOL_SLUGS.has(tool.slug);
        const visibleProfessions = tool.professions.slice(0, 2);
        const remainingProfessionCount =
          tool.professions.length - visibleProfessions.length;

        return (
          <li key={tool.slug}>
            <article
              className={`${styles.toolCard} ${
                professionMatch || featured ? styles.priorityCard : ''
              }`}
              aria-labelledby={headingId}
              aria-describedby={descriptionId}
            >
              <div className={styles.toolTopline}>
                <span className={styles.toolIcon} aria-hidden="true">
                  {toolGlyph(tool)}
                </span>
                <div className={styles.toolTags}>
                  {professionMatch ? (
                    <Tag color="success">适合{selectedProfession}</Tag>
                  ) : featured ? (
                    <Tag color="brand">常用</Tag>
                  ) : null}
                  <Tag color="neutral">{tool.category}</Tag>
                </div>
              </div>

              <div className={styles.toolCopy}>
                <h3 id={headingId}>{tool.name}</h3>
                <p id={descriptionId}>{tool.description}</p>
              </div>

              <div className={styles.toolFooter}>
                <div className={styles.professionTags} aria-label="适用职业">
                  {visibleProfessions.map((profession) => (
                    <span key={profession}>{profession}</span>
                  ))}
                  {remainingProfessionCount > 0 && (
                    <span>+{remainingProfessionCount}</span>
                  )}
                </div>
                <Button
                  size="md"
                  disabled={!available}
                  aria-label={
                    available
                      ? `打开${tool.name}`
                      : `${tool.name}暂不可用`
                  }
                  onClick={() => onOpen(tool)}
                >
                  {available ? '打开' : '暂不可用'}
                </Button>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

export function ToolsPage(): JSX.Element {
  const [catalog, setCatalog] = useState<Tool[]>(cloneLocalCatalog);
  const [catalogSyncing, setCatalogSyncing] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selectedProfession, setSelectedProfession] =
    useState<Profession | null>(readStoredProfession);
  const [preferenceSyncing, setPreferenceSyncing] = useState(false);
  const [preferenceLocalOnly, setPreferenceLocalOnly] = useState(false);
  const professionWasChosen = useRef(hasStoredProfessionChoice());
  const toolRunner = useToolRunner();

  useEffect(() => {
    let active = true;

    toolsApi
      .listTools()
      .then((result) => {
        if (!active) {
          return;
        }
        setCatalog(mergeWithRemoteCatalog(normalizeListResult(result)));
        setUsingFallback(false);
      })
      .catch(() => {
        if (active) {
          setCatalog(cloneLocalCatalog());
          setUsingFallback(true);
        }
      })
      .finally(() => {
        if (active) {
          setCatalogSyncing(false);
        }
      });

    toolsApi
      .recommendTools()
      .then((result) => {
        if (
          active &&
          !professionWasChosen.current &&
          result?.profession
        ) {
          setSelectedProfession(result.profession);
          storeProfession(result.profession);
        }
      })
      .catch(() => {
        // 职业推荐不是打开本机工具的前置条件。
      });

    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () =>
      Array.from(new Set(catalog.map((tool) => tool.category))).sort(
        (left, right) => left.localeCompare(right, 'zh-CN'),
      ),
    [catalog],
  );

  const visibleTools = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');

    return catalog
      .map((tool, index) => ({ tool, index }))
      .filter(({ tool }) => {
        const categoryMatches = category === '' || tool.category === category;
        const searchable = [
          tool.name,
          tool.category,
          tool.description ?? '',
          tool.slug,
        ]
          .join(' ')
          .toLocaleLowerCase('zh-CN');
        const queryMatches =
          normalizedQuery === '' || searchable.includes(normalizedQuery);
        return categoryMatches && queryMatches;
      })
      .sort((left, right) => {
        const score = (tool: Tool): number => {
          if (
            selectedProfession !== null &&
            tool.professions.includes(selectedProfession)
          ) {
            return 2;
          }
          return FEATURED_TOOL_SLUGS.has(tool.slug) ? 1 : 0;
        };
        return score(right.tool) - score(left.tool) || left.index - right.index;
      })
      .map(({ tool }) => tool);
  }, [catalog, category, query, selectedProfession]);

  const hasActiveFilter = query.trim() !== '' || category !== '';

  const selectProfession = (profession: Profession | null): void => {
    professionWasChosen.current = true;
    setSelectedProfession(profession);
    storeProfession(profession);
    setPreferenceLocalOnly(false);

    if (profession === null) {
      return;
    }

    setPreferenceSyncing(true);
    void toolsApi
      .recommendTools(profession)
      .then(() => setPreferenceLocalOnly(false))
      .catch(() => setPreferenceLocalOnly(true))
      .finally(() => setPreferenceSyncing(false));
  };

  const clearFilters = (): void => {
    setQuery('');
    setCategory('');
  };

  const openTool = (tool: Tool): void => {
    toolRunner.open(tool.slug, tool.name);
  };

  const resultDescription = selectedProfession
    ? `已优先展示适合「${selectedProfession}」的工具。`
    : '常用工具排在前面，所有计算都在当前浏览器完成。';

  return (
    <section aria-label="工具工坊">
      <PageHeader
        title="工具"
        subtitle="无需安装，也不必等待网络；选中工具即可在本机直接使用。"
        actions={
          <div className={styles.catalogStat} aria-label="本机工具数量">
            <strong>{catalog.length}</strong>
            <span>{catalogSyncing ? '正在核对目录' : '款本机工具'}</span>
          </div>
        }
      />

      <section className={styles.controlPanel} aria-label="查找工具">
        <div className={styles.searchRow}>
          <Input
            type="search"
            label="搜索工具"
            value={query}
            placeholder="搜索名称、功能或分类，例如 JSON、日期、文本"
            autoComplete="off"
            wrapperClassName={styles.searchField}
            onChange={(event) => setQuery(event.target.value)}
          />
          {hasActiveFilter && (
            <Button
              type="button"
              variant="ghost"
              className={styles.clearButton}
              onClick={clearFilters}
            >
              清除筛选
            </Button>
          )}
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>分类</span>
          <div
            className={styles.chipRail}
            role="group"
            aria-label="工具分类"
          >
            <button
              type="button"
              className={category === '' ? styles.activeChip : styles.chip}
              aria-pressed={category === ''}
              onClick={() => setCategory('')}
            >
              全部
            </button>
            {categories.map((value) => (
              <button
                key={value}
                type="button"
                className={category === value ? styles.activeChip : styles.chip}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>职业推荐</span>
          <div
            className={styles.chipRail}
            role="group"
            aria-label="职业偏好"
            aria-busy={preferenceSyncing || undefined}
          >
            <button
              type="button"
              className={
                selectedProfession === null ? styles.activeChip : styles.chip
              }
              aria-pressed={selectedProfession === null}
              onClick={() => selectProfession(null)}
            >
              通用
            </button>
            {PROFESSIONS.map((profession) => (
              <button
                key={profession}
                type="button"
                className={
                  selectedProfession === profession
                    ? styles.activeChip
                    : styles.chip
                }
                aria-pressed={selectedProfession === profession}
                title={PROFESSION_HINTS[profession]}
                onClick={() => selectProfession(profession)}
              >
                {profession}
              </button>
            ))}
          </div>
        </div>
      </section>

      {usingFallback && (
        <p className={styles.localNotice} role="status">
          当前使用内置本机目录，12 款工具仍可正常使用。
        </p>
      )}
      {preferenceLocalOnly && (
        <p className={styles.localNotice} role="status">
          职业偏好已保存在本机，联网后可再次同步。
        </p>
      )}

      <section className={styles.catalogSection} aria-labelledby="catalog-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>本机工具目录</span>
            <h2 id="catalog-title">
              {hasActiveFilter ? '筛选结果' : '本机工具箱'}
            </h2>
            <p>{resultDescription}</p>
          </div>
          <span className={styles.resultCount}>{visibleTools.length} 款</span>
        </div>

        {visibleTools.length > 0 ? (
          <ToolGrid
            tools={visibleTools}
            selectedProfession={selectedProfession}
            onOpen={openTool}
          />
        ) : (
          <div className={styles.emptyPanel} data-testid="tools-empty">
            <EmptyState
              icon="⌕"
              title="没有找到匹配的工具"
              message="换一个关键词或清除当前分类后再试。"
              actions={
                <Button variant="secondary" onClick={clearFilters}>
                  查看全部工具
                </Button>
              }
            />
          </div>
        )}
      </section>

      <ToolRunnerModal
        slug={toolRunner.activeTool?.slug ?? null}
        title={toolRunner.activeTool?.title}
        onClose={toolRunner.close}
      />
    </section>
  );
}
