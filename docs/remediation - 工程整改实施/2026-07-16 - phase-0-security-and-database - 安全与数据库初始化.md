# Phase 0：安全与数据库初始化
<!-- 文件名：phase-0-security-and-database - 安全与数据库初始化 -->
<!-- 所属目录：remediation - 工程整改实施 -->

阶段状态：部分完成  
最后更新：2026-07-15 23:00（Asia/Shanghai）  
对应问题：P0-1、P0-2

## 1. 阶段目标

- 确保历史中可能暴露的真实密钥全部失效；
- 停止跟踪 `.env`，只公开安全的 `.env.example`；
- 恢复可复现的全新数据库初始化流程；
- 在不使用现有 `prisma/dev.db` 的环境中通过核心验证。

## 2. P0-1：`.env` 与历史密钥

当前状态：部分完成（仓库侧完成，外部密钥轮换待项目所有者确认）

### 修改前事实

- `.env` 当前仍在 Git 跟踪范围；
- 项目文档记录 `.env` 曾进入 Git 历史；
- 本报告不会读取、复制或记录任何真实密钥。

### 计划步骤

- [ ] 项目所有者盘点并轮换 Provider API Key；
- [ ] 轮换 Session Secret 和 Encryption Master Key；
- [x] 停止 Git 跟踪 `.env`，本机文件保留；
- [x] 确认 `.gitignore` 保留 `.env.example` 例外；
- [x] 扫描当前项目文本文件中的常见密钥特征，未发现明显匹配；
- [x] 对全部 5 个 Git commit 执行不回显密钥值的特征扫描；
- [x] 增加不回显密钥的 Git/运行时轮换验收命令；
- [ ] 轮换扫描确认进入历史的 `ENCRYPTION_MASTER_KEY`；
- [ ] 在发布清单中记录轮换完成日期。

### 验收

```bash
git ls-files .env
git status --short
node --env-file=.env scripts/verify-secret-hygiene.mjs --production
```

- `git ls-files .env` 无输出；
- 验收脚本只输出密钥状态和长度，不能输出任何实际值；session/production 模式下 `SESSION_SECRET` 与 `ENCRYPTION_MASTER_KEY` 均为 `ready`；
- 旧密钥已经在服务商端撤销；
- 新密钥未出现在日志、截图、测试产物或提交内容中。

### 外部动作

Provider 后台轮换属于项目所有者操作。代码修改不能代替撤销已经泄露的密钥。

历史扫描未发现常见 Provider Key 格式，但在 `.env` 历史快照中确认存在非占位的 `ENCRYPTION_MASTER_KEY`（值未输出）。轮换该主密钥后，旧密钥加密的数据库凭证将无法直接解密；项目所有者需要重新保存 Provider API Key，或在保留旧主密钥的安全环境中执行专门的重加密迁移。

### 轮换后的最小验收顺序

1. 在 Provider、部署平台和身份服务后台撤销旧 Key/Secret，生成新值；
2. 先安全处理旧主密钥加密的数据库 API Key：重新保存，或在受控环境完成重加密迁移；
3. 只将新值写入部署平台 Secret Store 或本机未跟踪 `.env`；
4. 执行 `node --env-file=.env scripts/verify-secret-hygiene.mjs --production`；脚本只检查是否跟踪、是否疑似泄露、是否占位/过短和长度；
5. 在项目外的发布工单记录日期、操作者和已轮换的类别，**绝不记录实际值**；
6. 重启部署并验证登录和受保护的 Provider 调用。完成后由项目所有者将 P0-1 标记为已完成。

## 3. P0-2：数据库初始化

当前状态：已完成（当前 SQLite MVP 范围）

### 修改前事实

- 当前工作区删除了 `prisma/migrations/init.sql`；
- 两份 Prisma schema 校验通过；
- 本轮尝试建立隔离 SQLite 数据库时出现无详细信息的 Schema Engine 错误；
- 现有生产构建会使用当前 `.env` 和本机数据库，不能证明全新安装可用。

### 计划步骤

- [x] 确认旧 `init.sql` 格式异常且落后于当前 schema，不直接恢复；
- [x] 生成标准 Prisma SQLite 初始迁移和 `migration_lock.toml`；
- [x] 增加 `db:migrate`、`db:generate`、schema 校验脚本；
- [x] 明确 PostgreSQL 当前仅静态校验，迁移脚本拒绝误用 SQLite history；
- [x] 使用唯一临时 SQLite 数据库执行迁移和核心 E2E；
- [x] 测试结束自动清理临时数据库，不读取或修改 `prisma/dev.db`；
- [x] 运行单元测试、核心 E2E、Lint 和生产构建；
- [x] 更新 README 和整改文档。

### 验收

- 不复制现有 `prisma/dev.db`；
- 新数据库可以从零建立；
- README 命令与实际命令一致；
- 核心 E2E 不修改开发者真实数据；
- SQLite 与 PostgreSQL schema 的差异有明确维护方式。

### 实际实现

- `prisma/migrations/20260715000000_init/migration.sql`：与当前 SQLite schema 对齐的标准初始迁移；
- `prisma/migrations/migration_lock.toml`：明确 migration provider 为 SQLite；
- `scripts/run-prisma-migrate.mjs`：统一执行 SQLite migration，并阻止 PostgreSQL 误用；
- `scripts/run-isolated-e2e.mjs`：创建唯一临时数据库、迁移、运行 Playwright、最终清理；
- `playwright.config.ts`：拒绝绕过隔离启动器直接运行 E2E；
- `prisma.config.ts`：默认 datasource 与应用保持一致，使用本地 SQLite；
- `package.json` 和 `README - 整改执行总览.md`：提供可复现命令。

### 验证结果

| 命令 | 结果 |
|---|---|
| `npm run db:validate` | SQLite schema 通过 |
| `npm run db:validate:postgres` | PostgreSQL schema 静态校验通过 |
| Prisma migration/schema diff | No difference detected |
| `npm run db:migrate`（临时空数据库） | 初始迁移成功 |
| `npm run test:unit` | 6/6 通过 |
| `npm run test:e2e:core` | 隔离数据库 4/4 通过 |
| `npm run build` | 通过，保留 1 条已知 NFT tracing warning |
| `npm run lint` | 未通过：8 个错误、12 个警告，当前归入 Phase 7 基线 |

### 调试记录

1. 第一次隔离 E2E 使用 `spawnSync npx.cmd`，Node 24/Windows 返回 `EINVAL`；
2. 改为直接执行 Prisma Node CLI 后 Schema Engine 仍无法稳定启动；
3. 最终通过系统命令解释器执行本地 CLI，并将 Prisma 7.8 Windows SQLite 的 `RUST_LOG=info` workaround 限定在迁移脚本中；
4. 隔离迁移和 4 个核心 E2E 随后全部通过。

## 4. 执行记录

| 时间 | 问题 ID | 动作 | 文件 | 结果 |
|---|---|---|---|---|
| 2026-07-15 | P0-1/P0-2 | 建立阶段报告和验收条件 | 本文件 | 完成 |
| 2026-07-15 03:38 | P0-1 | 停止跟踪 `.env`，保留本机文件和 `.env.example` | Git 索引、`.gitignore` | 仓库侧完成 |
| 2026-07-15 03:41 | P0-2 | 替换过期非标准迁移 | `prisma/migrations/` | 完成 |
| 2026-07-15 03:48 | P0-2 | 建立隔离 E2E 启动器并处理 Windows CLI 启动问题 | `scripts/`、Playwright 配置 | 完成 |
| 2026-07-15 03:55 | P0-2 | 运行迁移、schema、unit、E2E、lint、build | 项目级验证 | 除历史 Lint 外通过 |
| 2026-07-15 22:54 | P0-1 | 新增无回显的密钥卫生与运行时就绪验收脚本 | `scripts/verify-secret-hygiene.mjs`、发布清单 | 仓库侧验收闭环；外部轮换仍待所有者确认 |
| 2026-07-16 | P0-1 | 修正 API Key 管理页只读取全局密钥、看不到智能体专属密钥的问题 | `/api/api-keys`、设置页、核心 E2E | 全局与智能体密钥均只返回掩码；界面明确显示“已加密保存” |
| 2026-07-16 | P0-1 | 在智能体编辑表单显示已保存密钥的保密圆点 | `workspace-agent-manager.tsx`、文案 | 圆点不是密钥副本；直接保存保持旧值，输入新值才覆盖 |
| 2026-07-16 | P0-1/P0-2 | 保存 Key 长度元数据，并按原长度渲染编辑框圆点 | Prisma schema、迁移、Agent DTO | 仅返回数字长度；旧密钥服务端临时计算长度，不回传明文 |

## 5. 阶段完成条件

- P0-1、P0-2 均为已完成；
- 全新环境完成数据库初始化；
- 核心 E2E 使用隔离数据库通过；
- 发布检查清单不再保留未关闭的密钥风险。

## 6. 阶段遗留问题

- 项目所有者仍需在 Provider 后台撤销历史真实密钥，并轮换曾进入历史的 Session/Encryption Secrets；
- Git 历史扫描确认 `ENCRYPTION_MASTER_KEY` 曾为非占位值，必须轮换；
- PostgreSQL 当前只有 schema 静态校验，不属于 SQLite MVP 的可部署迁移目标；
- 全量 Lint 的 8 个错误、12 个警告留在当前 Phase 7 处理。
