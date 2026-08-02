# Phase 2：统一 RunService 和事件语义
<!-- 文件名：phase-2-run-service - 统一运行服务 -->
<!-- 所属目录：remediation - 工程整改实施 -->

阶段状态：已完成  
最后更新：2026-07-15 17:39（Asia/Shanghai）  
对应问题：ARCH-1

## 1. 阶段结论

Demo、持久工作区和手动工作区已经使用同一个 `runService` 顺序执行状态机。三条路径共同遵守 v1事件契约、Run终态、失败继续、预算、取消、消息与费用语义；差异只保留在适配层：手动/持久入口写 Prisma，Demo 使用内存空实现。

### 给非技术读者的解释

修改前像三家分店各自凭经验做同一道菜：页面看起来相似，但失败、费用、锁和历史记录的处理并不相同。以后增加 Planner 时，修一条路径很容易漏掉另外两条。

修改后，三条入口都把工作交给同一个“中央流水线”。入口只确认用户、准备 Agent 和打开 SSE；流水线决定先调用谁、怎样传递前序结论、何时停止、如何累计费用、失败后是否继续以及最终是什么状态。

## 2. 修改前问题

```text
Demo：独立循环，无 Run、无持久化、无 LangGraph
持久工作区：旧 orchestrator 循环，无 activeRunId 所有权，未统一 Run
手动工作区：路由内同时承担锁、RAG、LangGraph、模型、费用、消息和终态
```

这种结构造成六类漂移：事件字段、Run身份、锁、上下文、失败终态和持久化原子性。

## 3. 修改后结构

```text
HTTP Route
  ├─ Auth / Zod validation
  └─ SSE transport（断开 → AbortSignal）
       └─ Workspace adapter
            ├─ Agent/credential/retrieval 装配
            ├─ Prisma 或 memory persistence
            └─ RunService（唯一业务状态机）
                 └─ SingleAgent LangGraph
                      ├─ Retriever adapter
                      └─ Provider adapter
```

### 3.1 RunService 负责

- 发出 `run_created`，并固定同一轮的 runId；
- 保存用户消息；
- 按已排序 Agent 顺序执行；
- 把前序 Agent 输出以名称和内容传给后续 Agent；
- 统一预算、Token和费用累计；
- 普通 Agent失败后继续，超时/取消后停止；
- 使用 `exhausted > warning > idle` 唯一终态；
- 完成持久化后只发出一个 `run_completed`。

### 3.2 适配器负责

- HTTP路由：认证、输入校验和 SSE响应；
- Prisma适配器：Run、activeRunId、Message、TokenUsage和事务；
- 工作区适配器：加载已授权 Agent、凭证、能力和历史；
- LangGraph适配器：检索上下文与模型调用；
- Demo适配器：用内存空持久化复用相同状态机。

## 4. v1事件契约

所有正常运行事件都包含：

```json
{
  "version": 1,
  "type": "agent_started",
  "runId": "..."
}
```

事件由 Zod `RunServiceEventSchema` 在发出前运行时校验。当前事件包括 `run_created`、`workspace_loaded`、`user_message_created`、`agent_started`、`agent_completed`、`agent_failed`、`budget_exhausted`、`run_completed` 和 `error`。未来发生不兼容变更时必须提升版本，不能静默改变字段含义。

## 5. 持久化和防重语义

`createPrismaRunHandle` 统一执行：

1. 确认 workspace 属于当前用户；
2. 使用 `activeRunId` 获取带所有权的数据库锁；
3. 恢复30分钟陈旧锁；
4. 创建唯一 Run；
5. 用户/失败消息写入数据库；
6. 成功消息和 TokenUsage在同一事务中写入；
7. 每个 Agent后更新累计费用；
8. 完成时更新 Run并只释放自己持有的锁。

同一服务调用只执行一次 `completeRun`。消息ID和 TokenUsage.messageId唯一约束阻止同一结果重复落库；公共 HTTP入口不接受客户端指定 runId，因此客户端不能重放一个已完成 Run。未来如果增加任务恢复或消息队列，应再引入显式 idempotency key。

## 6. 取消与错误

持久和 Demo路由使用统一 `createRunSseResponse`：浏览器取消读取或 HTTP断开时中止内部 AbortController，信号继续传到 RunService、LangGraph和 Provider。手动路由保留原有等价传输保护。Provider原始异常仍经过 `toSafeRunError`，SSE不返回密钥、请求头或内部数据库信息。

## 7. 验收结果

- [x] 定义 RunService输入、结果、Agent、Persistence和 EventSink边界；
- [x] 定义 Zod版本化 v1 SSE事件；
- [x] 手动双 Agent迁入 RunService；
- [x] 持久工作区迁入同一服务、Run锁和 LangGraph；
- [x] Demo改为同一服务的内存适配器；
- [x] 删除手动和旧 orchestrator中的重复顺序/预算/终态循环；
- [x] 三入口正常事件均带 version=1和同一 runId；
- [x] 消息和 TokenUsage关联 Run；
- [x] 每轮唯一 run_completed；
- [x] 生产构建和原有回归通过。

## 8. 自动化证据

### 8.1 单元测试

RunService新增4项：

1. v1事件、前序上下文和唯一完成；
2. 前序失败、后续成功仍为 warning；
3. Provider超时停止后续 Agent；
4. 初始预算耗尽不调用 Agent。

当前总单元测试27/27通过。

### 8.2 E2E

核心 E2E新增2项：

- 持久工作区创建真实 Run、锁、两次 Agent失败、三条 runId消息和唯一 warning终态；
- Demo在零 Agent fixture下发出 `run_created → workspace_loaded → user_message_created → run_completed`，全部事件共享 v1/runId。

手动入口原有并发、超时、取消和持久化测试继续通过。当前核心 E2E 12/12、Session E2E 1/1通过。

## 9. 执行记录

| 时间 | 动作 | 主要文件 | 验证 | 状态 |
|---|---|---|---|---|
| 2026-07-15 | 建立目标边界和迁移验收 | 本文件 | 文档检查 | 已完成 |
| 2026-07-15 17:05 | 建立 RunService和 v1事件契约 | `run-service.ts`、`run-contract.ts` | unit 27/27、tsc | 已完成 |
| 2026-07-15 17:12 | 提取 Prisma Run持久化并迁移手动入口 | `prisma-run-persistence.ts`、manual route | core E2E 10/10 | 已完成 |
| 2026-07-15 17:20 | 迁移持久/Demo并统一 SSE适配器 | orchestrator、persistent/demo routes、`run-sse.ts` | core 12/12、Session 1/1、build | 已完成 |

## 10. 遗留边界

- 当前统一的是顺序 MVP状态机，Planner条件路由从 Phase 3开始加入；
- Demo不写数据库，这是有意的模拟适配器差异；
- 手动入口的 SSE传输代码尚未改用公共 helper，但取消和脱敏行为已有等价 E2E；
- 多实例锁和可恢复任务仍需 PostgreSQL/队列环境测试；
- 显式 idempotency key留给未来队列、重试和 checkpoint场景。

阶段结论：ARCH-1在当前单进程 Web MVP范围内完成，可以进入 Phase 3。
