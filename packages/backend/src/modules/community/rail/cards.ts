import type { RailCardKind } from '@stealth-reader/shared';

export interface RailCardTemplate { templateId: string; title: string; description: string }
export const RAIL_DECK_VERSION = 'rail-deck-20260909-v2';

const FICTION = '仅为本轮虚构情境，不是现实事实或对现实人物的指控。请结合条件牌展开讨论。';
const CONDITION = '仅是附加的虚构辩论条件，不改变发牌、胜负规则、现实资产或账号办公币。';
const card = (key: string, title: string, description = FICTION): RailCardTemplate =>
  Object.freeze({ templateId: `rail-v2-${key}`, title, description });

/** Versioned code-native deck. Never migrate/delete persisted hands or replay old
 * cards through this catalog: an issued RailCard already contains its full text.
 * Each hand samples independently (3 distinct templates per kind); templates may
 * recur across players, while their per-seat/per-round instance IDs remain unique.
 * Content adjustments are documented in docs/RAIL_DECK_V2_20260909.md. */
export const RAIL_CARDS: Readonly<Record<RailCardKind, readonly RailCardTemplate[]>> = Object.freeze({
  good: Object.freeze([
    card('good-01', '一个老奶奶'),
    card('good-02', '正在吃饭的一年级儿童'),
    card('good-03', '环卫工人'),
    card('good-04', '一只猫'),
    card('good-05', '正在准备音乐晚会的大二学生'),
    card('good-06', '准备去面试的应届生'),
    card('good-07', '你养的所有宠物'),
    card('good-08', '你的兄弟姐妹朋友们'),
    card('good-09', '圣诞老人'),
    card('good-10', '上帝'),
    card('good-11', '刘亦菲'),
    card('good-12', '吴彦祖'),
    card('good-13', '姆巴佩'),
    card('good-14', '刚降落地球的友善外星人'),
    card('good-15', '一个创造了时光机的人'),
    card('good-16', '以后可能会爱上你的人'),
    card('good-17', '会给你未来指明道路的高人'),
    card('good-18', '一个会仙术的老头'),
    card('good-19', '孙悟空'),
  ]),
  bad: Object.freeze([
    card('bad-01', '一个携带丧尸病毒的人'),
    card('bad-02', '校园恶霸'),
    card('bad-03', '川普'),
    card('bad-04', '正在计划让全世界经济崩溃的金融家'),
    card('bad-05', '盘踞虚构岛屿、绑架旅人的海盗团伙'),
    card('bad-06', '你的顶头上司'),
    card('bad-07', '你所有的前任'),
    card('bad-08', '一个随地大小便的人'),
    card('bad-09', '连环杀人魔'),
    card('bad-10', '强奸犯'),
    card('bad-11', '一个计划把学校当成靶场的歹徒'),
    card('bad-12', '一个会把谋杀案嫁祸到你头上的黑警'),
    card('bad-13', '大毒枭'),
    card('bad-14', '一只永生并且不断追杀你的蜗牛'),
    card('bad-15', '一群绝对会在你头上拉屎的海鸥'),
    card('bad-16', '骗你家人进传销的组织'),
    card('bad-17', '故意克扣饭菜还把餐费据为己有的食堂阿姨'),
    card('bad-18', '计划今晚抢劫你家的歹徒'),
  ]),
  buff: Object.freeze([
    card('buff-01', '有一次复活能力', CONDITION),
    card('buff-02', '可以让你身价暴涨1个亿', CONDITION),
    card('buff-03', '你会爱上Ta', CONDITION),
    card('buff-04', 'Ta背地里是一个连环杀人案凶手', CONDITION),
    card('buff-05', 'Ta是一个间谍', CONDITION),
    card('buff-06', '死亡后列车长获取一项随机超能力', CONDITION),
    card('buff-07', '其实是披着人皮的蜥蜴怪', CONDITION),
    card('buff-08', '死后会以超乎你想象的强大姿态复活', CONDITION),
    card('buff-09', '愿意把豪华邮轮送给你，只要你能放过Ta', CONDITION),
    card('buff-10', '电车会缓慢的碾过Ta，让Ta感受痛苦', CONDITION),
    card('buff-11', '救了Ta会成为你的死侍', CONDITION),
    card('buff-12', '正准备去打你一顿', CONDITION),
    card('buff-13', '知道你的电话号码和家庭地址', CONDITION),
    card('buff-14', '在遗嘱里把你列为唯一继承人', CONDITION),
  ]),
});
