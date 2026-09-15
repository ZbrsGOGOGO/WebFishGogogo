export interface LocalLabGame {
  slug: string;
  title: string;
  draftTitle: string;
  mark: string;
  genre: string;
  description: string;
  controls: string;
  time: string;
  device: string;
  source: string;
  author: string;
  license: string;
  licensePath: string;
}

/** Reviewed local programs only; never turn a URL parameter into an iframe URL. */
export const LOCAL_LAB_GAMES: readonly LocalLabGame[] = [
  { slug: 'server-survival', title: '云架构守关 · Server Survival', draftTitle: '架构演练稿', mark: 'CLOUD', genre: '策略守关', description: '建服务器、连接服务、挡住流量冲击；生存、关卡与自由实验各有节奏。', controls: '点击选择服务，在场景中建设和连线；鼠标调整视角，触屏可缩放。先跟着原版引导完成第一套架构。', time: '关卡 / 生存 / 自由实验', device: '桌面优先 · 触屏可操作', source: 'https://github.com/pshenok/server-survival', author: 'Kostyantyn Pshenychnyy', license: 'MIT', licensePath: '/licenses/server-survival-MIT.txt' },
  { slug: 'whatajong', title: '麻将奇旅 · Whatajong', draftTitle: '牌组推演稿', mark: 'TILES', genre: '消除 × Roguelike', description: '配对麻将牌，组合特殊牌和商店升级，把一轮消除变成有策略的闯关。', controls: '点击两张可配对的牌；特殊牌、升级与每轮目标沿用原版。界面内的帮助和提示可随时查看。', time: '分轮闯关 · 随时收起', device: '鼠标 / 触屏', source: 'https://github.com/masylum/whatajong', author: 'Pao Ramon / Whatajong contributors', license: 'MIT', licensePath: '/licenses/whatajong-MIT.txt' },
  { slug: 'hextris', title: '六角叠叠 · Hextris', draftTitle: '色块整理稿', mark: 'HEX', genre: '反应 × 消除', description: '旋转六边形接住彩色条块，连成同色消除；速度逐渐增加，考验判断和节奏。', controls: '左右方向键旋转，或点击 / 触碰画面左右两侧；先观察颜色再接块。失焦或收起时暂停。', time: '几分钟一局', device: '键盘 / 触屏', source: 'https://github.com/Hextris/hextris', author: 'Hextris contributors', license: 'GPL-3.0-or-later', licensePath: '/licenses/hextris-GPL-3.0.txt' },
  { slug: 'connect-four', title: '四子连线 · c4', draftTitle: '棋局推演稿', mark: 'FOUR', genre: 'AI 对弈', description: '让四枚棋子连成一线；可以挑战 AI、同屏两人轮流落子，或观察 AI 对弈。', controls: '选择一列落子，横竖斜四连获胜。人机与同屏双人都在同一台设备进行，不是本站联网房间。', time: '短局对弈', device: '鼠标 / 触屏', source: 'https://github.com/kenrick95/c4', author: 'Kenrick', license: 'MIT', licensePath: '/licenses/c4-MIT.txt' },
  { slug: 'radius-raid', title: '环域突围 · Radius Raid', draftTitle: '轨迹演练稿', mark: 'RAID', genre: '街机生存', description: '在几何战场走位、瞄准和收集道具，面对不断变化的敌群，努力撑过下一波。', controls: 'WASD 或方向键移动，鼠标瞄准并射击。需要桌面键鼠，手机建议选择麻将、四子棋或六角消除。', time: '波次生存', device: '桌面键鼠', source: 'https://github.com/jackrugile/radius-raid', author: 'Jack Rugile', license: 'MIT', licensePath: '/licenses/radius-raid-MIT.txt' },
  { slug: 'in-ascent', title: '星际开拓 · inAscent', draftTitle: '航线演练稿', mark: 'ASCENT', genre: '太空经营', description: '经营地球基地、建造设施和管理资源，派出探索、采矿与殖民任务，向太阳系拓展。', controls: '点击星球和建筑，跟随原版教程管理时间、资源和任务。界面较大，建议桌面或手机横屏并放大工作稿。', time: '基地经营 / 星球探索', device: '桌面 / 横屏触控', source: 'https://github.com/foumart/JS.13kGames.2021_inAscent', author: 'Noncho Savov', license: 'MIT', licensePath: '/licenses/in-ascent-MIT.txt' },
];

export function findLocalLabGame(slug: string | undefined): LocalLabGame | undefined {
  return LOCAL_LAB_GAMES.find(game => game.slug === slug);
}
