# Phase 1：运行正确性、隔离、超时与取消
<!-- 文件名：phase-1-runtime-correctness - 运行正确性与隔离 -->
<!-- 所属目录：remediation - 工程整改实施 -->

阶段状态：已完成  
最后更新：2026-07-15 16:58（Asia/Shanghai）  
对应问题：P1-1、P1-2、P1-3、P1-4、P1-5

## 1. 阶段目标

在改变整体架构前，先保证当前核心运行链路在部分失败、并发、断开、账号切换和异常输入下行为正确。

### 1.1 给非技术读者的摘要

这一阶段解决的不是“页面好不好看”，而是“系统会不会把错误说成成功、两次任务会不会混在一起、用户关闭页面后模型是否还在花钱、不同账号的数据会不会串、超大文件会不会拖垮服务”。

目前五项均已完成：

1. 只要本轮有 Agent 失败，最终结果就会保留警告，后续成功不能把它洗成正常完成；
2. 每次手动运行都有独立 `runId`，同一用户的并发运行会被拒绝或串行执行，消息和费用可以追溯到具体运行。
3. 模型调用有统一时限；用户取消 SSE 后，正在等待的 Provider 请求会中止，后续 Agent 不再启动。
4. 同一浏览器切换 Session 账号时，本地知识按用户隔离；旧账号的消息、Agent 和未完成异步任务不会回写到新账号界面。
5. 文档上传先检查请求体和真实字节大小，再读取内容；文档数、总容量和 Chunk 数均有配额，失败不会留下半写入数据。

### 1.2 本阶段研究问题

| 编号 | 问题 | 当前结论 |
|---|---|---|
| RQ1 | 部分失败会不会被后续成功覆盖？ | 不会，P1-1 已通过单元和 E2E 验证 |
| RQ2 | 同一用户同时提交两次任务会不会交错？ | 不会，P1-2 当前表现为拒绝或 SQLite 串行化 |
| RQ3 | 客户端断开后 Provider 是否停止？ | 会停止；三类 Provider 单测与 SSE 取消 E2E 已通过 |
| RQ4 | 同一浏览器切换账号是否读取旧知识？ | 不会；A→B→A 的 Session 浏览器 E2E 已通过 |
| RQ5 | 超大上传是否会在读取前被拒绝？ | 会；读取前字节检查、配额单测和上传 E2E 已通过 |

## 2. 问题与验收

### P1-1：部分失败终态

当前状态：已完成

实现：

- 新增纯函数 `resolveRunCompletionStatus`，固定终态优先级为“预算耗尽 > Agent 失败或预算警告 > 正常完成”；
- 持久工作区使用独立 `hadAgentFailure` 聚合整轮结果，后续 Agent 成功不再覆盖前序失败；
- 手动运行采用同一规则，`agent_failed` 立即携带 `warning`，最终只发送一次 `run_completed`；
- `running` 只允许作为过程状态，不能作为完成状态发出。

验收场景：

- [x] 全部成功；
- [x] 第一个失败、第二个成功；
- [x] 第一个成功、第二个失败；
- [x] 全部失败；
- [x] 预算耗尽优先于 warning；
- [x] 每轮只有一个 `run_completed` 事件。

验证证据：终态聚合 5 个单元测试通过；核心 E2E 验证两个 Agent 全部失败后仍顺序继续、只有一个 `run_completed`，且最终状态为 `warning`。

### P1-2：服务端锁与 runId

当前状态：已完成（当前 SQLite Web MVP 范围）

#### 普通人解释

修改前，前端按钮虽然会暂时变灰，但用户可以在另一个标签页再次发送请求。两次任务共用同一个手动工作区，回复可能混在一起，也无法回答“这条消息到底属于哪一次运行”。

修改后，每次运行先获得一个唯一编号 `runId`。服务端使用数据库状态作为门锁，而不是相信某个浏览器按钮。只有拿到锁的运行可以继续；完成或异常时，只能由持有同一个 `activeRunId` 的运行释放锁。

#### 设计选择

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 只保留前端 `runLockRef` | 实现最少 | 多标签页和直接 API 调用可绕过 | 拒绝 |
| 只用 Workspace `status=running` | 数据库可见 | 旧请求可能误释放新请求的锁，缺少运行归属 | 不足 |
| `Run` + `Workspace.activeRunId` | 可追踪，释放锁有所有权，便于未来恢复和审计 | 需要迁移和更多持久化逻辑 | 采用 |

#### 数据关系

```text
User
  └─ Workspace（保存 status 和 activeRunId）
       └─ Run（输入、状态、开始/结束时间、费用、错误码）
            ├─ Message.runId
            └─ TokenUsage.runId
```

`activeRunId` 相当于门锁上的持有人姓名。旧请求进入 `finally` 时，只有 ID 仍然匹配才能释放，因此不会把后来运行的锁错误清除。

#### 实施内容

- SQLite 和 PostgreSQL Schema 新增 `Run`；
- Workspace 新增 `activeRunId`；
- Message、TokenUsage 新增可空 `runId`，兼容历史数据；
- 新增第二个 SQLite migration；
- 手动运行在执行 Agent 前取得数据库锁并创建 Run；
- SSE 增加 `run_created`，所有本轮事件携带同一 `runId`；
- Run 完成后先落库，再发送唯一 `run_completed`；
- 清空历史时同时清理 Run，运行期间返回 409；
- 锁超过 30 分钟可被判定为陈旧锁，原 Run 标记为 `RUN_LOCK_EXPIRED`；锁释放仍检查所有权。

验收场景：

- [x] 同一用户并发第二次运行被拒绝或排队；
- [x] 不同用户使用不同的 `manual-run-{userId}` 工作区和用户限定更新，不共享锁；
- [x] 多标签页请求由数据库锁串行化，不交错消息；
- [x] 正常、Agent 失败和捕获到的异常均释放锁；30 分钟陈旧锁可恢复；
- [x] 历史消息、成功用量和 SSE 事件均关联 runId。

#### 并发实验与失败记录

第一次 E2E 预期“一个运行成功取得锁，另一个立即收到 `WORKSPACE_ALREADY_RUNNING`”，实际观察到两个 `run_created`。分析后确认这不是同时执行：SQLite 把第二次写操作排队，等第一次释放锁后再执行，因此系统采用了验收允许的“排队”语义。

第二版实验在 `run_created` 记录 `startedAt`，在 `run_completed` 记录 `finishedAt`。测试接受两种合法结果：

1. 一个运行取得锁，另一个明确被拒绝；
2. 两个运行都完成，但第一个 `finishedAt` 不晚于第二个 `startedAt`。

复测通过，证明同一用户的两个运行区间不重叠。这个结论属于隔离数据库 E2E 证据，不等同于已经完成高并发生产压测。

### P1-3：超时和取消

当前状态：已完成（当前 Web 运行链路范围）

#### 普通人解释

修改前，模型一直不回答时，服务器可能一直等；用户关闭页面后，请求也可能继续运行并产生费用。更严重的是，系统会把“超时”当成普通 Agent 失败，然后继续调用后面的 Agent。

修改后，每次 Provider 调用都有计时器，默认上限为 120 秒；页面取消 SSE 或 HTTP 请求断开时，取消信号会沿着“路由 → 多 Agent 循环 → LangGraph 依赖 → Provider SDK/fetch”传递。超时或取消都停止整轮运行，不再启动后续 Agent。

#### 方案比较

| 方案 | 问题 | 结论 |
|---|---|---|
| 只在前端停止 loading | 服务端和 Provider 仍继续工作 | 拒绝 |
| 使用 `Promise.race` 只停止等待 | 底层 HTTP 请求仍可能继续 | 拒绝 |
| 将 AbortSignal 传到实际 SDK/fetch | 能真正取消网络请求并统一错误语义 | 采用 |

#### 信号传播链

```text
浏览器取消 / request.signal abort / ReadableStream.cancel
  → Run AbortController
  → runManualAgents / persistent workspace / demo
  → callLLMWithApiKey / callLLM
  → 每次 Provider 调用的超时控制器
  → Ollama fetch / OpenAI SDK / Anthropic SDK
```

父级取消统一转换为 `RUN_CANCELLED`；计时器触发统一转换为 `PROVIDER_TIMEOUT`。两类错误都使用脱敏的用户提示，不暴露 Provider 原始响应或内部地址。

#### 参数与边界

- `PROVIDER_TIMEOUT_MS` 默认 120000 毫秒；
- 非法、非正数配置回退到默认值；
- 为避免误配置造成无限等待，最大限制为 10 分钟；
- 测试环境使用 300 毫秒，避免自动化测试长时间等待；
- 普通 Provider 错误仍允许后续 Agent 继续；只有取消和超时停止整轮。

验收场景：

- [x] Ollama 超时；
- [x] OpenAI-compatible 超时；
- [x] Anthropic 超时；
- [x] SSE 客户端断开；
- [x] 取消或超时后不继续后续 Agent；
- [x] 取消状态不会伪装成成功，Run 保存稳定错误码。

#### 实验与证据

单元测试启动本地延迟 HTTP 服务，让三种 Provider 在30毫秒时限内无法完成。Ollama、OpenAI-compatible 和 Anthropic 均返回 `PROVIDER_TIMEOUT`；父级 AbortController 主动取消时返回 `RUN_CANCELLED`。

E2E 使用延迟 Ollama 服务验证两条真实链路：

1. 第一个 Agent 超时后，事件中只有第一个 Agent 的 `agent_started`，第二个 Agent 从未启动，`run_completed.errorCode` 为 `PROVIDER_TIMEOUT`；
2. 客户端读取到 `agent_started` 后取消 SSE，延迟 Provider 观察到连接关闭；随后再次运行不会收到锁占用错误，说明 Provider 请求中止且运行锁得到释放。

#### 失败尝试

第一次把 Router 加入普通 Node 单元测试时失败，原因不是超时逻辑，而是 Router 同时静态导入凭证解密模块，该模块依赖 Next.js 的 `server-only` 边界。处理方式是把 `decryptStoredApiKey` 移到独立的安全模块，使 Provider Router 只负责模型调用。这样既恢复了测试，也减少了 Router 的职责混杂。

### P1-4：浏览器用户隔离

当前状态：已完成（浏览器过渡知识范围）

#### 普通人解释

Zustand 状态和 `localStorage` 都保存在浏览器里。即使服务端数据库已经按账号隔离，如果浏览器继续用同一个固定键保存知识，A 退出、B 登录后仍可能看到 A 留下的内容。更隐蔽的问题是：A 发起的历史加载或模型流还没有结束，退出后异步结果可能继续写进全局状态，让 B 短暂看到旧 Agent 或旧消息。

现在本地知识键包含明确的 `userId`；服务端历史失败时不再读取浏览器消息副本；登出或组件卸载会清空两个 Zustand Store，并取消历史请求和正在进行的运行请求。异步 Agent 加载还增加了代次校验，旧请求即使稍后返回也不能覆盖新会话。

#### 迁移决策

旧 v1 知识和消息键没有用户归属。系统无法证明它们属于接下来登录的哪一个账号，因此没有把旧数据自动迁移给“第一个登录者”，而是在工作区启动时删除。这会牺牲一次旧版浏览器片段保留，但避免把可能属于 A 的数据错误交给 B。消息历史仍从数据库恢复。

#### 实施内容

- 新增 `src/lib/client/user-storage.ts`，统一生成用户知识键，并在读取时过滤无效记录、限制为最近50条；
- 删除固定消息键的读取降级，数据库 API 成为消息历史唯一可信来源；
- `WorkspaceApp` 显式接收当前 `userId`，本地知识按用户命名空间读写；
- 登出和账号切换时清空 Workspace/Agent Zustand 状态；
- 页面卸载时中止历史请求和当前 SSE/HTTP 请求，防止旧账号结果回写；
- Agent 异步加载使用 generation 防护，过期响应被丢弃；
- 修正设置页关于“API Key 存在 localStorage”的过时说明，明确由服务端加密保存。

验收场景：

- [x] 用户 A 的本地知识对用户 B 不可见；
- [x] 登出后 Zustand 中的用户数据被清除；
- [x] 历史 API 失败时不会加载其他账号遗留消息；
- [x] 旧 v1 无归属数据不会自动分配给任意账号；
- [x] local 模式核心 E2E 仍保持单用户体验。

#### 实验与证据

新增4个单元测试，覆盖用户键差异、A/B 互不可读、异常记录丢弃和旧 v1 键删除。新增独立 Session E2E，在真实浏览器与独立 SQLite 数据库中执行“注册 A → 添加 A 知识 → 退出 → 注册 B → 验证看不到 A → 添加 B 知识 → 退出 → 登录 A → 只能看到 A”的完整路径，结果1/1通过。原有 local 模式核心 E2E 7/7和生产构建继续通过。

#### 遗留边界

本项解决的是浏览器过渡知识的用户隔离，不代表正式知识产品链已经完成。Phase 4 仍应把服务端 `Document/Chunk` 建设为统一知识入口，并提供来源、版本、权限、删除和容量治理；届时可移除浏览器知识片段这一过渡能力。

### P1-5：上传边界

当前状态：已完成（当前 Node.js Web 上传入口范围）

#### 普通人解释

旧代码先执行 `file.text()`，等文件已经完整读进内存后，才用 JavaScript 字符数量判断“是否超过5MB”。这有两个问题：第一，限制来得太晚；第二，一个中文字符通常占多个 UTF-8 字节，字符数不等于真实存储和传输大小。

现在采用两道门。第一道门在解析 multipart 之前检查 `Content-Length`，请求超过6 MiB直接返回413；第二道门在拿到 File 后、调用 `arrayBuffer()` 前检查 `file.size`，单文件超过5 MiB直接返回413。内容使用严格 UTF-8 解码，无效编码返回422。系统还在事务内检查用户配额并一次性创建 Document 与全部 Chunk，任一步失败都会回滚。

#### 限制参数

| 边界 | 当前值 | 错误码 |
|---|---:|---|
| 上传请求体 | 6 MiB | `REQUEST_TOO_LARGE` |
| 单文件 | 5 MiB | `FILE_TOO_LARGE` |
| 文件名 | 255字符 | `INVALID_FILE_NAME` |
| 单用户文档 | 100份 | `DOCUMENT_LIMIT_REACHED` |
| 单用户文档总容量 | 50 MiB | `STORAGE_QUOTA_EXCEEDED` |
| 单文档 Chunk | 2,000个 | `TOO_MANY_CHUNKS` |
| 单用户总 Chunk | 20,000个 | `CHUNK_QUOTA_EXCEEDED` |

#### 实施内容

- 新增纯策略模块 `src/lib/rag/upload-policy.ts`，集中维护边界、稳定错误码和响应映射；
- `Content-Length` 检查发生在 `request.formData()` 前；
- `file.size` 检查发生在 `file.arrayBuffer()` 前，并按真实字节计量；
- 使用 `TextDecoder(..., { fatal: true })` 拒绝无效 UTF-8，不再静默替换坏字节；
- `parseFile` 的 `size` 改为字节数，中文文档数据库容量统计不再被低估；
- 文档数量、容量和 Chunk 配额在数据库事务内检查；
- Document 与嵌套 Chunk 在同一事务中创建，失败不保留半成品；
- 未知内部错误仍统一返回脱敏的 `DOCUMENT_UPLOAD_FAILED`，不会泄露数据库细节。

验收场景：

- [x] 超限文件在内容读取前拒绝；
- [x] 错误返回稳定4xx和机器可读错误码；
- [x] 中文等多字节内容按 UTF-8 字节限制并保存；
- [x] 无效 UTF-8 不会留下半写入文档；
- [x] 超量 Chunk 不会留下 Document；
- [x] 单用户文档数量、总容量和总 Chunk 均有策略测试。

#### 实验与证据

新增4项策略单元测试，覆盖请求体预检、文件读取前检查、中文/坏 UTF-8，以及四类用户与 Chunk 配额。核心 E2E 新增3项：中文 Markdown 成功上传且 `size === Buffer.byteLength`；5 MiB+1 字节文件返回 `FILE_TOO_LARGE` 且文档数不变；无效 UTF-8 与2001个 Chunk 分别返回422，前后文档数量完全一致。当前总结果为单元测试23/23、核心 E2E 10/10、Session E2E 1/1、定向 Lint 通过、生产构建通过。

#### 诚实边界

如果客户端省略或伪造 `Content-Length`，应用只能在 `request.formData()` 完成后通过 `file.size` 拦截；也就是说，它能保证“读取文本内容前拒绝”，但不能单靠应用代码保证“任意 multipart 字节进入进程前拒绝”。生产部署仍需在 Nginx、云网关或平台层设置请求体硬上限。配额事务已覆盖当前单实例 SQLite MVP，多实例 PostgreSQL 下还应增加可重试的串行化事务或独立配额计数器。

## 3. 预计修改区域

- `src/lib/engine/orchestrator.ts`
- `src/app/api/workspaces/manual/run/route.ts`
- `src/lib/llm/router.ts`
- `src/components/auth/authenticated-workspace.tsx`
- `src/components/workspace/workspace-app.tsx`
- `src/app/api/documents/route.ts`
- Prisma Run/Message 相关模型与迁移
- 单元测试和核心 E2E

## 4. 执行记录

| 时间 | 问题 ID | 修改目标 | 修改文件 | 验证 | 状态 |
|---|---|---|---|---|---|
| 2026-07-15 | P1-1～P1-5 | 建立修改范围和验收矩阵 | 本文件 | 文档检查 | 已完成 |
| 2026-07-15 04:28 | P1-1 | 统一持久工作区和手动运行的终态聚合 | `run-status.ts`、orchestrator、manual route、unit/E2E | unit 11/11、定向 lint、E2E 4/4、build 通过 | 已完成 |
| 2026-07-15 04:41 | P1-2 | 新增 Run、activeRunId、运行归属和服务端锁 | Prisma schema/migration、manual run/messages、types/mappers、E2E | schema/diff、unit 11/11、E2E 5/5、build 通过 | 已完成 |
| 2026-07-15 04:52 | P1-3 | 统一 Provider 超时、请求取消和停止后续 Agent | Router、security、manual/persistent/demo routes、unit/E2E | unit 15/15、E2E 7/7、定向 lint、build 通过 | 已完成 |
| 2026-07-15 16:39 | P1-4 | 用户命名空间、登出清理、异步回写防护和旧消息降级移除 | client storage、WorkspaceApp、Zustand stores、Session E2E | unit 19/19、Session E2E 1/1、核心 E2E 7/7、build 通过 | 已完成 |
| 2026-07-15 16:58 | P1-5 | 请求/文件读取前边界、字节计量、用户配额和原子回滚 | documents route、upload policy、parser、unit/E2E | unit 23/23、核心 E2E 10/10、定向 lint、build 通过 | 已完成 |

每次代码修改后在此追加一行，并在下方建立对应问题的详细小节，记录修改前后行为、设计取舍、测试输出和遗留风险。

## 5. 阶段回归命令

```bash
npm run test:unit
npm run test:e2e:core
npm run test:e2e:session
npm run lint
npm run build
```

## 6. 阶段完成条件

- 五个问题均有自动化测试；
- 并发、部分失败、取消和账号切换行为稳定；
- 不依赖前端锁保证服务端正确性；
- 全量构建和核心 E2E 通过。

## 7. 当前验证摘要

| 命令 | 结果 |
|---|---|
| `npm run test:unit` | 23/23 通过，其中浏览器隔离4项、上传策略4项 |
| P1-4 涉及文件定向 ESLint | 0错误、7个既有未使用代码警告 |
| `npm run test:e2e:core` | 隔离 SQLite 数据库10/10通过，新增字节计量、超限和回滚 |
| `npm run test:e2e:session` | Session 模式 A→B→A 账号切换1/1通过 |
| `npm run build` | 通过，保留 1 条既有 NFT tracing warning |
| `npm run lint` | 未通过：6个错误、10个警告；本轮顺带消除2个 Workspace Hook 错误 |

## 8. P1-2 修改前后对比

| 维度 | 修改前 | 修改后 |
|---|---|---|
| 并发控制 | 仅当前页面的前端引用 | 服务端数据库锁 |
| 运行身份 | 无 | 每轮唯一 runId |
| 锁所有权 | 无 | activeRunId 条件释放 |
| 消息追踪 | 只能看到 workspace | 可追溯到 Run |
| 用量追踪 | 只能看到 workspace/message | 可追溯到 Run/message |
| SSE | 无运行创建事件 | run_created 和全链路 runId |
| 异常恢复 | finally 语义不完整 | 捕获异常释放 + 陈旧锁恢复 |
| 并发证据 | 无 | 隔离 SQLite E2E，拒绝或非重叠串行 |

## 9. 当前局限

- 并发实验使用单进程 Next.js 和 SQLite，尚未覆盖多实例部署；
- 30 分钟陈旧锁是当前保护值，完成 P1-3 的统一超时后应由运行超时策略统一管理；
- 当前 Run 先服务于手动工作区，持久工作区将在 Phase 2 统一迁移；
- `run_created` 等事件尚未形成版本化 TypeScript 契约，留在 Phase 2；
- 尚未进行大量并发性能压测，因此不能宣称生产级吞吐能力。
- 取消测试覆盖当前单进程 Web MVP；反向代理、Serverless 平台和多实例部署是否及时传播断开信号仍需部署环境验证；
- 当前超时是每次 Provider 调用的上限，未来 Planner 工作流还需要整轮 Run、节点和工具各层预算；
- 取消后的部分输出目前不会保存，后续需要在 Artifact 设计中明确是否保留可验证的部分结果。
- 无 Content-Length 时，multipart 级内存保护依赖反向代理或云网关；应用仍会在读取文件内容前按 file.size 拒绝。
