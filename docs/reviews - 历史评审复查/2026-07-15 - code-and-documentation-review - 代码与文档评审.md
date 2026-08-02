# AgentForge 代码与文档评审
<!-- 文件名：2026-07-15-code-and-documentation-review - 代码与文档评审 -->
<!-- 所属目录：reviews - 历史评审复查 -->

评审时间：2026-07-15 03:20（Asia/Shanghai）  
评审范围：当前工作区中的 `src/`、`e2e/`、`electron/`、`prisma/`、项目配置和 `docs/`。  
评审方式：静态代码审阅、文档一致性检查、单元测试、生产构建、Lint、Prisma schema 校验和小范围可复现实验。  
说明：评审针对包含未提交改动的当前工作区，不等同于 Git HEAD 或正式发布版本。

## 1. 总体结论

AgentForge 已经具备工程型 Web MVP 的基础，不是单纯的界面演示。当前较成熟的部分包括：

- 服务端根据当前用户查询 Agent、Workspace、Document 和凭证；
- API Key 使用 AES-256-GCM 保存，DTO 和 SSE 不返回明文或密文载荷；
- 手动双 Agent 链路支持顺序执行、前序输出传递、单 Agent 失败继续；
- 成功消息和 TokenUsage 在同一事务中保存；
- Provider 原始错误会转换为稳定、脱敏的业务错误；
- LangGraph 单 Agent 图通过依赖注入隔离检索器和模型调用，已有基础单元测试。

目前主要问题不是基础能力缺失，而是项目处于迁移阶段：Demo、持久工作区、手动运行形成了三套不同的执行语义；RAG、Tool API、文档上传和 Electron 中存在“代码已经出现，但主链路尚未闭环”的情况；前端主组件也已经超过适合继续堆功能的规模。

## 2. 验证结果

| 检查 | 结果 | 备注 |
|---|---|---|
| `npm run test:unit` | 通过 | LangGraph 单 Agent 测试 6/6 通过 |
| `npm run build` | 通过 | 有 1 条 Turbopack NFT tracing warning |
| `npm run lint` | 未通过 | 8 个错误、12 个警告 |
| SQLite Prisma schema | 通过 | `prisma validate` 通过 |
| PostgreSQL Prisma schema | 通过 | `prisma validate` 通过 |
| 文档相对链接 | 通过 | 未发现失效的相对 Markdown 链接 |
| 隔离数据库 E2E | 未完成 | 创建隔离 SQLite 数据库时 Prisma 返回无详细信息的 `Schema engine error`，未使用真实本地数据库继续测试 |

补充可复现实验：

- 两个 chunk 都包含查询词 `RAG` 时，当前检索实现返回空结果；
- 包含两个 Markdown 标题的文档经过现有上传解析后只生成一个结构块；
- 未显式初始化时，Tool Registry 中注册工具数量为 0。

## 3. 问题清单

### P0：发布前必须解决

#### P0-1 `.env` 仍在 Git 跟踪范围内

当前工作区显示 `.env` 是已跟踪且有修改的文件，文档也记录它曾经进入 Git 历史。即使现在删除文件，历史中的真实密钥仍然有效，直到在对应 Provider 后台轮换。

处理要求：

1. 盘点历史中出现过的 Provider Key、Session Secret 和 Encryption Master Key；
2. 在服务商后台轮换或撤销；
3. 停止跟踪 `.env`，只保留 `.env.example`；
4. 用密钥扫描检查当前提交和必要的历史范围；
5. 在发布清单中记录轮换完成日期，但不要记录真实密钥。

验收：`git ls-files .env` 无输出，公开仓库中不能搜索到有效密钥，相关旧密钥已失效。

#### P0-2 数据库初始化链路需要恢复

当前工作区删除了 `prisma/migrations/init.sql`，同时隔离数据库执行 `prisma db push` 出现 Schema Engine 错误。如果直接提交当前状态，新环境可能无法可靠建立数据库。

处理要求：确定该删除是否有意；如果要删除旧迁移，必须提供新的初始迁移或经过验证的初始化命令，并在全新目录中完成一次从零安装测试。

验收：不依赖现有 `prisma/dev.db`，新环境可执行 README 中的命令建立数据库并通过核心 E2E。

### P1：核心正确性与隔离

#### P1-1 持久工作区可能掩盖前序 Agent 失败

`runPersistentWorkspace` 在 Agent 失败时设置 `warning`，但后续成功会把 `finalStatus` 重新赋值为预算状态。循环结束后还会再次基于预算状态计算终态，因此“第一个失败、第二个成功”可能最终显示正常完成。

建议：增加独立的 `hadAgentFailure` 或 Run 结果聚合器，按 `exhausted > warning > idle/success` 的明确优先级生成终态，并增加混合成功/失败测试。

#### P1-2 手动工作区缺少服务端并发锁和 Run 标识

前端 `runLockRef` 只能阻止当前页面连续点击。多标签页、刷新重试或直接调用 API 时，同一用户可以并发运行固定的 `manual-run-{userId}` 工作区，消息和 SSE 事件可能交错，也无法判断消息属于哪一次运行。

建议：引入 `Run`/`runId`，在服务端通过条件更新取得锁；所有事件、消息和用量关联 `runId`；在 `finally` 中释放锁，并处理客户端断开和进程异常后的恢复。

#### P1-3 Provider 没有统一超时和取消

Ollama `fetch`、OpenAI SDK 和 Anthropic SDK 没有统一 AbortSignal。SSE 客户端断开后，服务端可能继续调用模型并产生费用；长时间无响应也会占用运行锁和连接。

建议：由 RunService 创建 AbortController，将请求超时和 `request.signal` 传到 Provider Adapter；明确取消后是否保存部分结果以及最终事件。

#### P1-4 浏览器本地知识没有用户作用域

知识片段和旧消息降级使用固定 localStorage key。在 Session 模式下，同一浏览器切换账号可能读取前一个用户的本地知识，并在后续请求中发送给模型。

建议：优先将知识迁移到服务端用户空间；过渡期至少按 `userId` 命名空间保存，并在登出时清理当前用户的瞬时状态。不要在服务器历史加载失败时自动回退到另一个账号可能遗留的本地消息。

#### P1-5 上传限制在完整读取文件后才执行

上传路由先调用 `file.text()`，再由 parser 按 JavaScript 字符数量检查 5MB。大文件已经进入内存，而且字符数量不等于字节大小。

建议：读取前检查 `file.size`，限制请求体、单用户文档数量和总容量；对解析、切块和数据库写入设置独立上限。

### P1：统一运行架构

当前存在三条不同路径：

```text
Demo：runDemoWorkspace
持久工作区：runPersistentWorkspace
核心手动链路：runManualAgents → runSingleAgentGraph
```

三者在 LangGraph、RAG、失败隔离、预算、持久化和最终状态方面不一致。这是当前文档对“是否已使用 LangGraph”出现冲突的根本原因：手动链路已经使用单 Agent LangGraph，持久工作区仍使用旧顺序编排。

建议抽取统一 `RunService`：

```text
Route
  → Auth / Run lock / RunContext
  → RunService
  → Workflow adapter（顺序或 LangGraph）
  → Provider / Retriever / Tool adapters
  → Persistence + SSE
```

RunService 统一负责：Agent 顺序、上下文、预算、失败聚合、runId、取消、事件、消息和用量；LangGraph 只负责节点和条件路由，不直接承担认证、密钥或产品数据库事务。

### P1：RAG 正确性

#### P1-6 Markdown 结构在切块前被删除

`parseFile` 会先清除 Markdown 标题符号，上传路由随后才调用 `chunkMarkdown`，因此章节边界无法识别。

建议：保留原始 Markdown 做结构切块，再为每个 chunk 生成清洗后的检索文本；同时保存标题路径、文档 ID 和准确行号。

#### P1-7 当前算法不是完整 TF-IDF，并存在零召回场景

IDF 使用 `log((N+1)/(df+1))`，查询词出现在所有 chunk 时权重为 0，结果全部被过滤。tokenizer 又对 token 去重，导致 TF 不再表示词频。

建议：至少增加平滑常数，例如 `log((N+1)/(df+1)) + 1`；分别保留查询 token 集合和文档 token 频次；加入中文、英文、通用词和同分排序测试。升级向量检索前先建立固定召回评测集。

#### P1-8 数据库 RAG 前端链路未闭环

前端已经存在 `documents`、`useRag`、上传和删除函数，但当前组件中这些状态和函数没有真正展示或切换；`useRag` 默认关闭且 setter 未使用。现有 UI 主要依赖 localStorage 知识片段。

建议：明确只保留一种 v0.1 知识入口。若选择服务端文档库，就完成上传、列表、删除、RAG 开关、来源展示和用户隔离；若暂不交付，就删除或隐藏未完成入口，避免形成两套知识模型。

### P1：Tool API 未闭环

`ensureToolsInitialized()` 已定义，但当前仓库没有调用点。工具列表和执行路由直接读取 Registry，初始状态下返回空列表或 Tool not found。现有内置 Web Search 和 Knowledge Search 也仍是占位实现。

建议先完成最小闭环：

1. 在每个 Tool API 入口幂等初始化；
2. 为每个工具使用 Zod Schema；
3. 校验 Agent capability 和工具白名单；
4. 增加超时、调用次数、输出长度和审计信息；
5. 只接入一个真正可验证的工具，再扩展 Tool Calling 循环。

### P2：维护性与产品完整度

#### P2-1 前端主组件过大

`workspace-app.tsx` 约 1578 行，同时管理聊天、Agent 编辑、知识库、Dashboard、设置、偏好和 SSE。全量 Lint 的主要业务问题也集中在这里，并存在乱码注释、未使用状态和未完成函数。

建议按页面拆分，并抽取：

- `useManualRunStream`：请求、SSE 解码、run lock 和取消；
- `usePersistedMessages`：历史加载、合并和清空；
- `useKnowledgeLibrary`：服务端文档与知识状态；
- 页面组件：Chat、Agent、Knowledge、Dashboard、Settings。

验收：核心页面文件保持单一职责，全量 lint 通过，不再保留未使用的旧 localStorage 消息代码。

#### P2-2 Workspace 创建 API 静默忽略 `agentIds`

`workspaceCreateSchema` 接受 `agentIds`，但 POST `/api/workspaces` 只创建 Workspace，没有建立成员关系。应当实现同事务关联并校验 Agent 所有权，或者从创建 Schema 中移除该字段。

#### P2-3 Electron 还不能作为可交付安装包

当前 Electron 通过系统 `npm start` 启动 Next.js，固定使用 3000 端口，并以 `app.getAppPath()` 作为工作目录。打包机器以外的用户可能没有 npm；应用目录或 ASAR 也不适合作为 SQLite 可写目录；端口冲突时还可能加载其他服务。

建议在 Web MVP 稳定后单独处理：内置可执行服务、随机或受控端口、健康检查标识、`app.getPath("userData")` 数据目录、进程退出和安装包冒烟测试。

#### P2-4 缺少多 Agent 价值评测

现有测试主要证明链路正确，没有证明双 Agent 比单 Agent 输出更好。建议建立 10～20 个固定需求样例，对比单 Agent、双 Agent、双 Agent + RAG，记录需求覆盖、可行性、可测试性、风险识别、人工修改量、延迟和 Token。

## 4. 推荐修改顺序

### 阶段 0：冻结扩展，先处理发布安全

1. 轮换 Git 历史中可能暴露的所有密钥；
2. 停止跟踪 `.env`；
3. 恢复或替换数据库初始迁移；
4. 在全新目录完成安装、建库、构建和核心 E2E。

完成标准：新环境可复现，旧密钥失效，没有依赖本机已有数据库。

### 阶段 1：修复核心正确性和隔离

1. 修复部分失败被覆盖；
2. 增加手动运行服务端锁和 runId；
3. 接入超时、断开取消和稳定终态；
4. 修复 localStorage 用户作用域；
5. 在读取前限制上传大小。

完成标准：并发、部分失败、取消、刷新和账号切换都有自动化测试。

### 阶段 2：统一 RunService

1. 定义 Run 状态机和 SSE 事件契约；
2. 抽取公共上下文、预算、错误和持久化逻辑；
3. 让手动与持久工作区使用同一执行服务；
4. Demo 只作为同一服务的模拟 Provider 配置，不保留独立语义；
5. 更新 `architecture - 当前运行架构.md` 和 `current-status - 当前开发状态.md`，消除 LangGraph 状态冲突。

完成标准：同一 fixture 下，不同入口的事件、消息和最终状态一致。

### 阶段 3：修复并评测 RAG

1. 保留 Markdown 章节结构；
2. 修复 TF-IDF 零召回和词频；
3. 接通唯一的服务端知识入口；
4. 增加来源、行号和检索分数；
5. 建立固定召回测试，再决定是否升级 embedding/pgvector。

完成标准：固定查询集有可记录的召回结果，单条损坏 metadata 不影响整次检索。

### 阶段 4：完成最小 Tool Calling 闭环

1. 修复 Tool 初始化；
2. 选择一个真实工具完成 Schema、权限、超时和审计；
3. 接入受限工具循环；
4. 增加模型输出非法、工具失败和超限测试。

完成标准：工具不是占位回复，Agent 未获授权时不能调用，任意循环可终止。

### 阶段 5：前端拆分与质量收口

1. 拆分 `workspace-app.tsx`；
2. 删除乱码注释、未使用函数和重复状态；
3. 统一错误反馈和 API DTO；
4. 使全量 lint 通过；
5. 增加正式截图和一条真实成功演示。

完成标准：lint、unit、core E2E、build 全部通过，公开文档与当前实现一致。

### 阶段 6：依据证据选择后续能力

1. 用单/双 Agent 评测决定是否增加交叉评审；
2. 只有存在真实分支、暂停和恢复需求时，才全面迁移 LangGraph；
3. 只有 TF-IDF 评测不达标时，才引入向量检索；
4. 确认桌面分发是产品目标后，再完成 Electron 打包。

## 5. 文档结构评估

现有 `docs/` 的内容分类基本合理：当前架构和状态放根目录，未来设计在 `design/`，对外报告在 `reports/`。当前缺少的是总索引、阶段评审归档、决策记录和运维文档，而不是需要立即把所有文件搬进更深层目录。

建议逐步演进为：

```text
docs/
  README - 文档索引.md
  current-status - 当前开发状态.md
  architecture - 当前运行架构.md
  demo - 本地演示指南.md
  project-memory - 项目长期记忆.md
  design/
  reviews/
  reports/
  screenshots/
  decisions/      # 有至少两份 ADR 后创建
  operations/     # 开始处理迁移、备份、打包后创建
  quality/        # 建立评测集和性能基线后创建
  contracts/      # SSE/Run/Tool 契约变复杂后创建
```

短期不建议移动当前三个根文档。先使用新增的 [文档索引](../2026-08-01 - document-index - 文档索引.md) 统一入口，并将本评审作为 `reviews/` 的第一份记录。

## 6. 下次复查入口

完成阶段 0 和阶段 1 后，优先复查：

- `.env` 是否停止跟踪、历史密钥是否已轮换；
- 新环境数据库是否能从零建立；
- 混合成功/失败时唯一终态是否为 warning；
- 并发运行是否被拒绝或正确隔离；
- SSE 断开是否取消 Provider 请求；
- Session 账号切换后是否完全隔离本地知识；
- `npm run lint`、单元测试、核心 E2E 和构建是否全部通过。
