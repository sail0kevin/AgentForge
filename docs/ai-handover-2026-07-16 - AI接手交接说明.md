# AgentForge AI 接手交接文档
<!-- 文件名：ai-handover-2026-07-16 - AI接手交接说明 -->

更新时间：2026-07-16（Asia/Shanghai）  
适用对象：第一次接手本仓库、不了解历史上下文的 AI 或开发者。

## 1. 先读这一页，再开始改代码

本项目当前名称为 AgentForge。它的目标不是做一个“很多机器人一起聊天”的通用聊天软件，而是一个面向 Web 项目的多智能体开发报告生成平台：用户给出需求，系统分析需求、组织方案、引用知识资料、交叉评审并形成可追溯的开发报告。

目前产品有两条相关但不同的使用路径：

1. **任务对话空间**：适合用户直接与一组 Agent 围绕一个具体任务对话。默认空间是“开发报告生成”，成员为“需求分析师”和“开发报告负责人”。前者分析需求，后者根据需求和前序结论组织开发报告。
2. **产品级开发工作流**：位于 `/workflows`，适合生成更结构化、可暂停恢复、带候选方案、评审、人工裁决和版本化报告的完整产物。最终报告位于 `/reports`。

不要把“两个 Agent 的对话空间”误说成整个项目的能力上限；它是当前最容易演示的默认入口。完整目标工作流仍是：

`需求分析 → Planner/计划校验 → 知识检索 → 独立候选 → 交叉评审 → Evaluator/人工确认 → 动态开发报告`

## 2. 当前已完成的真实能力

### 2.1 任务对话空间

- 聊天页已使用持久化的 `Workspace`，不再以旧的 `manual-run-*` 临时空间作为主界面数据源。
- 用户可以创建、编辑和切换任务空间；每个空间可设置任务名称、任务说明和参与 Agent。
- 每个空间有独立的消息、Run、TokenUsage、费用、状态和服务端运行锁。
- 默认会创建“开发报告生成”空间：当当前账号同时拥有“需求分析师”和“开发报告负责人”时，首次进入会按这个顺序绑定两者。
- 清空当前空间历史只删除消息和 Run，不删除空间，也不删除成员。
- 旧 `manual-run-*` 记录仍保留在数据库中用于兼容历史，但已从 `GET /api/workspaces` 的任务空间列表隐藏。

### 2.2 Agent 和 API Key

- Agent 为当前用户独立保存，API Key 在服务端以 AES-256-GCM 加密保存。
- 浏览器只得到“是否已配置、掩码、字符长度”三个安全信息，不得到明文、密文、IV 或认证标签。
- 编辑 Agent 时，API Key 输入框按原 Key 字符数显示保密圆点；点击输入框才进入替换模式。留空保存时旧 Key 保持不变。
- API Key 管理页同时展示全局供应商 Key 和智能体专属 Key，并标明“已加密保存”。

### 2.3 能力库与实际调用链路

能力库是平台的公共能力目录，不是额外的 Agent。

| 能力 | 当前真实状态 | 在普通任务空间中的作用 |
|---|---|---|
| `RAG Retrieval` | 已实现 | Agent 在创建/编辑时绑定 `rag` 后，运行前从当前账号的 Document/Chunk 知识库检索相关资料，并作为上下文传给模型。 |
| `Tool Calling` | 受控实现 | 普通聊天不会自动调用。当前只在已授权的计划/工作流中调用 `knowledge-search`、`ui-acceptance-check`，并记录审计。 |
| Long-term Memory | 规划中 | 不能宣称已实现。 |
| Semantic Cache | 规划中 | 不能宣称已实现。 |
| File Reader / Code Review | 规划中 | 不能宣称已实现。 |

普通任务空间的真实运行链路：

`选择任务空间 → 输入需求 → 服务端创建 Run/取得 activeRunId 锁 → 按空间成员顺序运行 Agent → 已绑定 RAG 的 Agent 先检索资料 → Provider 调用 → SSE 事件 → 持久消息、TokenUsage 与终态`

任务空间的 Agent 会读取前一位 Agent 的输出；因此默认“需求分析师 → 开发报告负责人”是有序协作，不是两个独立答案的拼接。

### 2.4 完整报告工作流

- `/api/plans`：结构化需求分析、追问、执行计划和动态目录。
- `/api/reviews`：独立 delivery/quality 候选、Finding、Evaluator、有限修订和人工裁决。
- `/api/reports`：版本化 ReportArtifact、Claim、来源清单和 Markdown 导出。
- `/workflows`：持久 Checkpoint、暂停、补充信息、人工审批、恢复和故障恢复。
- 模型模式的角色需要 Planner、两位候选、Reviewer、Evaluator、Reporter；baseline 模式用于确定性、可测试的演示。

## 3. 最关键的目录和文件

| 目的 | 位置 |
|---|---|
| 当前事实与限制 | `docs/current-status - 当前开发状态.md` |
| 长期设计与产品边界 | `docs/design/README - 设计文档总入口.md` |
| 长期项目记忆 | `docs/project-memory - 项目长期记忆.md` |
| 答辩级完整工程报告 | `docs/remediation/final-report - 工程整改与开发总报告.md` |
| 当前主前端控制器 | `src/components/workspace/workspace-app.tsx` |
| 任务空间聊天 UI | `src/components/workspace/workspace-chat.tsx` |
| Agent 创建/编辑 UI | `src/components/workspace/workspace-agent-manager.tsx` |
| 能力库 UI | `src/components/workspace/workspace-tools.tsx` |
| 任务空间 CRUD | `src/app/api/workspaces/route.ts`、`src/app/api/workspaces/[id]/route.ts` |
| 任务空间运行 | `src/app/api/workspaces/[id]/run/route.ts`、`src/lib/engine/orchestrator.ts` |
| 任务空间清空历史 | `src/app/api/workspaces/[id]/messages/route.ts` |
| Agent 凭证与 DTO | `src/app/api/agents/`、`src/store/agent-store.ts` |
| 加密实现 | `src/lib/security/crypto.ts` |
| 数据模型与迁移 | `prisma/schema.prisma`、`prisma/migrations/` |
| 核心端到端测试 | `e2e/core.spec.ts` |

## 4. 当前本地运行方式

项目在 Windows 环境下开发。常用命令：

```powershell
cd G:\projects\agent-learning\projects\Multi-Agent-Workspace
npm install
npm run db:migrate
npm run dev
```

浏览器访问 `http://localhost:3000`。

常用验证命令：

```powershell
npm run lint
npx tsc --noEmit
npm run test:unit
npm run db:validate
npm run db:validate:postgres
npm run test:e2e:core
npm run test:e2e:session
npm run build
```

注意：运行中的 `next dev` 会占用 `.next` 锁。执行核心 E2E 会尝试启动隔离的 Next 服务；若当前开发服务器正在使用，不要悄悄中断用户，先说明或在合适时机重启。

## 5. 当前数据与验证基线

- SQLite 有 **9 次**标准 migration；最近一次为 `20260716000000_add_api_key_length`。
- 单元测试：**62/62** 通过。
- 历史基线：核心隔离 E2E **24/24**、Session 隔离 E2E **1/1**、全量 Lint、TypeScript 与生产构建通过。
- 本轮已直接验证：默认任务空间存在、含 2 个 Agent；清空历史后仍保留 2 个成员。
- 本轮未重跑核心 E2E，原因是保留用户正在使用的开发服务器，避免中断本地界面。

不要把“测试通过”写成“真实外部模型质量已验证”。真实 Provider 盲评和人工评分仍未完成。

## 6. 接手时必须遵守的边界

1. **不要泄露 Key**：任何 API/日志/UI 都不得返回 `encryptedKey`、`iv`、`authTag` 或明文 API Key。掩码和长度可以返回。
2. **不要误报能力**：Memory、Semantic Cache、File Reader、Code Review 仍未实现；普通聊天不会自动执行 Tool Calling。
3. **不要破坏用户的工作区**：当前 Git 工作区有大量未提交改动。不要使用 `git reset --hard`、`git checkout --` 或删除无关文件。
4. **保持用户隔离**：所有 Agent、Workspace、Document、Run、Tool、Report、Workflow 查询都必须带当前 `userId`。
5. **区分目标设计与现状**：`docs/design/` 是目标；能否写“已实现”以 `docs/current-status - 当前开发状态.md`、代码和测试为准。
6. **不直接回填真实 Key 到浏览器**：即使用户要求“显示保存结果”，也只能显示掩码、状态或长度对应的保密圆点。

## 7. 下一步推荐计划

按以下顺序推进，避免先做视觉功能而忽略产品证据和安全收口。

### P0：先完成项目所有者必须做的外部事项

这些不能由代码替代：

1. 在 OpenAI/Anthropic/DeepSeek 等 Provider 后台撤销历史密钥，生成新 Key；
2. 轮换历史 `ENCRYPTION_MASTER_KEY` 与 `SESSION_SECRET`；
3. 在部署平台 Secret Store 或本机未跟踪 `.env` 配置新值；
4. 执行 `node --env-file=.env scripts/verify-secret-hygiene.mjs --production`；
5. 在项目外工单记录日期和操作者，但绝不记录密钥值。

### P1：完成真实模型质量盲评

盲评工具链已经存在，但数据未收集。接手者应按 `docs/quality/blind-evaluation-protocol - 真实模型盲评协议.md`：

1. 冻结至少 12 个案例；
2. 为每例运行五种预定义变体；
3. 生成匿名评分包；
4. 由至少两名独立评分者评分；
5. 解盲并运行 `npm run quality:blind:analyze`；
6. 只有达到协议门槛，才能对“多 Agent、RAG、评审是否提升真实报告质量”作结论。

### P2：围绕核心产品做一轮任务空间体验验收

重点不是再堆 Agent 数量，而是验证用户能理解并成功完成：

1. 新建“某项目开发报告”任务空间；
2. 选择两个或更多已创建 Agent；
3. 输入任务需求，确认回复按成员顺序、同一空间历史保存；
4. 切换到其他空间，确认历史与费用不串；
5. 编辑空间成员后再次运行，确认新成员组合生效；
6. 上传知识资料，并确认仅绑定 RAG 的 Agent 使用资料；
7. 进行键盘、窄屏和屏幕阅读器人工验收。

为以上流程补充 E2E，特别是：创建空间、更新成员、切换空间、清空历史但保留成员、跨用户隔离。

### P3：明确“聊天入口”和“完整报告工作流”的关系

当前两条路径都存在，容易让新用户困惑。推荐先做产品说明和 UI 引导，而不是马上合并底层代码：

- 任务空间：快速围绕需求协作、探索与获取初步报告；
- `/workflows`：需要正式 Planner、候选、评审、人工裁决、版本化报告时使用；
- `/reports`：查看和导出已完成的正式报告。

若要做“从任务空间一键进入正式工作流”，先设计清楚输入、成员角色映射、费用预算和报告版本归属，再改 API。

### P4：后续架构与发布事项

- RAG 现为 TF-IDF；只有在真实评测显示不足时，再评估 embedding/pgvector，不要提前重写。
- 多实例前需共享 Checkpointer、心跳和恢复机制；当前 SQLite Checkpoint 仅适合单实例 MVP。
- PostgreSQL 仅有 schema 静态校验，尚无独立 migration history。
- Electron 仍是实验壳，不要称为已交付桌面应用；需完成数据目录、安装后迁移、端口、进程和干净机器验收。
- PDF/DOCX、WCAG 人工审计属于后续范围，尚未承诺。

## 8. 每次改动的最低工作流程

1. 先读 `docs/current-status - 当前开发状态.md` 与本交接文档；
2. 用 `rg` 或精确文件读取确认现有行为，避免依据旧报告猜测；
3. 对用户请求只做授权范围内的修改；
4. 编辑必须使用补丁方式，保留无关用户改动；
5. 至少运行与改动风险匹配的 Lint、TypeScript、单元/API/E2E 检查；
6. 更新 `current-status - 当前开发状态.md`、`project-memory - 项目长期记忆.md` 与对应整改报告中的事实和测试数量；
7. 交接时明确：做了什么、未验证什么、还需要谁做什么。

## 9. 建议的新 AI 阅读顺序

1. 本文；
2. `docs/current-status - 当前开发状态.md`；
3. `docs/design/README - 设计文档总入口.md`；
4. `docs/project-memory - 项目长期记忆.md`；
5. `docs/remediation/final-report - 工程整改与开发总报告.md`；
6. 与当前任务相关的路由、组件和测试；
7. 最后再阅读历史 `docs/reviews/` 和 `docs/archive/`，它们用于了解来路，不是当前实施指令。
