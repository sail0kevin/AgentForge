# P0-2 PostgreSQL 验收状态

更新时间：2026-08-01（Asia/Shanghai）

本文只记录 PostgreSQL Checkpointer、跨实例恢复和分布式租约验收的当前证据。文档中的“已实现”“已验证”“待实测”和“目标设计”严格区分，不把测试跳过或静态检查当作 PostgreSQL 运行时验收。

## 当前结论

**P0-2 已在 WSL 专用随机临时 PostgreSQL 数据库完成运行时验收。**

2026-08-01 执行 `npm run test:integration:postgres:wsl`：脚本在 WSL PostgreSQL 中创建随机测试角色和数据库，应用四条 PostgreSQL migration，随后通过跨 Saver/Graph Checkpoint 恢复与跨进程租约/Fencing 测试，最后删除该角色、数据库和 Linux 临时工作目录。Docker Compose 与 GitHub Actions 仍是未取得的独立环境证据，且本次不代表生产负载、队列或 exactly-once 语义验证。

## 状态矩阵

| 范围 | 状态 | 证据 |
|---|---|---|
| PostgreSQL Prisma schema 与独立 migrations | 已实现 | `prisma/postgres/schema.prisma`、`prisma/postgres/migrations/` |
| `WORKFLOW_CHECKPOINT_BACKEND=postgres` 后端选择 | 已实现 | `src/lib/workflow/checkpointer.ts` |
| LangGraph `PostgresSaver` setup / put / get 路径 | 已实现 | `src/lib/workflow/postgres-checkpointer.integration.ts` |
| 跨 Saver、跨 Graph、同一 thread 的 crash recovery | 已验证（WSL 专用临时库） | `npm run test:integration:postgres:wsl`，测试只接受 `AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL` |
| lease claim / renew / expired takeover | 已验证（WSL 专用临时库） | `src/lib/workflow/workflow-lease-store.ts`、`postgres-workflow-lease.integration.ts` |
| 两实例在同一过期快照上的并发 claim | 已验证（WSL 专用临时库） | 双 worker 同步屏障；断言恰有一个 compare-and-set 成功 |
| fencing token 拒绝旧实例写入 | 已验证（WSL 专用临时库） | 独立 worker 进程执行旧 token 拒写 |
| CI PostgreSQL service、migration、集成测试与备份恢复演练 | 已实现，待 CI 实际回传 | `.github/workflows/ci.yml` |
| 本地专用验收入口隔离、migration、集成测试与备份恢复演练 | 已实现，环境缺失门禁已验证 | `scripts/run-postgres-workflow-integration.mjs`、`docker-compose.yml` |
| 多实例生产负载、队列、exactly-once 语义 | 目标设计 | V2 改进计划中的后续方向，当前未实现 |

## 本轮变更

`scripts/run-postgres-workflow-integration.mjs` 现在会：

1. 启动前检查 Docker CLI 是否可用；
2. Docker 缺失时以非零状态退出，并明确输出“PostgreSQL 验收未执行”；
3. 只有专用 Compose 服务确实启动后才执行 cleanup；
4. cleanup 失败不会覆盖迁移或集成测试的原始失败原因；
5. 在 Checkpoint 与 Lease/Fencing 集成测试后继续执行 `npm run test:integration:postgres-backup-restore`，覆盖 `pg_dump`、隔离库 `pg_restore`、恢复后 checkpoint 继续执行和 fencing token 拒写；
6. 成功完成时输出明确的 `POSTGRES_WORKFLOW_INTEGRATION_PASSED` 标记。

`scripts/run-postgres-workflow-wsl-integration.mjs` 提供无 Docker 的等价隔离入口：它从当前工作目录解析 WSL 挂载路径（或读取 `AGENTFORGE_WSL_WORKSPACE_PATH`），复制最小源码到 `/tmp` 后执行 Linux `npm ci`，防止 Windows `node_modules` 的原生二进制进入 WSL 测试。它不复制 `.env` 或 `local-only`，每次仅创建并清理带随机十六进制后缀的数据库、角色和 staging 目录。

本轮推进（2026-08-01）补充确认：

- `npm run test:integration:postgres:local` 已再次执行；当前机器没有可用的 Docker CLI，命令以非零状态退出并输出 `POSTGRES_WORKFLOW_INTEGRATION_ENVIRONMENT_MISSING`。Docker Desktop 安装包已下载并完成 SHA-256 校验，但尚未安装或启动。
- 因环境门禁提前失败，未启动 Compose、未应用迁移、未写入任何 PostgreSQL 测试数据，也未执行 cleanup；因此本轮没有新增 PostgreSQL 运行时通过证据。
- `npm run test:integration:postgres-checkpoint` 与 `npm run test:integration:postgres-workflow-lease` 在未提供专用连接串时各自明确显示 1 个 skipped；它们不是本机验收通过证据。
- 静态复核确认专用入口会注入 `DATABASE_URL`、`AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL` 和 `AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL`，CI job 会先执行 PostgreSQL migrations，再执行两类集成测试；这些是实现/配置证据，不替代成功的远程运行结果。
- `npm run test:integration:postgres:wsl` 已在 WSL PostgreSQL 18.4 上通过：三条 migration 成功应用；`postgres checkpoint survives a fresh saver and graph rebuild` 通过；`PostgreSQL lease claim, renewal, and fencing are safe across processes` 通过；输出 `POSTGRES_WSL_WORKFLOW_INTEGRATION_PASSED`。随后以 PostgreSQL 系统用户查询确认本次随机数据库和角色计数均为 `0`，并确认 `/tmp` staging 目录已删除。

本次工作区复验（2026-08-01）再次执行 `npm run test:integration:postgres:wsl` 并通过。运行时创建随机角色和数据库 `agentforge_p0_wsl_5ab6c36a9436f370`，应用三条 PostgreSQL migration 后，Checkpoint 恢复集成测试通过，跨进程租约、续租、过期接管竞争与 fencing 集成测试通过；脚本最后输出 `POSTGRES_WSL_WORKFLOW_INTEGRATION_PASSED`，并执行 `DROP DATABASE`、`DROP ROLE`。本次复验不新增 Docker 或远程 CI 证据：当前 Windows 主机未安装 Docker CLI 和 GitHub CLI。

已通过 GitHub Actions 公开 API 查询远程状态：最近一次完成的 `CI` workflow 是 2026-07-19 的 run `29699595263`（commit `02017c04fc3e3b5a780d65b0df3e218e326c4980`），其 job 列表仅有历史 `quality` job，没有 `postgres-workflow-integration`。该 commit 早于当前本地 `22f253b` 基线与未提交的 V2 变更，不能作为本次 PostgreSQL CI 验收。由于本机没有 GitHub CLI，且 Git 远程连接受本机代理连接失败影响，未对远程分支执行推送、触发或修改。

本地入口固定使用以下隔离边界：

- Compose project：`agentforge-p0-postgres-test`
- 数据库：`agentforge_v2_test`
- 宿主机端口：`5433`
- 测试数据目录：容器 `tmpfs`
- 连接串：由脚本覆盖为专用测试连接串
- 清理范围：只清理该 Compose project、其测试服务和临时卷

## 已执行的无外部费用验证

以下命令在本机执行成功：

```text
npm run typecheck
npm run test:unit       # 156 passed, 0 failed, 0 skipped
npm run lint
npm run quality:rag:golden
npm run db:validate
npm run db:validate:postgres
npx eslint scripts/run-postgres-workflow-integration.mjs
git diff --check -- scripts/run-postgres-workflow-integration.mjs
```

以下命令安全跳过，因为没有提供专用 PostgreSQL 连接串：

```text
npm run test:integration:postgres-checkpoint
npm run test:integration:postgres-workflow-lease
```

以下命令已验证会明确失败，而不是伪装成功：

```text
npm run test:integration:postgres:local
```

当前实际环境证据：Docker CLI 不存在，因此输出：

```text
POSTGRES_WORKFLOW_INTEGRATION_ENVIRONMENT_MISSING: Docker CLI is required; PostgreSQL验收未执行。
```

## 后续独立环境验收

在安装并启动 Docker Desktop 的环境中执行：

```powershell
npm run test:integration:postgres:local
```

该命令仍应在 Docker 环境运行，以增加容器化环境证据；它不是 WSL 已通过验收的前置条件：

1. 启动 `postgres-test`；
2. 应用 PostgreSQL migrations；
3. 通过跨实例 Checkpoint crash recovery；
4. 通过跨进程 lease claim、renew、过期接管、同一过期快照下的并发 claim 和 fencing；
5. 通过 `pg_dump` custom-format 备份和隔离库 `pg_restore` 恢复演练；
6. 用恢复库中的新 Saver / 新 Graph 继续已有 checkpoint，并验证旧 fencing token 仍会被拒写；
7. 清理自身测试 Compose project。

不得使用普通开发或生产 `DATABASE_URL` 替代。WSL 验收已经证明本次测试覆盖的运行时语义，但不等同于生产多实例负载、后台队列、exactly-once 或多地域验证。

## 本轮复验记录（2026-08-01）

**已验证（WSL 专用临时数据库）：** 本轮再次执行
`npm run test:integration:postgres:wsl`。脚本创建随机角色和数据库
`agentforge_p0_wsl_5ab6c36a9436f370`，在该专用数据库上成功应用以下三条迁移：

```text
20260727000000_init
20260730000000_add_workflow_fencing_lease
20260801000000_workflow_lease_expiry_timestamptz
```

随后，`postgres checkpoint survives a fresh saver and graph rebuild` 与
`PostgreSQL lease claim, renewal, and fencing are safe across processes` 两项集成测试均通过，脚本输出
`POSTGRES_WSL_WORKFLOW_INTEGRATION_PASSED`，并已执行 `DROP DATABASE` 与
`DROP ROLE`。这再次证明本入口在隔离 WSL PostgreSQL 环境中能够覆盖跨 Saver/Graph
恢复和跨进程租约语义。

**已观察但不构成验收失败：** WSL 输出过一次 postgres 用户的 systemd user-session
告警，WSL 中的 `npm ci` 同时报告了第三方依赖审计告警；两项集成测试及清理步骤均成功。
前者应由宿主机/WSL 环境维护处理，后者应在独立依赖升级任务中评估，不能被表述为
PostgreSQL 运行时测试失败，也不能被忽略为已消除的安全风险。

**待实测：** Docker Compose 与当前提交对应的 GitHub Actions
`postgres-workflow-integration` 成功回传仍未取得。本轮没有 Docker CLI 或远程 CI 新结果，
因此不会把 WSL 复验扩大表述为 Docker、CI 或生产负载验收。

## 2026-08-02 本机 Docker 入口更新

### 已实现

- `npm run test:integration:postgres:local` 现在与 CI PostgreSQL job 一样，覆盖 migration、`db:setup:workflow-checkpoints`、Checkpoint 恢复、Lease/Fencing，以及 `pg_dump`/隔离库 `pg_restore` 备份恢复演练。
- 该入口会向备份恢复脚本注入专用 `AGENTFORGE_POSTGRES_BACKUP_RESTORE_TEST_URL` 和显式确认值 `AGENTFORGE_POSTGRES_BACKUP_RESTORE_CONFIRMED=isolated-test-database`，仍只使用 `postgres-test` 临时库。

### 待实测

- 当前 Windows 主机仍没有 Docker CLI；本机执行 `docker --version` 和 `docker compose version` 均返回 “The term 'docker' is not recognized”。
- 因此本轮没有启动 Compose、没有应用 Docker 测试库 migration，也没有产生 Docker 环境的备份恢复结果。该项仍需在安装并启动 Docker Desktop 后重新执行。

## 明确边界

## 2026-08-02 复验记录

### 已验证

- 再次执行 `npm run test:integration:postgres:wsl` 并通过。
- 脚本在随机隔离数据库应用了五条迁移：`20260727000000_init`、`20260730000000_add_workflow_fencing_lease`、`20260801000000_workflow_lease_expiry_timestamptz`、`20260801010000_add_incremental_approval_patch`、`20260802010000_add_pilot_feedback`。
- `postgres checkpoint survives a fresh saver and graph rebuild` 通过。
- `PostgreSQL lease claim, renewal, and fencing are safe across processes` 通过。
- 脚本最后执行了 `DROP DATABASE` 和 `DROP ROLE`，没有保留本次随机测试库或角色。

### 待实测

- 本机仍没有 Docker CLI，故未取得 Docker Compose 独立环境证据。
- 更新后的 GitHub Actions PostgreSQL job 和新增 E2E 门禁尚未收到远程 runner 回传。
- 目标试点数据库迁移、备份恢复、应用部署和真实负载仍未执行。

- “已实现”表示代码、入口或 CI 配置已经存在。
- “已验证”表示对应范围的可复现运行已经成功。
- “待实测”表示仍需要专用 PostgreSQL、远程 CI 或真实外部资源。
- “目标设计”表示 V2 计划中的未来能力，不代表当前代码已经提供。
