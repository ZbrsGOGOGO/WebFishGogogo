import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import {
  arenaApi,
  type ArenaBattleLog,
  type ArenaBattleResult,
  type ArenaBootstrap,
  type ArenaOffer,
  type ArenaOfferTier,
} from '../../../api/arena';
import {
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Tag,
} from '../../../components/ui';
import styles from './ArenaPage.module.css';

const numberFormatter = new Intl.NumberFormat('zh-CN');

const ATTRIBUTE_LABELS = {
  focus: '专注',
  inspiration: '灵感',
  mindset: '心态',
  slacking: '应变',
  execution: '执行',
} as const;

const ATTRIBUTE_HINTS: Record<keyof typeof ATTRIBUTE_LABELS, string> = {
  focus: '影响先手顺序',
  inspiration: '影响暴击概率',
  mindset: '影响生命与防御',
  slacking: '影响闪避概率',
  execution: '影响基础攻击',
};

const TIER_META: Record<
  ArenaOfferTier,
  { label: string; description: string; className: string }
> = {
  easy: {
    label: '轻松',
    description: '稳定成长',
    className: styles.easy,
  },
  even: {
    label: '均势',
    description: '推荐挑战',
    className: styles.even,
  },
  risky: {
    label: '危险',
    description: '高风险回报',
    className: styles.risky,
  },
};

const CURRENCY_LABELS: Record<string, string> = {
  officeCoin: '办公币',
  decorationCoin: '装饰币',
  OFFICE_COIN: '办公币',
  DECORATION_COIN: '装饰币',
};

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    if (/expired|过期/i.test(error.message)) {
      return '本轮对手已经刷新，请重新选择后再挑战。';
    }
    if (/consumed|已使用/i.test(error.message)) {
      return '这组对手已经结算，请从新一轮中重新选择。';
    }
    return error.message;
  }
  return fallback;
}

function profilePower(attributes: ArenaBootstrap['profile']['attributes']): number {
  const maxHealth = 100 + attributes.mindset * 5;
  const criticalRate = Math.min(attributes.inspiration / 100, 0.35);
  const dodgeRate = Math.min(attributes.slacking / 100, 0.25);
  return Math.round(
    maxHealth +
      attributes.execution * 12 +
      attributes.mindset * 8 +
      attributes.focus * 5 +
      criticalRate * 500 +
      dodgeRate * 500,
  );
}

function matchSummary(playerPower: number, opponentPower: number): string {
  const ratio = playerPower / Math.max(1, opponentPower);
  if (ratio >= 1.15) return '战力占优';
  if (ratio <= 0.85) return '挑战较难';
  return '实力接近';
}

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function battleLogText(log: ArenaBattleLog): string {
  if (typeof log === 'string') {
    return log;
  }
  return log.round != null ? `第 ${log.round} 回合：${log.text}` : log.text;
}

function chooseDefaultOffer(offers: ArenaOffer[]): string | null {
  return (
    offers.find((offer) => offer.tier === 'even')?.id ??
    offers[0]?.id ??
    null
  );
}

function battleTitle(result: ArenaBattleResult): string {
  return result.battle.result === 'win' ? '较量胜利' : '本次失利';
}

function formatBattleTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ArenaPage(): JSX.Element {
  const [bootstrap, setBootstrap] = useState<ArenaBootstrap | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [battleResult, setBattleResult] =
    useState<ArenaBattleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [battling, setBattling] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [battleError, setBattleError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const lastAutoRefreshExpiration = useRef<number | null>(null);

  const loadBootstrap = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await arenaApi.getBootstrap();
      const browserTime = Date.now();
      const serverTime = Date.parse(next.serverTime);
      setBootstrap(next);
      setSelectedOfferId(chooseDefaultOffer(next.offers));
      setClock(browserTime);
      setServerOffsetMs(
        Number.isFinite(serverTime) ? serverTime - browserTime : 0,
      );
    } catch (error) {
      setLoadError(readableError(error, '斗技场加载失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedOffer = useMemo(
    () =>
      bootstrap?.offers.find((offer) => offer.id === selectedOfferId) ?? null,
    [bootstrap, selectedOfferId],
  );
  const offerExpiresAt = useMemo(
    () =>
      bootstrap?.offers.reduce(
        (earliest, offer) =>
          Math.min(earliest, new Date(offer.expiresAt).getTime()),
        Number.POSITIVE_INFINITY,
      ) ?? Number.POSITIVE_INFINITY,
    [bootstrap?.offers],
  );
  const offerRemaining = Number.isFinite(offerExpiresAt)
    ? offerExpiresAt - (clock + serverOffsetMs)
    : 0;

  useEffect(() => {
    if (
      !bootstrap?.unlocked ||
      bootstrap.offers.length === 0 ||
      !Number.isFinite(offerExpiresAt) ||
      offerRemaining > 0 ||
      loading ||
      battling ||
      lastAutoRefreshExpiration.current === offerExpiresAt
    ) {
      return;
    }

    lastAutoRefreshExpiration.current = offerExpiresAt;
    void loadBootstrap();
  }, [
    battling,
    bootstrap?.offers.length,
    bootstrap?.unlocked,
    loadBootstrap,
    loading,
    offerExpiresAt,
    offerRemaining,
  ]);

  const handleBattle = async (): Promise<void> => {
    if (!selectedOffer || !bootstrap || battling || bootstrap.profile.energy < 1) {
      return;
    }

    setBattling(true);
    setBattleError(null);
    try {
      const result = await arenaApi.startBattle(selectedOffer.id);
      setBattleResult(result);
      await loadBootstrap();
    } catch (error) {
      setBattleError(readableError(error, '较量失败，请稍后重试。'));
    } finally {
      setBattling(false);
    }
  };

  if (loading && !bootstrap) {
    return (
      <section aria-label="午休斗技场">
        <PageHeader title="午休斗技场" subtitle="一场只需几十秒。" />
        <Card>
          <div className={styles.pageState} role="status" aria-live="polite">
            正在加载斗技场…
          </div>
        </Card>
      </section>
    );
  }

  if (loadError && !bootstrap) {
    return (
      <section aria-label="午休斗技场">
        <PageHeader title="午休斗技场" subtitle="一场只需几十秒。" />
        <Card>
          <div className={styles.pageState} role="alert">
            <p>{loadError}</p>
            <Button variant="secondary" onClick={() => void loadBootstrap()}>
              重新加载
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  if (!bootstrap) {
    return (
      <section aria-label="午休斗技场">
        <PageHeader title="午休斗技场" />
        <Card>
          <EmptyState icon="⚑" message="暂无斗技场数据" />
        </Card>
      </section>
    );
  }

  const profile = bootstrap.profile;
  const battleClass = profile.battleClass?.trim() || '综合型';

  if (!bootstrap.unlocked) {
    const levelsRemaining = Math.max(
      0,
      bootstrap.unlockLevel - profile.level,
    );

    return (
      <section aria-label="午休斗技场">
        <PageHeader
          title="午休斗技场"
          subtitle="通过日常任务与农场积累经验，达到等级后即可进入。"
        />
        <Card>
          <EmptyState
            icon="LV"
            title={`Lv.${bootstrap.unlockLevel} 解锁`}
            message={`当前 Lv.${profile.level}，还需要提升 ${levelsRemaining} 级。`}
            actions={
              <div className={styles.unlockActions}>
                <a href="/">查看每日任务</a>
                <a href="/farm">前往农场</a>
              </div>
            }
          />
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="午休斗技场">
      <PageHeader
        title="午休斗技场"
        subtitle="单人策略挑战 · 选择难度后由本机服务安全结算战斗。"
        actions={
          <a className={styles.backLink} href="/games">
            ← 返回游戏中心
          </a>
        }
      />

      {loadError && (
        <div className={styles.refreshWarning} role="alert">
          <span>最新状态刷新失败，当前展示的是上次成功加载的数据。</span>
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => void loadBootstrap()}
          >
            重新同步
          </Button>
        </div>
      )}

      <div className={styles.layout}>
        <Card className={styles.profileCard} title="我的战力">
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              工
            </span>
            <div>
              <strong>{profile.title}</strong>
              <span>
                Lv.{profile.level} · {battleClass}
              </span>
            </div>
            <div className={styles.energy}>
              <span>精力</span>
              <strong>
                {profile.energy} / {profile.energyCap}
              </strong>
            </div>
          </div>

          <div className={styles.powerSummary}>
            <span>综合战力</span>
            <strong>{numberFormatter.format(profilePower(profile.attributes))}</strong>
            <small>按当前五项能力自动换算</small>
          </div>

          <dl className={styles.attributes} aria-label="角色属性">
            {(
              Object.keys(ATTRIBUTE_LABELS) as Array<
                keyof typeof ATTRIBUTE_LABELS
              >
            ).map((key) => (
              <div key={key} title={ATTRIBUTE_HINTS[key]}>
                <dt>{ATTRIBUTE_LABELS[key]}</dt>
                <dd>{numberFormatter.format(profile.attributes[key])}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card
          className={styles.battleCard}
          title={
            <span className={styles.offerHeading}>
              选择本轮对手
              {bootstrap.offers.length > 0 ? (
                <small>刷新倒计时 {formatRemaining(offerRemaining)}</small>
              ) : null}
            </span>
          }
        >
          {battleError && (
            <p className={styles.actionError} role="alert">
              {battleError}
            </p>
          )}

          {bootstrap.offers.length > 0 ? (
            <div className={styles.offers} aria-label="可挑战对手">
              {bootstrap.offers.map((offer) => {
                const tier = TIER_META[offer.tier];
                return (
                  <button
                    type="button"
                    key={offer.id}
                    className={`${styles.offer} ${tier.className} ${
                      selectedOfferId === offer.id ? styles.selectedOffer : ''
                    }`}
                    aria-pressed={selectedOfferId === offer.id}
                    onClick={() => {
                      setSelectedOfferId(offer.id);
                      setBattleError(null);
                    }}
                  >
                    <span className={styles.offerTopline}>
                      <Tag
                        color={
                          offer.tier === 'easy'
                            ? 'success'
                            : offer.tier === 'risky'
                              ? 'danger'
                              : 'brand'
                        }
                      >
                        {tier.label}
                      </Tag>
                      <small>{tier.description}</small>
                    </span>
                    <strong>{offer.opponentName}</strong>
                    <span>Lv.{offer.opponentLevel}</span>
                    <span>战力 {numberFormatter.format(offer.power)}</span>
                    <span className={styles.matchSummary}>
                      {matchSummary(
                        profilePower(profile.attributes),
                        offer.power,
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon="☕"
              title="对手正在开会"
              message="暂时没有可挑战的对手，请稍后刷新。"
              actions={
                <Button variant="secondary" onClick={() => void loadBootstrap()}>
                  刷新对手
                </Button>
              }
            />
          )}

          {bootstrap.offers.length > 0 && (
            <div className={styles.battleActions}>
              <span>
                {selectedOffer
                  ? `已选择：${selectedOffer.opponentName}`
                  : '请选择一位对手'}
              </span>
              <Button
                loading={battling}
                disabled={!selectedOffer || profile.energy < 1}
                onClick={() => void handleBattle()}
              >
                {profile.energy < 1 ? '精力不足' : '消耗 1 精力开始较量'}
              </Button>
              {profile.energy < 1 ? (
                <a className={styles.energyLink} href="/farm">
                  去农场收获咖啡补充精力
                </a>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      <Card className={styles.historyCard} title="最近战绩">
        <div className={styles.historySummary} aria-label="最近战绩汇总">
          <span>
            胜利{' '}
            <strong>
              {
                bootstrap.recentBattles.filter(
                  (battle) => battle.result === 'win',
                ).length
              }
            </strong>
          </span>
          <span>
            失利{' '}
            <strong>
              {
                bootstrap.recentBattles.filter(
                  (battle) => battle.result === 'loss',
                ).length
              }
            </strong>
          </span>
        </div>
        {bootstrap.recentBattles.length > 0 ? (
          <ul className={styles.historyList}>
            {bootstrap.recentBattles.map((battle) => (
              <li key={battle.id}>
                <Tag color={battle.result === 'win' ? 'success' : 'danger'}>
                  {battle.result === 'win' ? '胜利' : '失利'}
                </Tag>
                <strong>{battle.opponentName}</strong>
                <time dateTime={battle.createdAt}>
                  {formatBattleTime(battle.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="📋"
            message="还没有战斗记录，选择一位对手开始第一场较量吧。"
          />
        )}
      </Card>

      <Modal
        open={battleResult != null}
        onClose={() => setBattleResult(null)}
        title={battleResult ? battleTitle(battleResult) : undefined}
        footer={
          <Button onClick={() => setBattleResult(null)}>完成</Button>
        }
      >
        {battleResult && (
          <div className={styles.result}>
            <p className={styles.rewardNotice}>以下奖励已自动存入账户。</p>
            <div className={styles.resultSummary}>
              <span>共 {battleResult.battle.roundsPlayed} 回合</span>
              <strong>+{battleResult.reward.experience} EXP</strong>
              {Object.entries(battleResult.reward.currencies ?? {}).map(
                ([currency, amount]) => (
                  <strong key={currency}>
                    +{numberFormatter.format(amount)}{' '}
                    {CURRENCY_LABELS[currency] ?? currency}
                  </strong>
                ),
              )}
              <span>剩余精力 {battleResult.energy}</span>
            </div>
            <ol className={styles.logs} aria-label="文字战报">
              {battleResult.battle.logs.map((log, index) => (
                <li key={`${battleResult.battle.id}-${index}`}>
                  {battleLogText(log)}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Modal>
    </section>
  );
}
