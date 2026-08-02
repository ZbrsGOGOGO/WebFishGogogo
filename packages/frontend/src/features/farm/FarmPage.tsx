import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import {
  farmApi,
  type FarmCropDefinition,
  type FarmOverview,
  type FarmPlot,
} from '../../api/farm';
import { Button, Card, PageHeader } from '../../components/ui';
import styles from './FarmPage.module.css';

const numberFormatter = new Intl.NumberFormat('zh-CN');
const MAX_VISIBLE_PLOTS = 5;

const SEED_RESOURCES = [
  {
    slug: 'seed_wheat',
    legacyKey: 'wheatSeed',
    label: '小麦种子',
  },
  {
    slug: 'seed_strawberry',
    legacyKey: 'strawberrySeed',
    label: '草莓种子',
  },
  {
    slug: 'seed_coffee',
    legacyKey: 'coffeeSeed',
    label: '咖啡种子',
  },
] as const;

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${Math.max(1, totalSeconds)} 秒`;
  }
  if (totalSeconds < 3600) {
    return `${Math.ceil(totalSeconds / 60)} 分钟`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
}

function formatCountdown(totalMilliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(totalMilliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function rewardText(crop: FarmCropDefinition): string {
  const rewards: string[] = [];
  if (crop.rewards.experience) {
    rewards.push(`${crop.rewards.experience} EXP`);
  }
  if (crop.rewards.officeCoin) {
    rewards.push(`${crop.rewards.officeCoin} 办公币`);
  }
  if (crop.rewards.decorationCoin) {
    rewards.push(`${crop.rewards.decorationCoin} 装饰币`);
  }
  if (crop.rewards.energy) {
    rewards.push(`${crop.rewards.energy} 精力`);
  }
  return rewards.length > 0 ? rewards.join(' + ') : '基础农场经验';
}

function seedQuantity(
  overview: FarmOverview,
  seedSlug: string,
): number {
  const direct = overview.inventory[seedSlug];
  if (typeof direct === 'number') {
    return direct;
  }

  const resource = SEED_RESOURCES.find((item) => item.slug === seedSlug);
  return resource
    ? (overview.inventory[resource.legacyKey] ?? 0)
    : 0;
}

function harvestSuccessText(
  crop: FarmCropDefinition | undefined,
  farmExperienceGain: number,
): string {
  const parts: string[] = [];
  if (crop) {
    if (crop.rewards.experience) {
      parts.push(`+${crop.rewards.experience} EXP`);
    }
    if (crop.rewards.officeCoin) {
      parts.push(`+${crop.rewards.officeCoin} 办公币`);
    }
    if (crop.rewards.decorationCoin) {
      parts.push(`+${crop.rewards.decorationCoin} 装饰币`);
    }
    if (crop.rewards.energy) {
      parts.push(`+${crop.rewards.energy} 精力`);
    }
  }
  if (farmExperienceGain > 0) {
    parts.push(`+${farmExperienceGain} 农场 EXP`);
  }

  const cropName = crop?.name ?? '作物';
  return parts.length > 0
    ? `${cropName}收获成功，奖励已到账：${parts.join(' · ')}`
    : `${cropName}收获成功，奖励已到账。`;
}

interface PlotCardProps {
  plot: FarmPlot;
  nowMs: number;
  selected: boolean;
  busy: boolean;
  allowSelection: boolean;
  allowHarvest: boolean;
  onSelect: (plot: FarmPlot) => void;
  onHarvest: (plot: FarmPlot) => void;
}

function PlotCard({
  plot,
  nowMs,
  selected,
  busy,
  allowSelection,
  allowHarvest,
  onSelect,
  onHarvest,
}: PlotCardProps): JSX.Element {
  const maturesAtMs = plot.maturesAt ? Date.parse(plot.maturesAt) : 0;
  const ready =
    plot.state === 'ready' ||
    (plot.state === 'growing' &&
      Number.isFinite(maturesAtMs) &&
      maturesAtMs <= nowMs);

  if (plot.state === 'locked') {
    return (
      <article className={`${styles.plot} ${styles.locked}`}>
        <span className={styles.plotEmoji} aria-hidden="true">
          🔒
        </span>
        <strong>第 {plot.slotIndex + 1} 块地</strong>
        <span>尚未解锁</span>
      </article>
    );
  }

  if (plot.state === 'empty') {
    return (
      <article
        className={`${styles.plot} ${styles.empty} ${
          selected ? styles.selectedPlot : ''
        }`}
      >
        <span className={styles.plotEmoji} aria-hidden="true">
          ＋
        </span>
        <strong>第 {plot.slotIndex + 1} 块地</strong>
        {allowSelection ? (
          <Button
            size="sm"
            variant={selected ? 'primary' : 'secondary'}
            onClick={() => onSelect(plot)}
          >
            {selected ? '正在选种' : '选择作物'}
          </Button>
        ) : (
          <span>等待一键种植</span>
        )}
      </article>
    );
  }

  return (
    <article className={`${styles.plot} ${ready ? styles.ready : ''}`}>
      <span className={styles.plotEmoji} aria-hidden="true">
        {plot.crop?.emoji ?? '🌱'}
      </span>
      <strong>{plot.crop?.name ?? '生长中的作物'}</strong>
      {ready ? (
        <>
          <span className={styles.readyLabel}>可收获</span>
          {allowHarvest && (
            <Button
              size="sm"
              onClick={() => onHarvest(plot)}
              loading={busy}
            >
              收获
            </Button>
          )}
        </>
      ) : (
        <>
          <span>距离成熟</span>
          <time
            className={styles.countdown}
            dateTime={plot.maturesAt ?? undefined}
          >
            {formatCountdown(maturesAtMs - nowMs)}
          </time>
        </>
      )}
    </article>
  );
}

export function FarmPage(): JSX.Element {
  const [overview, setOverview] = useState<FarmOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [firstHarvestCelebration, setFirstHarvestCelebration] = useState(false);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [selectedCropSlug, setSelectedCropSlug] = useState<string | null>(null);
  const [busyPlotId, setBusyPlotId] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const cropPanelRef = useRef<HTMLDivElement>(null);

  const applyOverview = useCallback((nextOverview: FarmOverview): void => {
    const browserTimeMs = Date.now();
    const serverTimeMs = Date.parse(nextOverview.serverTime);
    setOverview(nextOverview);
    setClockMs(browserTimeMs);
    setServerOffsetMs(
      Number.isFinite(serverTimeMs) ? serverTimeMs - browserTimeMs : 0,
    );
  }, []);

  const loadFarm = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);

    try {
      const nextOverview = await farmApi.getFarm();
      applyOverview(nextOverview);
    } catch (error) {
      setLoadError(readableError(error, '农场加载失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, [applyOverview]);

  useEffect(() => {
    void loadFarm();
  }, [loadFarm]);

  useEffect(() => {
    if (!overview?.plots.some((plot) => plot.state === 'growing')) {
      return undefined;
    }

    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [overview]);

  const selectedPlot = useMemo(
    () =>
      overview?.plots.find((plot) => plot.id === selectedPlotId) ?? null,
    [overview, selectedPlotId],
  );
  const selectedCrop = useMemo(
    () =>
      overview?.crops.find((crop) => crop.slug === selectedCropSlug) ?? null,
    [overview, selectedCropSlug],
  );

  const selectPlot = (plot: FarmPlot): void => {
    setSelectedPlotId(plot.id);
    setSelectedCropSlug(null);
    setActionError(null);
    setActionSuccess(null);
    setFirstHarvestCelebration(false);
    window.requestAnimationFrame(() => {
      cropPanelRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const handleOnboardingPlant = async (): Promise<void> => {
    if (!overview || busyPlotId) return;
    const firstEmptyPlot = overview.plots.find(
      (plot) => plot.state === 'empty',
    );
    const wheat = overview.crops.find((crop) => crop.slug === 'wheat');
    if (!firstEmptyPlot || !wheat) {
      setActionError('暂时没有可用的新手土地，请刷新农场后重试。');
      return;
    }

    setBusyPlotId(firstEmptyPlot.id);
    setActionError(null);
    setActionSuccess(null);
    setFirstHarvestCelebration(false);
    try {
      const nextOverview = await farmApi.plantCrop(
        firstEmptyPlot.id,
        wheat.slug,
      );
      applyOverview(nextOverview);
      setActionSuccess(`${wheat.name}已种下，30 秒后点一次收获即可。`);
    } catch (error) {
      setActionError(
        `一键种植未完成。${readableError(error, '请稍后重试。')}`,
      );
    } finally {
      setBusyPlotId(null);
    }
  };

  const handlePlant = async (): Promise<void> => {
    if (!selectedPlot || !selectedCrop || !overview || busyPlotId) {
      return;
    }

    setBusyPlotId(selectedPlot.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const plantedPlotNumber = selectedPlot.slotIndex + 1;
      const nextOverview = await farmApi.plantCrop(
        selectedPlot.id,
        selectedCrop.slug,
      );
      applyOverview(nextOverview);
      setSelectedPlotId(null);
      setSelectedCropSlug(null);
      setActionSuccess(
        `第 ${plantedPlotNumber} 块地已种下${selectedCrop.name}，土地与资源已同步。`,
      );
    } catch (error) {
      setActionError(
        `种植未完成，当前仍显示操作前的数据。${readableError(
          error,
          '请稍后重试。',
        )}`,
      );
    } finally {
      setBusyPlotId(null);
    }
  };

  const handleHarvest = async (plot: FarmPlot): Promise<void> => {
    if (busyPlotId || !overview) {
      return;
    }

    setBusyPlotId(plot.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const crop = overview.crops.find(
        (definition) => definition.slug === plot.crop?.slug,
      );
      const previousFarmExperience = overview.farm.experience;
      const wasFirstHarvestCompleted =
        overview.onboarding.firstHarvestCompleted;
      const nextOverview = await farmApi.harvestCrop(plot.id);
      applyOverview(nextOverview);
      setFirstHarvestCelebration(
        !wasFirstHarvestCompleted &&
          nextOverview.onboarding.firstHarvestCompleted,
      );
      setActionSuccess(
        harvestSuccessText(
          crop,
          Math.max(
            0,
            nextOverview.farm.experience - previousFarmExperience,
          ),
        ),
      );
    } catch (error) {
      setActionError(
        `收获未完成，当前仍显示操作前的数据。${readableError(
          error,
          '请稍后重试。',
        )}`,
      );
    } finally {
      setBusyPlotId(null);
    }
  };

  if (loading && !overview) {
    return (
      <section aria-label="农场">
        <PageHeader title="农场" subtitle="安排种植，等待成熟，收获成长。" />
        <Card>
          <div className={styles.pageState} role="status" aria-live="polite">
            正在加载农场…
          </div>
        </Card>
      </section>
    );
  }

  if (loadError && !overview) {
    return (
      <section aria-label="农场">
        <PageHeader title="农场" subtitle="安排种植，等待成熟，收获成长。" />
        <Card>
          <div className={styles.pageState} role="alert">
            <p>{loadError}</p>
            <Button variant="secondary" onClick={() => void loadFarm()}>
              重新加载
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  if (!overview) {
    return (
      <section aria-label="农场">
        <PageHeader title="农场" />
        <Card>
          <div className={styles.pageState} role="alert">
            暂无农场数据
          </div>
        </Card>
      </section>
    );
  }

  const nowMs = clockMs + serverOffsetMs;
  const allVisiblePlots = overview.plots.filter(
    (plot) => plot.slotIndex < MAX_VISIBLE_PLOTS,
  );
  const visiblePlots = overview.onboarding.firstHarvestCompleted
    ? allVisiblePlots
    : allVisiblePlots.slice(0, 1);
  const unlockedPlotCount = allVisiblePlots.filter(
    (plot) => plot.state !== 'locked',
  ).length;
  const canPlant =
    selectedCrop != null &&
    selectedPlot != null &&
    overview.farm.level >= selectedCrop.requiredLevel &&
    overview.assets.water >= selectedCrop.plantCost.water &&
    seedQuantity(overview, selectedCrop.plantCost.seedSlug) >=
      selectedCrop.plantCost.seedQuantity;
  const onboardingStage =
    overview.onboarding.stage === 'growing' &&
    overview.plots.some((plot) => {
      const maturesAtMs = plot.maturesAt ? Date.parse(plot.maturesAt) : 0;
      return (
        plot.state === 'ready' ||
        (plot.state === 'growing' &&
          Number.isFinite(maturesAtMs) &&
          maturesAtMs <= nowMs)
      );
    })
      ? 'ready'
      : overview.onboarding.stage;
  const readyOnboardingPlot = visiblePlots.find((plot) => {
    const maturesAtMs = plot.maturesAt ? Date.parse(plot.maturesAt) : 0;
    return (
      plot.state === 'ready' ||
      (plot.state === 'growing' &&
        Number.isFinite(maturesAtMs) &&
        maturesAtMs <= nowMs)
    );
  });
  const onboardingCopy = {
    choose_plot: {
      step: '新手任务 · 第 1 / 2 步',
      title: '一键种下，30 秒后收获',
      description: `不用选土地，也不用配资源。点一次就会种下小麦，首收再送 ${overview.onboarding.firstHarvestBonusFarmExp} 农场 EXP。`,
    },
    growing: {
      step: '新手任务 · 等待成熟',
      title: '小麦正在长大',
      description: '只需等待 30 秒。离开页面也不会中断，成熟后按钮会自动变成“收获”。',
    },
    ready: {
      step: '新手任务 · 第 2 / 2 步',
      title: '小麦成熟了，点一下收获',
      description: `收获后立即升到农场 Lv.2，并解锁咖啡。`,
    },
    completed: {
      step: '新手任务 · 已完成',
      title: '首收已经完成',
      description: '咖啡作物已解锁，接下来可以按自己的节奏安排离线种植。',
    },
  }[onboardingStage];

  return (
    <section aria-label="农场">
      <PageHeader
        title="农场"
        subtitle={
          overview.onboarding.firstHarvestCompleted
            ? '每日签到获得 5 水滴；作物离线也会继续生长。'
            : '两步完成首收：一键种下，30 秒后收获。'
        }
        actions={
          overview.onboarding.firstHarvestCompleted ? (
            <Button
              size="sm"
              variant="secondary"
              loading={loading}
              onClick={() => void loadFarm()}
            >
              刷新农场
            </Button>
          ) : undefined
        }
      />

      {!overview.onboarding.firstHarvestCompleted && (
        <section
          className={styles.onboarding}
          data-stage={onboardingStage}
          aria-labelledby="farm-onboarding-title"
        >
          <div className={styles.onboardingCopy}>
            <span>{onboardingCopy.step}</span>
            <h2 id="farm-onboarding-title">{onboardingCopy.title}</h2>
            <p>{onboardingCopy.description}</p>
          </div>
          <div className={styles.onboardingReward} aria-label="新手首收奖励">
            <strong>首收目标</strong>
            <span>农场 Lv.2</span>
            <small>解锁 ☕ 加班咖啡豆</small>
          </div>
          {onboardingStage === 'choose_plot' && (
            <Button
              loading={busyPlotId != null}
              onClick={() => void handleOnboardingPlant()}
            >
              一键种下小麦 · 30 秒
            </Button>
          )}
          {onboardingStage === 'ready' && readyOnboardingPlot && (
            <Button
              loading={busyPlotId === readyOnboardingPlot.id}
              onClick={() => void handleHarvest(readyOnboardingPlot)}
            >
              收获并升到 Lv.2
            </Button>
          )}
        </section>
      )}

      {firstHarvestCelebration && (
        <section className={styles.celebration} role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>新手闭环完成 · 咖啡已解锁</strong>
            <p>你已升到农场 Lv.2。下一步可以种咖啡，或去小游戏完成一局短挑战。</p>
          </div>
        </section>
      )}

      <div className={styles.summaryGrid}>
        <Card className={styles.levelCard}>
          <span className={styles.summaryLabel}>农场等级</span>
          <strong>Lv.{overview.farm.level}</strong>
          <span>
            {numberFormatter.format(overview.farm.experience)} EXP ·{' '}
            {overview.farm.expToNextLevel == null
              ? '已满级'
              : `距升级 ${numberFormatter.format(overview.farm.expToNextLevel)}`}
          </span>
        </Card>
        <Card>
          <dl
            className={styles.assetList}
            data-compact={!overview.onboarding.firstHarvestCompleted}
            aria-label="农场资源"
          >
            <div>
              <dt>水滴</dt>
              <dd>{numberFormatter.format(overview.assets.water)}</dd>
            </div>
            {SEED_RESOURCES.filter(
              (resource) =>
                overview.onboarding.firstHarvestCompleted ||
                resource.slug === 'seed_wheat',
            ).map((resource) => (
              <div key={resource.slug}>
                <dt>{resource.label}</dt>
                <dd>
                  {numberFormatter.format(
                    seedQuantity(overview, resource.slug),
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {loadError && (
        <div className={styles.staleWarning} role="alert">
          <div>
            <strong>刷新没有完成</strong>
            <span>当前仍显示上次成功同步的农场数据。{loadError}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={() => void loadFarm()}
          >
            再试一次
          </Button>
        </div>
      )}

      {actionError && (
        <p className={styles.actionError} role="alert">
          {actionError}
        </p>
      )}
      {actionSuccess && (
        <p className={styles.actionSuccess} role="status" aria-live="polite">
          {actionSuccess}
        </p>
      )}

      <Card
        className={styles.plotsCard}
        title={
          overview.onboarding.firstHarvestCompleted
            ? `我的土地 · 已开放 ${unlockedPlotCount} / ${MAX_VISIBLE_PLOTS}`
            : '你的第一块地'
        }
      >
        <div
          className={styles.plotGrid}
          data-compact={!overview.onboarding.firstHarvestCompleted}
          aria-label="农场地块"
        >
          {visiblePlots.map((plot) => (
            <PlotCard
              key={plot.id}
              plot={plot}
              nowMs={nowMs}
              selected={plot.id === selectedPlotId}
              busy={plot.id === busyPlotId}
              allowSelection={overview.onboarding.firstHarvestCompleted}
              allowHarvest={overview.onboarding.firstHarvestCompleted}
              onSelect={selectPlot}
              onHarvest={(target) => void handleHarvest(target)}
            />
          ))}
        </div>
      </Card>

      {overview.onboarding.firstHarvestCompleted && (
      <div ref={cropPanelRef} className={styles.cropPanelAnchor}>
        <Card
          className={styles.cropPanel}
          title={
            selectedPlot
              ? `为第 ${selectedPlot.slotIndex + 1} 块地选择作物`
              : '选择作物'
          }
        >
          <p
            className={`${styles.selectionNotice} ${
              selectedPlot ? styles.selectionReady : ''
            }`}
            role={selectedPlot ? 'status' : undefined}
            aria-live={selectedPlot ? 'polite' : undefined}
          >
            {selectedPlot
              ? `第 ${selectedPlot.slotIndex + 1} 块地已选中，请在下方选择作物。`
              : '先在上方选择一块空地，再挑选要种植的作物。'}
          </p>

          <div className={styles.cropGrid} aria-label="选择作物">
            {overview.crops.map((crop) => {
              const seedBalance = seedQuantity(
                overview,
                crop.plantCost.seedSlug,
              );
              const levelLocked = overview.farm.level < crop.requiredLevel;
              const insufficient =
                overview.assets.water < crop.plantCost.water ||
                seedBalance < crop.plantCost.seedQuantity;
              const disabled = !selectedPlot || levelLocked;
              const displayedGrowSeconds = overview.onboarding.quickGrowAvailable
                ? Math.min(
                    crop.growSeconds,
                    overview.onboarding.quickGrowSeconds,
                  )
                : crop.growSeconds;

              return (
                <button
                  type="button"
                  key={crop.slug}
                  className={`${styles.cropOption} ${
                    selectedCropSlug === crop.slug ? styles.selectedCrop : ''
                  }`}
                  disabled={disabled}
                  aria-pressed={selectedCropSlug === crop.slug}
                  onClick={() => {
                    setSelectedCropSlug(crop.slug);
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                >
                  <span className={styles.cropEmoji} aria-hidden="true">
                    {crop.emoji}
                  </span>
                  <strong>{crop.name}</strong>
                  <span>
                    {overview.onboarding.quickGrowAvailable
                      ? `本次新手加速：${formatDuration(displayedGrowSeconds)}`
                      : `成熟时间：${formatDuration(displayedGrowSeconds)}`}
                  </span>
                  <span>收获：{rewardText(crop)}</span>
                  <small>
                    消耗 {crop.plantCost.water} 水滴 ·{' '}
                    {crop.plantCost.seedQuantity} 颗种子（持有 {seedBalance}）
                  </small>
                  {levelLocked && <em>农场 Lv.{crop.requiredLevel} 解锁</em>}
                  {!levelLocked && overview.onboarding.quickGrowAvailable && (
                    <em>首次种植自动加速</em>
                  )}
                  {!levelLocked && insufficient && <em>当前资源不足</em>}
                </button>
              );
            })}
          </div>

          {selectedPlot && (
            <div className={styles.plantActions}>
              <span>
                {selectedCrop
                  ? `已选择：${selectedCrop.emoji} ${selectedCrop.name}`
                  : '请选择一种作物'}
              </span>
              <div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedPlotId(null);
                    setSelectedCropSlug(null);
                    setActionSuccess(null);
                  }}
                >
                  取消
                </Button>
                <Button
                  disabled={!canPlant}
                  loading={busyPlotId === selectedPlot.id}
                  onClick={() => void handlePlant()}
                >
                  开始种植
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
      )}

      {overview.onboarding.firstHarvestCompleted && (
      <details className={styles.guideDetails}>
        <summary>
          <span>
            <strong>玩法说明</strong>
            <small>查看资源来源、种植与收获规则</small>
          </span>
          <span className={styles.summaryChevron} aria-hidden="true">
            ↓
          </span>
        </summary>
        <div className={styles.guideBody}>
          <div className={styles.guideGrid}>
            <article>
              <span aria-hidden="true">01</span>
              <strong>领取初始资源</strong>
              <p>
                首次进入获得 4 水滴、4 颗小麦种子、2 颗草莓种子和 1
                颗咖啡种子。
              </p>
            </article>
            <article>
              <span aria-hidden="true">02</span>
              <strong>选择土地与作物</strong>
              <p>点击空地后选择作物，种植会扣除卡片标明的种子和水滴。</p>
            </article>
            <article>
              <span aria-hidden="true">03</span>
              <strong>等待成熟</strong>
              <p>
                首次种植只需 30 秒；之后恢复作物原时长，关闭页面也不会停止生长。
              </p>
            </article>
            <article>
              <span aria-hidden="true">04</span>
              <strong>收获奖励</strong>
              <p>首次收获额外获得 40 农场 EXP，立即升到 Lv.2 并解锁咖啡。</p>
            </article>
          </div>
          <p className={styles.guideNote}>
            默认开放 4 块土地，农场达到 Lv.5 后开放第 5 块；每日签到可获得
            5 水滴。
          </p>
        </div>
      </details>
      )}
    </section>
  );
}
