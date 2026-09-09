# 上传依赖安全修复：Multer 2.3.0

本次只处理当前上传链路涉及的已确认安全公告，不等同于全站无漏洞证明。生产是否已生效以最终发布记录为准；未向生产接口发送恶意字段、截断上传或中止上传测试。

## 官方来源与实际适用范围

2026-09-09 直接核对 GitHub 上由 Express/Multer 维护者发布的公告、修复提交及 2.3.0 发布记录，并检查实际安装包和 lock，而非仅采信第三方汇总：

- CVE-2026-77078：2.3.0 以前的字段解析可能因特制名称产生未捕获异常；新版本捕获字段解析异常并拒绝请求。[官方公告](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm)、[上游补丁](https://github.com/expressjs/multer/commit/87a584e)。
- CVE-2026-82333：过大的数字数组下标可使随后处理同步消耗 CPU。**升级本身不足**：新选项 `limits.fieldArrayIndexLimit` 默认仍为 `Infinity`，应用须启用实际需要的上限。[官方公告](https://github.com/advisories/GHSA-535w-7cp7-47q4)、[上游新增限制](https://github.com/expressjs/multer/commit/73c1759)。
- CVE-2026-77037：2.2.0 的 `diskStorage` 中止上传可能泄漏文件描述符；2.3.0 改为销毁写流、等关闭后移除文件。本站这两处拦截器使用默认 **memoryStorage**，不能把“依赖版本在范围内”误报成生产已出现该磁盘泄漏。升级包含其修复，但本轮本地回归测的是本站实际内存上传路径，不冒充磁盘 FD 泄漏复现。[官方公告](https://github.com/advisories/GHSA-qfvm-cv95-jqjf)、[上游磁盘流补丁](https://github.com/expressjs/multer/commit/eef7444)。

维护者的 [2.3.0 发布记录](https://github.com/expressjs/multer/releases/tag/v2.3.0) 明确列出上述修复。本站上传入口本身先执行 JWT/开发协作权限及作者检查；上游通用的攻击者权限说明，不应被误读成本站匿名用户能绕过现有 guard。开发附件原有单文本字段限额也已提供部分缓解，但不代替修补依赖及限制解析结构。

## 最小依赖与配置变更

1. 更新前唯一 Multer 实例为 `packages/backend/node_modules/multer@2.2.0`，来自 `@nestjs/platform-express@11.2.1` 的精确间接依赖。
2. 根 `package.json` 增加 `overrides.multer: "2.3.0"`，不升级 Nest 或添加另一份直接 Multer 依赖。安装禁用生命周期脚本；最初 `npm install --ignore-scripts` 没有重新解析现有嵌套条目，随后 `npm update multer --ignore-scripts` 才真正完成更新，最终以 `npm ls multer --all` 和 Nest 路径解析结果核实。
3. 更新前后对全部 881 个 lock 包条目逐项计算 SHA-256：只移除旧嵌套 2.2.0、增加顶层 2.3.0，其余 880 项内容不变，保留同期 `three`、`@types/three` 等开发改动。锁中 Nest 原声明仍为其发布时的 2.2.0，实际解析由根 override 统一到 2.3.0，无遗留的 2.2.0 安装实例。
4. 开发附件及文档库的表单均只需要平面字段，显式设置 `fieldNestingDepth: 0` 与 `fieldArrayIndexLimit: 0`。前者拒绝所有括号嵌套，后者作为数组索引的显式边界；正常 `expectedVersion`、`ownedContentDeclarationConfirmed` 不受影响。
5. Nest 11.2 的类型尚未列出这两个 Multer 参数。通过公开 `FileInterceptor` 参数类型推导 limits，并用交叉类型扩展，保留静态检查；不使用 `any`、`@ts-ignore`、修改 node_modules 或假装设置已经生效。
6. 不变更附件访问权限、作者归属、5 MiB 上限、字段数量、私有内容下载头、存储方式、文档业务或数据库结构。没有重置或删除用户附件。

## 验证证据与边界

新增 `multipart-security.spec.ts` 的 16 项回归包含：

- 从 Nest 实际依赖路径解析到 2.3.0；真实 Node HTTP 接收畸形 multipart 字段，数组长度溢出变成请求错误，超大数字索引被显式上限拒绝。
- 上述危险输入只在本地绑定 `127.0.0.1` 随机端口的隔离 worker 中执行；单 worker 64 MiB old-space / 16 MiB young-space、3 秒终止保护，避免未来回归把整个测试进程拖死。拒绝后再次 HTTP 请求验证服务仍能响应。
- 使用真正 Nest `DevelopmentController` / `DocumentsController` 与拦截器处理正常声明和精确文件内容、小型非法嵌套字段、缺失 multipart 结束边界，以及已经收到文件字节后的客户端主动断连。错误请求不进入业务保存，后续正常请求仍成功。
- 开发附件恰好 5 MiB 接受、再多 1 字节返回 413。既有 controller 的权限优先级、额外字段与私有下载头测试一并回归。

HTTP 测试使用声明明确的合成身份与 mocked 业务存储，不访问真实用户或数据库；没有把本地测试当成生产负载测试。第一次类型检查发现 Nest 未导出类型及弱类型兼容问题，已改为公开函数参数推导和显式交叉类型，通过后续测试检查；没有放宽字段限制。

最终本地定向结果：开发协作与文档模块 **10 个 suite / 109 个测试全部通过**（包含新增 16 项），backend 类型检查通过，`npm ci --ignore-scripts --dry-run --no-audit --no-fund` 锁文件一致性检查通过，改动 `git diff --check` 通过。实际生产镜像仍需按最终 lock 重新构建，不能沿用修复前的预演依赖或旧 compiled controller。

本地 `npm audit --omit=dev` 的官方 bulk 请求遇到 `socket hang up`，因此不宣称该次全依赖审计“零漏洞”。修复依据是独立核实的官方适用版本、实际依赖路径与回归；最终发布可另通过已验证的只读审计渠道复查。
