# 每日热榜快照

`/news/trending` 优先在本站展示每日排名与标题，不嵌入第三方页面，不复制链接正文、图片或评论。快照每天 08:10（北京时间）更新一次。

## 站内数据源

- Hacker News 热门：[Hacker News 官方 API](https://github.com/HackerNews/API) 的 `topstories` 与 `item` 元数据。链接统一指向 Hacker News 讨论页，本站不抓取外部正文。
- Stack Overflow 热门问题：[Stack Exchange 官方 Questions API](https://api.stackexchange.com/docs/questions) 的 `sort=hot` 结果。同步尊重 API 返回的 `backoff` 与配额信号。
- GitHub 本周新星项目：[GitHub 官方 Search API](https://docs.github.com/en/rest/search/search) 中近 7 日新建仓库按 Star 排序的透明计算榜。GitHub 没有对应的官方 Trending API，因此页面不使用“GitHub Trending”名称。同步尊重 `Retry-After` 与 `X-RateLimit-Reset`。

三个数据源都是固定 HTTPS 域名、8 秒超时、2 MB 流式上限、不自动跟随重定向。标题以纯文本存储和渲染。无效条目会被过滤，原始名次保留，所以名次可能留空。

## 状态与失败边界

每个榜单拥有独立的日快照、租约和失败状态。一个上游失败不会清空其他榜单；已有真实快照会以 `stale` 显示原日期，从未成功的榜单显示 `unavailable`。站点不使用刷新时间冒充条目发布时间，也不跨平台比较热度数字。

微博、知乎、百度、哔哩哔哩、抖音和豆瓣在没有经核验的稳定开放接口时保持 `external_only`。本站不使用登录 Cookie、验证码绕过、第三方镜像或伪造榜单。

## API

`GET /api/v1/news/trending/today` 返回顶层快照时间以及逐榜状态。每个 board 独立返回 `fresh | stale | unavailable | external_only`、真实 `snapshotDate` 和最多 10 个标题元数据条目。
