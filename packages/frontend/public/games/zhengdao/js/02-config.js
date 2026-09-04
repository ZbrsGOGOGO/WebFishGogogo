/* User-provided source archive SHA-256: 34ec6528a54acb3e593c9b9a8d0deb9ea0d3723c2d795ad32cf457671f8415a3. */
/* =========================================================================
 * 02-config.js  ·  可调参数 · 平衡性开关（★改数值只改这里★）  →  window.ZT.config
 * -------------------------------------------------------------------------
 * 想调难度、调爆率、调寿元、调突破曲线，全部在本文件完成，无需动推演引擎。
 * 依赖：无。引擎通过 ZT.config.X 读取。
 * ========================================================================= */
(function(ZT){
  'use strict';

  /* ============ 一、帝兵祭炼 ============ */
  const DIBING_PROB     = 0.03;  // 非天生帝兵传承种族，证道前祭炼出帝兵的概率
  const DIBING_PROB_NAT = 0.30;  // 天生帝兵传承种族，更易成帝兵

  /* ============ 二、黑暗动乱 ============ */
  const DARK_TURMOIL_SURVIVE = 0.85; // 北斗·葬帝星新晋准帝时「黑暗动乱」的存活率

  /* ============ 三、大帝劫 · 禁区至尊夺舍 ============ */
  // 证道称帝那刻，沉睡的禁区至尊会乘虚而入。战力达到安全线则至尊不敢妄动；
  // 低于安全线时，按「差额」换算夺舍概率（天帝不参与此判）。
  const DAJIE_CP_THRESHOLD = 39900; // 安全线（实测：能活到证道的大帝战力普遍在 39300~41000）
  const DAJIE_USURP_STEP   = 0.5;   // 每低于安全线 1000 钧战力，被夺舍概率 +50%
  const DAJIE_USURP_MAX    = 0.9;   // 夺舍概率封顶

  /* ============ 四、大帝寿元 · 逆活九世 · 不死药 ============ */
  const NIHUO_SPAN      = 800;   // 大帝每约 800 年极尽升华、逆活一世
  const NIHUO_TP_BASE   = 0.87;  // 第一世逆活之劫成功率
  const NIHUO_TP_DEC    = 0.015; // 每多逆活一世，天劫成功率递减
  const LONGSHENG_PROB  = 0.60;  // 九世圆满后，领悟「长生真意」的概率
  const IMMORTAL_PROB   = 0.035; // 大帝证道时身负「仙门之契」的概率
  const EMPEROR_LIFESPAN = 15000; // 大帝寿元：约一万五千载
  const ELIXIR_PROB     = 0.40;  // 大帝在位期间寻得「不死药」之概率
  const EARLY_EAT_PROB  = 0.45;  // 诸帝大战惨烈时，提前服下不死药的概率

  /* ============ 五、天心印记 · 天帝 ============ */
  const TIANDI_BASE      = 0.06;
  const TIANDI_APT_BONUS = 0.06;
  const TIANDI_T0_BONUS  = 0.10;
  const TIANDI_T1_BONUS  = 0.04;

  /* ============ 六、大帝晚年自斩一刀 · 成仙路 ============ */
  const ZIZHAN_DELAY     = 9000;
  const ZIZHAN_PROB      = 0.55;
  const ZIZHAN_LIFESPAN  = 30000;
  const ZIZHAN_WAIT_MIN  = 8000, ZIZHAN_WAIT_MAX = 28000;
  const ZIZHAN_XIAN_PROB = 0.40;

  /* ============ 七、突破曲线（仙台之后） ============ */
  const BT_BASE_RE     = 0.85;
  const BT_SLOPE_RE    = 0.012;
  const BT_BASE_NONRE  = 0.52;
  const BT_SLOPE_NONRE = 0.032;
  const BT_P37_PENALTY = 0.11;

  /* ============ 八、突破失败的死亡率（高境界） ============ */
  const DEATH_29      = 0.24;
  const DEATH_37_WP   = 0.28;
  const DEATH_37_NOWP = 0.52;

  /* ============ 九、诡异红毛（源天师·准帝九重天专属） ============ */
  const REDHAIR_DEATH_PROB = 0.02; // 源天师至准帝九重天、周身生诡异红毛，逐年「红毛噬主」身死概率；仅此死法触发 java 彩蛋

  /* ============ 九、本地存档 Key ============ */
  const ACH_KEY  = 'momo.zhengdao.achievements.v1';  // 成就
  const LS_KEY   = 'momo.zhengdao.life-history.v1';  // 命格录

  /* ============ 十、爽玩模式覆盖（ZT.mode==='shuang' 时启用）============
   * 目标：成帝概率≈20%、成仙概率≈5%（原「如履薄冰」成帝≈0.15%）。
   * 思路：把「突破成功率 / 突破失败死亡率 / 大帝劫夺舍 / 成仙路争渡」整体抬升，
   * 其余不变（仍是遮天味，只是命运对你温柔许多）。
   */
  const SH_BT_BASE_LOW    = 0.99;   // realm<23 基础突破率
  const SH_BT_BASE_RE     = 0.99;   // 仙台后·轮回重修
  const SH_BT_SLOPE_RE    = 0.003;
  const SH_BT_BASE_NONRE  = 0.99;   // 仙台后·非轮回
  const SH_BT_SLOPE_NONRE = 0.004;
  const SH_BT_FLOOR       = 0.90;   // 突破率下限（爽玩，绝不再卡 1.5%）
  const SH_P37_PEN        = 0.02;   // 准帝九重天突破惩罚（原 0.11）
  const SH_P38_PEN        = 0.02;   // 证道称帝突破惩罚（原 0.20）
  const SH_DEATH_LOW      = 0.0;    // realm<23 突破失败死亡率（爽玩：几乎不致死）
  const SH_DEATH_23       = 0.01;
  const SH_DEATH_29       = 0.02;
  const SH_DEATH_37_WP    = 0.01;
  const SH_DEATH_37_NOWP  = 0.03;
  const SH_USURP_MAX      = 0.0;    // 大帝劫夺舍封顶（爽玩：禁区至尊不敢妄动）
  const SH_NIHUO_TP_BASE  = 0.92;   // 逆活天劫成功率（爽玩，原 0.87）
  const SH_NIHUO_TP_DEC   = 0.010;  // 每多逆活一世递减
  const SH_LONGSHENG      = 0.10;   // 九世圆满·长生真意（爽玩：多数大帝悟性机缘不够，难成仙）
  const SH_ZIZHAN_PROB    = 0.50;   // 大帝晚年自斩概率（爽玩，原 0.55）
  const SH_ZIZHAN_XIAN    = 0.35;   // 成仙路争渡成功率（自斩后仅有一次极致升华之机，悟性机缘不足则老死）
  const SH_PROG_MUL       = 2.2;    // 进境速度乘数（爽玩：更快爬阶，方有机会登临帝境）
  const SH_LIFE_MUL       = 3.2;    // 先天寿元乘数（爽玩：命数绵长，不白白夭折于半途）

  /* ============ 十一、养成模式（ZT.mode==='yang' 时启用）============
   * 定位：温和慢养——命大、易成帝（复用「爽玩」宽厚曲线），主打慢节奏 + 高互动。
   * 玩法：每个大境界入口触发一次「修行侧重」抉择，把心力倾注到五个维度之一，
   *      维度累加形成持久偏向，界面实时呈现「养成 HUD」，数值可见可养。
   * 五个维度：战力（突破率+）/ 悟性（高境突破率+）/ 道心（突破失败死亡率-）/ 机缘（奇遇造化乘数+）/ 寿元（直接延寿）。
   */
  const YANG_FOCUS_REALMS = [1,5,10,14,17,20,23,26,29,32,35,37]; // 每个大境界入口触发一次「养成·修行侧重」
  const YANG_COMBAT_PROB  = 0.012;  // 每点「战力」侧重：突破成功率累加 +
  const YANG_COMP_PROB    = 0.010;  // 每点「悟性」侧重：突破成功率累加 +（含高境界）
  const YANG_HEART_DEATH  = 0.03;   // 每点「道心」侧重：突破失败死亡率 -（按概率免死，封顶 0）
  const YANG_FORTUNE_MUL  = 0.03;   // 每点「机缘」侧重：机缘乘数 +3%（奇遇/不死药/禁区造化）
  const YANG_LIFE_GAIN    = [120,360]; // 每点「寿元」侧重：直接延寿区间（载）
  // 抉择间隔：上一次抉择之后，须先攒够这么多条事件（即「这段路上发生的事」）才弹下一处养成抉择，
  // 避免出现「刚选完马上又弹一个」的连发感；若高境界事件稀疏，则最多等 YANG_GAP_MAX_YEARS 载便不再等。
  const YANG_GAP_EVENTS    = 6;   // 两次抉择之间至少间隔的事件条数（留出可读的修行过程）
  const YANG_GAP_MAX_YEARS = 300; // 等待上限（超时则照常弹，绝不丢失该次侧重抉择）

  /* ============ 十二、完美重生（出生时 天赋/家世/体质 皆臻顶尖）============
   * 定位：出生时随机属性全为顶级，即「完美重生」——这一生顺遂，且万般奇遇必拿下。
   * 判定（三者皆满足）：资质 SSS/SS（val>=PERFECT_APT_MIN）/ 体质 T0（T1 不配）/ 家世 帝子·圣子。
   */
  const PERFECT_APT_MIN   = 88;                 // 资质门槛：SSS·道骨仙姿 / SS·天纵之资
  const PERFECT_PHY_TIERS = ['T0'];             // 体质门槛：仅 T0 顶级——混沌体 / 先天圣体道胎（T1 不配）
  const PERFECT_FAM_IDS   = ['di','san'];       // 家世门槛：帝子·帝女 / 圣子·圣女

  // —— 大帝·活出下一世·悟道方法池 ——
  // 大帝（realm=38）寿元将尽前，须从下列方法中"想出/悟出"一种，方能活出下一世；
  // 未悟出者，帝落坐化。各法：kind=secondLife（再活一世，原地续帝途）/ immortal（直指长生·红尘仙）/ zizhan（自斩本源→静候成仙路）。
  const SECOND_LIFE_SPAN  = 15000;  // 续得第二世后，再活之寿元（约一万五千载）
  // —— 彩蛋常量 ——
  const ZHUZHU_BLESS_PROB = 0.40;  // 女帝获猪猪牛赐福的概率（赐福后更易活出下一世）
  const ZHUZHU_BLESS_MUL  = 1.70;  // 赐福对「续世悟道」成功率的乘数
  const NEXT_LIFE = {
    elixir:   {id:'elixir',   name:'直接服食不死药',     desc:'持不死药者，帝落之前吞之，可再活一世——二世重生，大帝果位犹在。', kind:'secondLife', need:'elixir'},
    zizhan:   {id:'zizhan',   name:'自斩本源悟道',       desc:'大帝晚年自斩一刀，自贬至尊，蛰伏禁区静候成仙路——他日踏过仙路，证得红尘仙。', kind:'zizhan'},
    xianyao:  {id:'xianyao',  name:'观摩仙药复生悟道',   desc:'观仙药一岁一枯荣、死而复生，悟长生真意——直指长生不朽。', kind:'immortal', prob:0.20},
    hundun:   {id:'hundun',   name:'化为混沌体悟道',     desc:'返本归元、化己身为混沌体，超脱物外——可活出下一世。', kind:'secondLife', prob:0.30},
    fan:      {id:'fan',      name:'化为凡体悟道',       desc:'褪去帝威、返璞归真，以凡体参天地——另类长生。', kind:'secondLife', prob:0.25},
    xianjing: {id:'xianjing', name:'体内积累仙精悟道',   desc:'于体内点滴积累仙精，水到渠成——长生可期。', kind:'immortal', prob:0.18}
  };

  ZT.config = {
    DIBING_PROB, DIBING_PROB_NAT, DARK_TURMOIL_SURVIVE,
    DAJIE_CP_THRESHOLD, DAJIE_USURP_STEP, DAJIE_USURP_MAX,
    NIHUO_SPAN, NIHUO_TP_BASE, NIHUO_TP_DEC, LONGSHENG_PROB, IMMORTAL_PROB,
    EMPEROR_LIFESPAN, ELIXIR_PROB, EARLY_EAT_PROB,
    TIANDI_BASE, TIANDI_APT_BONUS, TIANDI_T0_BONUS, TIANDI_T1_BONUS,
    ZIZHAN_DELAY, ZIZHAN_PROB, ZIZHAN_LIFESPAN, ZIZHAN_WAIT_MIN, ZIZHAN_WAIT_MAX, ZIZHAN_XIAN_PROB,
    BT_BASE_RE, BT_SLOPE_RE, BT_BASE_NONRE, BT_SLOPE_NONRE, BT_P37_PENALTY,
    DEATH_29, DEATH_37_WP, DEATH_37_NOWP, REDHAIR_DEATH_PROB,
    SH_BT_BASE_LOW, SH_BT_BASE_RE, SH_BT_SLOPE_RE, SH_BT_BASE_NONRE, SH_BT_SLOPE_NONRE,
    SH_BT_FLOOR, SH_P37_PEN, SH_P38_PEN, SH_DEATH_LOW, SH_DEATH_23,
    SH_DEATH_29, SH_DEATH_37_WP, SH_DEATH_37_NOWP, SH_USURP_MAX, SH_ZIZHAN_XIAN,
    SH_NIHUO_TP_BASE, SH_NIHUO_TP_DEC, SH_LONGSHENG, SH_ZIZHAN_PROB, SH_PROG_MUL, SH_LIFE_MUL,
    SECOND_LIFE_SPAN, NEXT_LIFE, ZHUZHU_BLESS_PROB, ZHUZHU_BLESS_MUL,
    YANG_FOCUS_REALMS, YANG_COMBAT_PROB, YANG_COMP_PROB, YANG_HEART_DEATH, YANG_FORTUNE_MUL, YANG_LIFE_GAIN,
    YANG_GAP_EVENTS, YANG_GAP_MAX_YEARS,
    PERFECT_APT_MIN, PERFECT_PHY_TIERS, PERFECT_FAM_IDS,
    ACH_KEY, LS_KEY
  };

})(window.ZT = window.ZT || {});
