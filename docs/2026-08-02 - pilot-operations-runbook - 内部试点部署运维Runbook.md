# AgentForge 内部试点部署与运维 Runbook

> 文档状态：目标环境执行手册
>
> 更新时间：2026-08-02（Asia/Shanghai）
>
> 适用范围：受控内部试点，不构成面向不特定用户的生产上线承诺。

## 1. 证据口径

本 Runbook 把每个结论分成四类：

- **已实现**：代码或配置已经存在。
- **已验证**：在明确记录的环境中实际执行并通过。
- **待实测**：已有步骤，但尚未在目标环境执行。
- **目标设计**：计划中的能力，不得写成当前能力。

当前已验证的环境是本机 WSL 临时 PostgreSQL。它不能替代目标环境、Docker、远程 CI 或生产负载测试；本机 WSL 隔离备份恢复演练的证据单独记录在第 5.3 节。

## 2. 进入试点前的责任与输入

开始部署前必须记录以下信息；缺少任一项时，状态应保持为 `blocked`，不得以默认值代替：

| 项目 | 必填内容 | 证据载体 |
| --- | --- | --- |
| 业务负责人 | 姓名、审批范围 | 试点授权单 |
| 技术负责人 | 姓名、部署窗口 | 试点授权单 |
| 故障升级联系人 | 姓名、联系方式、响应时段 | 值班记录 |
| 数据范围 | 脱敏需求、知识库快照、禁止上传的数据 | 数据清单与 SHA-256 |
| Provider | Provider、精确模型版本、区域 | 配置清单 |
| 费用 | 单次预算、总预算、停止阈值 | 费用授权单 |
| 保留策略 | 原始输出、日志、指标的保留时长 | 数据保留审批 |
| 数据库 | PostgreSQL 地址、备份位置、恢复负责人 | 环境登记 |

Provider 凭证只允许写入目标环境的凭证管理系统或加密配置，不写入 Git、Runbook、终端输出或公开报告。

## 3. 目标环境配置

目标环境至少需要 Node.js LTS、npm、可访问的 PostgreSQL，以及能够运行 Next.js 的应用实例。试点配置必须满足：

```dotenv
APP_AUTH_MODE=session
SESSION_SECRET=<至少32字符的随机值>
ENCRYPTION_MASTER_KEY=<至少32字符的随机值>
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>?schema=public
WORKFLOW_CHECKPOINT_BACKEND=postgres
WORKFLOW_CHECKPOINT_AUTO_SETUP=false
```

Provider 的密钥和模型配置按项目现有 Agent/Provider 配置流程注入。不要把真实密钥填入 `.env.example` 或提交到仓库。

执行配置预检：

```powershell
npm ci
npm run pilot:readiness:production
```

预检只检查配置形态，不验证数据库可连接性、备份可恢复性、Provider 额度或业务效果。任何 `FAIL` 都必须先修复并保存完整输出。

## 4. 数据库部署顺序

### 4.1 迁移前检查

1. 确认 `DATABASE_URL` 指向目标试点数据库，而不是开发库或测试库。
2. 确认数据库备份策略已启用，并记录最近一次备份时间和恢复负责人。
3. 记录当前应用版本、Git commit、迁移目录清单和数据库连接测试结果。
4. 先在隔离的 staging 数据库执行同一组步骤。

### 4.2 应用 Prisma migration

```powershell
npm run db:generate:postgres
npm run db:migrate:postgres
```

迁移完成后保存 Prisma 输出、数据库 migration 状态和目标数据库标识。不要使用 `prisma db push` 替代受版本控制的 migration。

### 4.3 初始化 LangGraph Checkpointer

Checkpoint DDL 必须作为单独的部署步骤执行一次：

```powershell
npm run db:setup:workflow-checkpoints
```

应用实例启动时不应并发执行 Checkpointer DDL。只有在该命令成功后，才允许启动试点应用。

## 5. 备份与恢复验收

以下命令中的路径和数据库连接必须由部署负责人通过目标环境的安全注入提供。不要把连接串或备份文件提交到 Git。

### 5.1 备份

```powershell
pg_dump --format=custom --no-owner --file=<secure-backup-path> "$env:DATABASE_URL"
Get-FileHash <secure-backup-path> -Algorithm SHA256
```

至少记录：备份开始和结束时间、文件大小、SHA-256、存储位置、操作者和对应 Git commit。生产或试点数据的备份文件不得放入 `local-only/` 以外的工作区目录。

### 5.2 恢复演练

恢复必须使用隔离数据库，不得覆盖线上或试点运行中的数据库：

```powershell
createdb <restore-database-name>
pg_restore --clean --if-exists --no-owner --dbname=<restore-database-url> <secure-backup-path>
```

恢复后重新执行：

```powershell
$env:DATABASE_URL = "<restore-database-url>"
$env:AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL = "<restore-database-url>"
$env:AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL = "<restore-database-url>"
npm run db:setup:workflow-checkpoints
npm run test:integration:postgres-checkpoint
npm run test:integration:postgres-workflow-lease
```

恢复验收必须确认：已有 workflow checkpoint 可以由新的 saver/graph 继续读取；租约和 fencing token 的过期接管、续租及旧 token 拒写仍然通过。只有这些结果和备份元数据同时保存，才可将“备份恢复已验证”标记为已验证。

### 5.3 本机 WSL 隔离备份恢复演练记录

**状态：已实现并已验证（本机 WSL 临时 PostgreSQL）**

本次演练使用显式指定的源测试库，生成随机命名的隔离恢复库；演练结束后删除恢复库和本次写入的源库测试数据。实际执行入口为：

```powershell
$env:AGENTFORGE_POSTGRES_BACKUP_RESTORE_TEST_URL="<isolated-test-db-url>"
$env:AGENTFORGE_POSTGRES_BACKUP_RESTORE_CONFIRMED="isolated-test-database"
npm run test:integration:postgres-backup-restore
```

实际通过的检查：

| 检查项 | 结果 |
| --- | --- |
| `pg_dump` 生成 custom-format 备份 | 已通过 |
| 备份大小 | `72214` bytes |
| 备份 SHA-256 | `953ffe497453dd40fd094dfb75c72ef4bf01db07643b98445dff32cd5f496ea5` |
| 隔离数据库创建与 `pg_restore` | 已通过 |
| 新 Saver / 新 Graph 读取并继续已有 checkpoint | 已通过 |
| 恢复后的旧 fencing token 拒写 | 已通过 |
| 恢复后的当前 fencing token 写入 | 已通过 |
| 演练后的随机恢复库与临时备份清理 | 已通过 |

该记录只证明本机 WSL 临时 PostgreSQL 的恢复链路可执行，不证明目标环境、Docker/远程 CI、真实备份存储、生产数据规模或生产恢复时间目标已经达标。目标环境仍必须按第 5.1 和第 5.2 节重新执行并保存证据。

## 6. 启动、冒烟与试点运行

启动前再次确认：

```powershell
npm run pilot:readiness:production
npm run quality:all
npm run build
```

`quality:all` 是本地无真实 Provider 费用的质量门禁；它不替代目标环境迁移、恢复演练和真实模型验收。

应用启动方式由目标部署平台决定。启动后至少执行一条脱敏需求冒烟流程，并记录：

- workflow/thread 标识和应用版本；
- 每个节点的完成、暂停、恢复或失败状态；
- 人工审批决定及增量修改；
- 证据引用、失败原因和工具审计；
- 输入/输出 token、延迟、费用和人工干预；
- Provider 错误、数据库错误和用户反馈。

终态工作流可在工作流页面的“试点反馈”区域提交结构化复盘信息。提交内容包括报告可用性、是否人工修改、干预原因、证据问题类型、失败分类和可选备注；同一工作流可以在复盘后再次更新。反馈 API 只接受当前用户自己的终态工作流，拒绝运行中、等待澄清和等待人工裁决的工作流。该入口用于收集试点数据，不代表用户价值已经验证。

真实 Provider 消融实验必须另行经过授权，且必须同时传入：

```text
--execute --confirm-external-costs --authorization-file <approved-file>
```

未获得授权时，只允许生成计划、预算和 dry-run，不得产生外部调用费用。

## 7. 运行监控与停止条件

试点负责人每天检查工作流失败、租约冲突、人工干预、证据错误、延迟、token 和费用。出现以下任一情况，应暂停新增任务并升级：

- 预算达到授权停止阈值；
- 发现跨用户数据、凭证或原始输出泄露；
- workflow 无法恢复，或旧 fencing token 能覆盖新状态；
- 数据库备份或恢复验收失效；
- 连续失败原因尚未定位；
- Provider 返回异常、额度不足或费用无法核对。

暂停试点时，先停止入口和新任务提交，再等待正在运行的任务按值班策略处理；不要直接删除数据库、Checkpoint 或审计记录。

## 8. 回滚

应用回滚与数据库回滚分开处理：

1. 应用代码回滚到最近一个通过质量门禁的版本。
2. 保持数据库备份和审计记录不变。
3. 不自动回滚已执行的 Prisma migration；需要数据库反向变更时，必须由技术负责人评审并编写新的正向 migration。
4. 回滚后重新执行生产配置预检、Checkpoint 恢复测试和一条脱敏冒烟流程。
5. 记录回滚原因、影响范围、起止时间、恢复版本和后续修复任务。

## 9. 验收记录模板

| 验收项 | 状态（已实现/已验证/待实测/目标设计） | 证据 | 负责人 | 时间 |
| --- | --- | --- | --- | --- |
| 生产配置预检 | 待实测 | `pilot:readiness:production` 输出 |  |  |
| Prisma migration | 待实测 | migration 输出与 commit |  |  |
| Checkpointer DDL | 待实测 | `db:setup:workflow-checkpoints` 输出 |  |  |
| 备份生成 | 已验证（本机 WSL 隔离演练） | `72214` bytes；SHA-256 `953ffe497453dd40fd094dfb75c72ef4bf01db07643b98445dff32cd5f496ea5` |  | 2026-08-02 |
| 隔离库恢复 | 已验证（本机 WSL 隔离演练） | `pg_restore --clean --if-exists --no-owner --exit-on-error` 通过，随机恢复库已清理 |  | 2026-08-02 |
| Checkpoint 恢复 | 已验证（本机 WSL 隔离演练） | 新 Saver / 新 Graph 从恢复库继续执行并完成 |  | 2026-08-02 |
| Lease/Fencing | 已验证（本机 WSL 隔离演练） | 旧 token 拒写、当前 token 可写 |  | 2026-08-02 |
| 本地 Docker PostgreSQL 验收入口 | 已实现，待实测 | `npm run test:integration:postgres:local` 已串联 migration、Checkpoint、Lease/Fencing 与备份恢复；当前主机缺 Docker CLI |  |  |
| 脱敏冒烟 | 待实测 | workflow/thread 记录 |  |  |
| 真实模型质量 | 目标设计 | 经授权的实验报告 |  |  |
| 用户业务价值 | 目标设计 | 试点复盘与用户反馈 |  |  |
| 结构化试点反馈入口 | 已实现并已验证 | 工作流页面“试点反馈”表单、`GET/PUT /api/workflows/:id/feedback`、反馈契约测试 |  |  |

## 10. 当前状态

- **已实现**：PostgreSQL Checkpointer、Prisma PostgreSQL migrations、workflow lease/fencing、生产配置预检和专用集成测试入口；本地 Docker 入口已串联备份恢复演练，但尚未在 Docker 环境执行通过。
- **已实现**：终态工作流结构化试点反馈入口，支持可用性、人工修改、干预原因、证据问题、失败分类和备注；同一工作流可更新反馈。
- **已验证**：本机 WSL 随机临时 PostgreSQL 的 migration、Checkpoint 恢复、lease/fencing 验收，以及 `pg_dump`/隔离库 `pg_restore` 备份恢复演练；本地自动化质量门禁。
- **已验证**：反馈输入契约、枚举边界、人工修改必填原因、日期序列化和无原始模型数据保存约束的单元测试；前端类型检查和 ESLint 通过。
- **待实测**：目标环境连接、Docker/远程 CI 独立验收、目标环境备份恢复、真实备份存储与恢复时间目标、应用部署和真实试点运行。
- **待实测**：真实用户提交反馈的覆盖率、报告可用性分布、人工修改率、证据问题分布和失败分类分布。
- **目标设计**：真实 Provider 四臂消融结论、真实 RAG Recall@5、生产负载能力、用户业务收益和面向不特定用户的 SaaS 上线。
