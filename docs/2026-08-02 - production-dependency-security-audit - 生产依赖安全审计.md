# AgentForge 生产依赖安全审计

更新时间：2026-08-02（Asia/Shanghai）

## 结论

本次安全模块完成了生产依赖的最小升级和本地验证。当前 npm 官方 registry 的生产依赖审计结果为 0 个漏洞，但这只代表 npm advisory 范围内的依赖审计通过，不代表整个应用已经完成安全验收。

## 已实现

- `next` 和 `eslint-config-next` 固定到 `16.2.12`。
- `prisma`、`@prisma/client`、`@prisma/adapter-libsql` 和 `@prisma/adapter-pg` 成组固定到 `7.9.1`。
- 使用 npm `overrides` 固定 `fast-uri@3.1.4`、Next 内部的 `postcss@8.5.18` 和 `sharp@0.35.0`。
- 新增 `npm run security:audit:production`，固定使用 `https://registry.npmjs.org`，避免默认镜像不支持 npm audit API 时误报成功。
- GitHub Actions 主质量 job 在安装依赖后执行该审计命令，失败会阻断后续步骤。

## 已验证

执行环境：Node `v24.14.1`、npm `11.11.0`。

实际依赖树确认：

- `next@16.2.12`
- `postcss@8.5.18`（Next 覆盖版本）
- `sharp@0.35.0`（Next 覆盖版本）
- `fast-uri@3.1.4`（覆盖版本）
- Prisma 相关包 `7.9.1`

已通过：

```text
npm audit --omit=dev --registry=https://registry.npmjs.org
生产漏洞：0

npm run db:generate
SQLite Prisma Client 和 PostgreSQL Prisma Client 生成成功

npm run db:validate
npm run db:validate:postgres
两套 Prisma schema 校验成功
```

## 待验证

- 远程 GitHub Actions 的实际成功回传。
- 目标生产环境的依赖安装、Next 构建和启动。
- Electron Windows/macOS/Linux 打包及各平台 native `sharp` 二进制验证。
- 依赖供应链、容器镜像、运行时配置和渗透测试。

### 2026-08-02 本地全量质量门禁

已通过 `npm run quality:all`：

- 生产依赖审计：0 个 npm advisory 漏洞。
- 单元测试：186/186；`src/lib/**` 覆盖率为行 92.43%、分支 87.59%、函数 89.67%。
- 核心 E2E：24/24；Session 隔离 E2E：1/1。
- RAG baseline、Golden Set、repository smoke、blind evaluation dry-run、TypeScript、ESLint、文档命名与本地链接校验、Next.js 生产构建：全部通过。

上述结果属于当前机器上的本地验证。`npm run pilot:readiness:production` 当前失败，原因是目标试点所需的 session 认证、生产密钥、PostgreSQL `DATABASE_URL` 和 PostgreSQL Checkpointer 尚未配置；因此不能据此宣称已完成生产部署验收。

## 边界

`npm audit` 只覆盖 npm advisory 数据库中的已知依赖问题。它不能证明业务权限、敏感数据处理、Provider 调用、数据库暴露面或应用运行时已经安全。
