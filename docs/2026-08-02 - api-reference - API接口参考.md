# API接口参考

> 日期：2026-08-02
> 状态：已实现代码表面参考；待实测端到端契约、权限矩阵与错误码覆盖。

## 目的

本文档冻结当前 `src/app/api/**/route.ts` 暴露的 Next.js API 路由，用于 RAG 人工 Golden Set 的 `api-reference` 资料覆盖。它只说明“当前代码中存在什么接口”，不代表这些接口已经达到生产 SLA、完整契约文档或外部开放 API 标准。

## 状态边界

- 已实现：认证、Agent、API Key、知识文档、计划、评审、报告、工作流、场景工作流、工作区等路由已在代码中存在。
- 已验证：本文档基于 `src/app/api/**/route.ts` 路由导出方法清单整理；RAG 标注包是否纳入本文档需由 `quality:rag:human-golden:status` 命令验证。
- 待实测：端到端鉴权、请求体验、异常分支、数据库持久化、副作用隔离、导出文件完整性。
- 目标设计：后续应补充 OpenAPI/JSON Schema、统一错误码表、权限矩阵、请求/响应样例和兼容性策略。

## 通用约定

- 认证：大多数业务接口通过 `getCurrentUser()` 要求登录；未登录通常返回 `401`。
- 运行时：多数新增业务接口声明 `runtime = "nodejs"`，便于数据库、文件导出或工作流运行。
- 错误格式：新工作流相关接口倾向返回 `{ error: { code, message } }`；部分旧接口仍返回 `{ error: string }`。
- 数据边界：Code Review 与 Bug 诊断场景只处理请求体中提交的快照或上下文，不直接读取服务器文件系统。

## 认证与用户

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册用户。 |
| POST | `/api/auth/login` | 登录并建立会话。 |
| DELETE | `/api/auth/logout` | 退出登录。 |
| GET | `/api/auth/me` | 查询当前用户。 |
| POST | `/api/auth/me` | 刷新或返回当前用户会话信息。 |

## Agent 与密钥

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| GET | `/api/agents` | 获取当前用户 Agent 列表。 |
| POST | `/api/agents` | 创建 Agent。 |
| GET | `/api/agents/[id]` | 获取单个 Agent。 |
| PUT | `/api/agents/[id]` | 更新 Agent 配置；空 API Key 表示不修改凭证。 |
| DELETE | `/api/agents/[id]` | 删除 Agent，级联删除专属凭证。 |
| GET | `/api/api-keys` | 获取当前用户 API Key 概览。 |
| POST | `/api/api-keys` | 创建或保存 API Key。 |
| DELETE | `/api/api-keys/[id]` | 删除 API Key。 |

## 知识库与检索

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| GET | `/api/documents` | 获取知识文档列表。 |
| POST | `/api/documents` | 创建或导入知识文档。 |
| GET | `/api/documents/[id]` | 获取单个知识文档。 |
| DELETE | `/api/documents/[id]` | 删除知识文档。 |
| POST | `/api/documents/search` | 执行文档检索。 |

## 计划、评审与报告

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| GET | `/api/plans` | 获取需求计划列表。 |
| POST | `/api/plans` | 创建需求计划。 |
| GET | `/api/reviews` | 获取评审工作流列表。 |
| POST | `/api/reviews` | 创建评审工作流。 |
| POST | `/api/reviews/[id]/approval` | 提交人工审批决策与备注。 |
| GET | `/api/reports` | 获取报告列表。 |
| POST | `/api/reports` | 创建报告。 |
| GET | `/api/reports/[id]` | 获取单个报告。 |
| GET | `/api/reports/[id]/export` | 导出报告内容。 |

## 工作流运行与恢复

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| GET | `/api/workflows` | 获取开发工作流列表。 |
| POST | `/api/workflows` | 创建或启动开发工作流。 |
| GET | `/api/workflows/[id]` | 获取单个开发工作流状态。 |
| POST | `/api/workflows/[id]/resume` | 从中断点继续工作流。 |
| POST | `/api/workflows/[id]/recover` | 执行工作流恢复。 |
| GET | `/api/workflows/[id]/feedback` | 获取试点反馈。 |
| PUT | `/api/workflows/[id]/feedback` | 写入或更新试点反馈。 |

## 工具与场景工作流

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| GET | `/api/tools` | 获取可用工具列表。 |
| GET | `/api/tools/execute` | 查询工具执行相关信息。 |
| POST | `/api/tools/execute` | 执行受控工具调用。 |
| POST | `/api/scenarios/code-review` | 对用户提交的代码快照执行 Code Review 工作流。 |
| POST | `/api/scenarios/bug-diagnosis` | 基于错误日志和代码上下文执行 Bug 诊断工作流。 |

## 工作区与演示

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| GET | `/api/workspaces` | 获取工作区列表。 |
| POST | `/api/workspaces` | 创建工作区。 |
| GET | `/api/workspaces/[id]` | 获取单个工作区。 |
| PATCH | `/api/workspaces/[id]` | 更新工作区。 |
| DELETE | `/api/workspaces/[id]` | 删除工作区。 |
| POST | `/api/workspaces/[id]/agents` | 将 Agent 加入工作区。 |
| DELETE | `/api/workspaces/[id]/agents/[agentId]` | 从工作区移除 Agent。 |
| DELETE | `/api/workspaces/[id]/messages` | 清空工作区消息。 |
| POST | `/api/workspaces/[id]/run` | 在指定工作区运行协作流程。 |
| GET | `/api/workspaces/demo` | 获取演示工作区状态。 |
| POST | `/api/workspaces/demo/run` | 运行演示工作区流程。 |
| GET | `/api/workspaces/manual/messages` | 获取手动工作区消息。 |
| DELETE | `/api/workspaces/manual/messages` | 清空手动工作区消息。 |
| POST | `/api/workspaces/manual/run` | 运行手动工作区流程。 |

## 内部维护

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| GET | `/api/dashboard/stats` | 获取仪表盘统计。 |
| POST | `/api/seed` | 写入演示或初始化数据；生产环境应限制使用。 |

## 后续补齐项

- 为每个接口补充请求体、响应体和错误码表。
- 增加 OpenAPI 生成或静态契约测试，避免文档与代码漂移。
- 为试点路径定义最小权限矩阵：管理员、评审者、普通用户、只读用户。
- 将接口冒烟测试纳入 CI，至少覆盖认证失败、成功路径和主要错误分支。
