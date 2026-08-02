# Phase 4：本地知识、RAG 与受控 Tools
<!-- 文件名：phase-4-knowledge-and-tools - 知识库与受控工具 -->
<!-- 所属目录：remediation - 工程整改实施（当前整改阶段） -->

阶段状态：已完成  
实施日期：2026-07-15  
完成时间：2026-07-15 19:35（Asia/Shanghai）  
对应问题：P1-6、P1-7、P1-8、TOOL-1

## 1. 本阶段解决了什么

用白话说，Phase 3已经能制定计划，但计划里写“查知识”并不等于系统真的会安全地查。旧实现有四个核心问题：Markdown标题在切块前被删除；TF-IDF把词频去重且会让常见有效词权重变成0；浏览器片段和数据库文档是两套知识源；Tool列表包含假的 Web Search、假的 Knowledge Search和不安全的文本协议。

Phase 4把这条链路改成：用户上传带来源信息的文档，系统按真实标题和行号切块；Planner只授权已注册工具；结构化 Tool调用经过输入、权限、次数、大小和超时校验；真实知识工具只查询当前用户的 Document/Chunk，返回文档、章节、行号、版本、许可和校验和；每次调用以 `toolCallId`持久化审计。

## 2. Markdown结构切块

### 2.1 原问题

旧 `parseFile`先执行 `stripMarkdownSyntax`，其中删除了 `#{1,6}`。之后 `chunkMarkdown`再按标题正则拆分时，标题已经不存在，所以普通 Markdown也会退化为按长度切块。报告看似有知识，实际引用无法指出来自哪个章节。

### 2.2 当前行为

- 解析阶段只统一换行和多余空行，保留 Markdown原文；
- 切块阶段逐行识别 H1～H6；
- 维护标题栈，生成 `heading`、`headingLevel`和 `headingPath`；
- `startLine/endLine`使用原文零基行号，API展示时转换为人类可读行号；
- 长章节继续分块，但每个子块继承章节路径；
- Chunk元数据保存文档标题、文件名、格式、来源、版本、许可和审查时间。

例如 `# 产品说明 → ## 权限模型 → ### 审计`会形成可追溯路径 `产品说明 > 权限模型 > 审计`。

## 3. 检索算法修复

### 3.1 旧算法为何会零召回

旧公式是 `log((N+1)/(df+1))`。当查询词出现在所有块中时，`df=N`，IDF正好是0；即使每个块都包含这个词，所有得分仍为0并被过滤。同时 `tokenize`用 Set去重，导致一个词出现1次和10次得到相同“词频”。

### 3.2 当前算法

- 文档 token保留重复次数，查询 token只做一次去重；
- 中文继续使用双字切分，英文保留单词；
- IDF改为带正值平滑的 BM25式公式；
- TF使用 `1 + log(count)`，保留频率又抑制堆词；
- 文档标题、文件名和标题路径也进入可搜索文本；
- 同分时按 documentId、startLine、chunkId稳定排序；
- 格式化结果包含 Document、Section、Lines和 Score。

### 3.3 固定评测

新增三类受控 fixture：管理后台角色权限、官网表单错误、学习工具计时状态。在 `k=1`的当前基线中：

| 指标 | 结果 |
|---|---:|
| Recall@1 | 1.00 |
| MRR | 1.00 |
| 无关结果率 | 0.00 |
| 引用字段完整率 | 1.00 |

这只是防回归的小型基线，不能外推为真实语料已经达到生产质量。当前没有证据需要立即增加 embedding/pgvector，因此本阶段不引入额外向量基础设施；后续应扩大查询集、加入难负例和人工引用正确率。

## 4. 版本化知识和引用

Document新增：

- `checksumSha256`：证明内容版本；
- `sourceType`：local-upload、curated-reference或 project-decision；
- `sourceUrl`：只允许无账号密码的 HTTP(S)地址；
- `sourceVersion`；
- `license`；
- `reviewedAt`。

上传仍保留 Phase 1的5 MiB单文件、用户容量、Chunk数量、严格 UTF-8和事务回滚边界。第四次 migration同时新增知识来源字段与 ToolInvocation审计表。

结构化检索结果的 citation包含：documentId、title、fileName、sourceType、sourceUrl、sourceVersion、license、reviewedAt、checksumSha256、headingPath、startLine和 endLine。报告阶段可以据此生成“结论 → 知识块 → 原始文档版本”的追踪链。

## 5. 唯一产品知识源

服务端 Document/Chunk现在是运行时唯一产品知识源：

- 手动 Agent运行不再接收浏览器知识片段作为模型上下文；
- 持久工作区继续按 userId检索数据库文档；
- Knowledge Tool直接调用同一 `searchDocumentChunks`；
- 前端“能力库”改为上传、列出和删除服务端文档，并可启用聊天 RAG；
- 旧 localStorage无归属键仍会清除，但不再作为产品知识回退。

这样避免了“页面显示一份知识、模型实际使用另一份知识”的双真相问题。

## 6. 受控 Tool架构

### 6.1 ToolDefinition

每个 Tool必须声明：

- ID、名称、说明；
- Zod输入和输出 Schema；
- 权限和只读风险级别；
- 单次超时；
- 每 Run最大调用次数；
- 最大输入和输出字节；
- 接收 userId、runId、toolCallId和 AbortSignal的执行函数。

Registry初始化幂等，安全元数据可通过 GET `/api/tools`查看。API不再列出假的 Web Search、Calculator或占位 Knowledge Search。

### 6.2 当前真实工具

| Tool | 作用 | 边界 |
|---|---|---|
| `knowledge-search` | 检索当前用户版本化文档并返回 citation | 5秒、每Run 5次、输入8 KiB、输出64 KiB |
| `ui-acceptance-check` | 确定性检查可见标签、键盘焦点和 loading/empty/error状态 | 1秒、每Run 3次、无外部访问 |

基线 Planner当前只为任务授权 `knowledge-search`。`ui-acceptance-check`虽然在平台白名单内，但不在该次计划中时仍以 `TOOL_NOT_AUTHORIZED`拒绝。这证明“平台注册”与“本次运行授权”是两层不同边界。

### 6.3 调用顺序

```text
POST /api/tools/execute
  → Auth + userId
  → toolCallId / runId / toolId结构校验
  → Run必须属于当前用户
  → ExecutionPlan必须有效且包含该 toolId
  → 输入大小和 Zod Schema
  → 每Run调用次数
  → 创建 ToolInvocation(running)
  → AbortSignal + timeout执行
  → 输出 Zod和大小校验
  → ToolInvocation(completed/failed)
```

同一 `toolCallId`完成后再次提交相同 Run和 Tool，会返回已保存结果并标记 `replayed: true`，不会重复执行。若该 ID属于另一用户、Run或 Tool，则返回冲突。

## 7. 稳定错误与审计

当前错误包括：

- `TOOL_NOT_FOUND`；
- `TOOL_NOT_AUTHORIZED`；
- `TOOL_INPUT_INVALID`；
- `TOOL_INPUT_TOO_LARGE`；
- `TOOL_CALL_LIMIT_EXCEEDED`；
- `TOOL_TIMEOUT`；
- `RUN_CANCELLED`；
- `TOOL_OUTPUT_INVALID`；
- `TOOL_OUTPUT_TOO_LARGE`；
- `TOOL_CALL_ID_CONFLICT`。

ToolInvocation只在 GET审计接口返回调用ID、Tool、状态、错误码、时间和耗时，不把输入、完整输出或内部异常直接暴露给浏览器。

## 8. 前端能力状态

能力定义新增 `implementationStatus`。RAG Retrieval与受控 Tool Execution显示“可用”；Long-term Memory、Semantic Cache、File Reader和 Code Review显示“规划中”，不能勾选，也不会进入 Agent运行上下文。这避免把占位能力写成已实现产品功能。

## 9. 自动化证据

| 验证 | 结果 | 证明内容 |
|---|---:|---|
| 单元测试 | 43/43 | 新增 RAG 6项、来源元数据1项、Tool 4项 |
| 核心 E2E | 16/16 | 上传来源 → Planner授权 → Tool引用 → 幂等 → 未授权审计 |
| Session E2E | 1/1 | A/B文档、计划、Run和 Tool调用完全隔离 |
| TypeScript | 通过 | Prisma、Zod Tool、前端和 API契约一致 |
| 定向 ESLint | 通过 | Phase 4核心文件无新增问题 |
| SQLite migration | 4/4 | 空库可建立来源字段和 ToolInvocation |

## 10. 验收清单

- [x] Markdown标题层级在切块和引用中保留；
- [x] TF-IDF零召回、虚假词频和不稳定排序已修复；
- [x] 固定查询集输出 Recall、MRR、无关结果率和引用完整率；
- [x] 用户和 Run之间知识、计划和 Tool调用隔离；
- [x] citation可回到真实文档、章节、行号、版本和许可；
- [x] 未授权和非法参数在工具函数执行前拒绝；
- [x] 工具次数、超时、取消、输入和输出大小都有边界；
- [x] `toolCallId`支持幂等和审计；
- [x] 前端只管理服务端知识源，占位能力明确显示规划中；
- [x] 当前评测不足以支持引入 pgvector，因此没有无证据增加复杂度。

## 11. 阶段结论与下一步

Phase 4已完成。AgentForge已经能证明：Planner任务中的知识工具不是一行描述，而是受用户、Run、计划、Schema、预算式次数、超时和审计共同约束的真实只读能力。

下一阶段是 Phase 5：让不同目标导向的 Agent独立生成候选方案，Reviewer提交带证据的结构化 Finding，Evaluator执行有限轮次的采纳、退回或人工确认，并用固定样例比较单 Agent、双 Agent、RAG和交叉评审的质量、成本与延迟。
