# 低调小窗游戏：锁定源码审查

审查日期：2026-09-09。两款在许可审查后已实现本地 React 版本，**不据此宣称生产已经上线**。现有蛇、方块、坦克、画猜不重复扩充；也不把客户端本地分数直接兑换平台货币。

## 本次实现

- `/games/office-2048`：`Office2048Page`，类型化不可变移动核心、灰蓝表格稿、手机滑动和按钮、局部键盘事件；进度只在内存，不使用任何浏览器存储或服务器接口。
- `/games/underrun`：`UnderrunPage`，原上游核心封装为无全局输入的独立模块实例，四个原始小 PNG 直接嵌入为 data URL。没有 iframe、eval、CDN 或外站请求；没有音频上下文，原 Sonant-X / 音乐 / 音效代码完全不加载，保留其上游来源说明。
- 两款复用游戏前台互斥信号；Esc、窗口失焦、页签隐藏均暂停；账号身份 / 路径变化销毁本地进度。Underrun 显式释放 rAF、图像回调、图形对象与 WebGL 上下文，模拟计时任务只在活动帧推进，不在隐藏页跑 timeout。
- UI 明确「本地练习，不计官方排行榜、办公币或奖励」，署名和许可位于 `public/licenses/office-2048-MIT.txt`、`underrun-MIT.txt`、`underrun-Sonant-X-zlib.txt`。
- 本地 24 项逻辑、React 生命周期与实际改编运行时测试通过：真实关卡解析与模拟 / 渲染一帧、暂停零调度、加载中卸载、幂等图形释放、无 WebGL 降级、账号清理、移动操作和输入互斥。前端类型检查通过；真实浏览器验收与总发布结果另记。
- 本地 Firefox 154.0.1 实际浏览器验收通过：原生方向键改变 2048 棋盘；真实 WebGL 着色/纹理/动画运行，页面无异常、零 AudioContext、资源列表零第三方请求；打开另一款使原练习收起；Esc 后连续 600 毫秒零 rAF 回调；账号身份切换销毁两款进度与图形循环；390px 视口宽度无溢出，真实浏览器上的合成 PointerEvent 滑动可移动棋盘。该验收使用本地 UI 夹具，**不是生产认证或生产部署验收**。

## 候选 1：2048 →「数值整理」工作稿

- 上游：[gabrielecirulli/2048](https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc)，锁定 `478b6ec346e3787f589e4af751378d06ded4cbbc`。
- 授权：[MIT 原文](https://github.com/gabrielecirulli/2048/blob/478b6ec346e3787f589e4af751378d06ded4cbbc/LICENSE.txt)，署名 Gabriele Cirulli；保留版权和许可，不宣称本站为官方。
- 本次本地源码检查：10 个 JS 共 23481 字节，原 CSS 20647 字节，无运行时包依赖、CDN、fetch / XHR / WebSocket 或追踪脚本。棋盘和动画为 DOM/CSS，本地存档。
- 不搬 `style/fonts/`：原仓库附带 ClearSans 字体但本次目录未见独立字体许可，本站使用系统字体；不需要原 favicon、启动图、品牌图，也不保留「官方站点」宣称和推广链接。
- 适配成本低：抽离 Grid / Tile / GameManager 为可测试模块；棋盘缩至 320–420px，灰蓝表格风，键盘只在棋盘聚焦时响应，不能截获聊天框 WASD / R。Esc 收起、失焦停输入，卸载注销所有监听；原实现没有持续运行的模拟循环，暂停主要是输入门控和一次性动画取消。
- 本地存档必须以账号 publicId 命名或不跨会话保留，避免共用电脑串账号；若以后接共享排行，需要服务端回放移动序列或权威状态，不能接受浏览器自报 score。

## 候选 2：Underrun →「机房巡检」工作稿

- 上游：[phoboslab/underrun](https://github.com/phoboslab/underrun/tree/f933e29152d7fc1ca61d4b3eaa8b29551d7d7a62)，锁定 `f933e29152d7fc1ca61d4b3eaa8b29551d7d7a62`。
- 主项目 [MIT](https://github.com/phoboslab/underrun/blob/f933e29152d7fc1ca61d4b3eaa8b29551d7d7a62/LICENSE.md)，Dominic Szablewski；声音合成器含 [Sonant-X zlib 声明](https://github.com/phoboslab/underrun/blob/f933e29152d7fc1ca61d4b3eaa8b29551d7d7a62/source/sonantx-reduced.js)，需要完整保留原声明并标记修改。
- 本次本地源码检查：18 个 JS 加 4 个 PNG 合计 48067 字节，地图 `l1/l2/l3.png` 合计 920 字节，纹理 `q2.png` 2171 字节；资源是本地相对路径，未见 CDN、后台通信或追踪代码。上游是 WebGL 双摇杆射击，不是原生白纸画风。
- 不直接运行历史 `build.sh`：依赖旧压缩器、内含构建产物删除命令，不是本站构建入口；用既有构建系统打包审查过的源码，或暂留为候选。
- 适配成本中等：限制画布 420×280 左右，低饱和线框/巡检说明替代霓虹全屏，鼠标坐标基于容器换算。为持续 `game_tick` 保存并取消 rAF，停止终端字效 timeout，清空按键，默认静音；Esc / 失焦 / 页面隐藏时 suspend AudioContext，恢复时重置时间基线，卸载释放 WebGL、音源及监听。原源码的网页隐藏仅有浏览器节流，不能当作已实现暂停。
- 先做单机候选。原项目没有可直接复用的权威联网后端，不能把该候选误列为已实现建房对战。

## 不采用

- [regularkid/offtheline](https://github.com/regularkid/offtheline/tree/bc28c8ec97a57282bc05cf691c652c0bc335fc24)，本次锁定 `bc28c8ec97a57282bc05cf691c652c0bc335fc24`。检查根目录、README、源码与构建入口均未见许可声明；[js13kGames 收录 fork](https://github.com/js13kGames/off-the-line)也没有补足清晰授权。画面确实适合线稿，但公开可读不等于允许二次分发，当前不拷贝。
- `eliasku/13`：主任务审查尚未确认总许可，不以猜测许可方式补数。

最终采用前应追加自动化：静态外链扫描、浏览器零第三方请求、卸载后零循环、隐藏后零输入、跨账号存档隔离、手机触控、Esc 不穿透到聊天室，以及许可证随构建产物保留检查。
