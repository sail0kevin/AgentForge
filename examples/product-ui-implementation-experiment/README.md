# Product/UI 下游实施对照实验模板

这个目录只提供**无密钥的配置模板和执行顺序**，不包含真实模型输出，也不代表 AgentForge 已经优于直接 Prompt。

实验要回答的问题是：在相同需求、模型、参数、种子项目和运行环境下，携带 AgentForge 报告与 `implementation-manifest` 的下游实施分支，是否比只携带需求的 Baseline 分支产生更好的可运行网站。

## 目录内容

- `orchestrator.config.example.json`：编排器配置模板。每次运行前必须修改 `packageDir`、`run.runId`、`run.variant` 和路径。
- `claude-generator.config.example.json`：Claude Code 生成器配置模板。`execution` 中的字段必须与实验包 `case.json` 的 `downstreamModel` 完全一致。
- `../../product-ui-implementation-seed/`：两个分支共同使用的受控种子项目。

## 执行顺序

### 1. 导出一个真实实验包

实验包输入必须来自真实的 Product/UI 报告组和方案，不要手工编造报告、路由或验收项：

```powershell
npm run quality:product-ui:experiment-package -- `
  --input <真实实验包输入.json> `
  --output artifacts/product-ui-experiments/<studyId>/<caseId>
```

导出后，检查下列文件：

- `case.json`
- `operator/baseline-direct-prompt.md`
- `operator/agentforge-manifest-prompt.md`
- `operator/agentforge-report.json`
- `operator/agentforge-manifest.json`
- `admin/blind-review-assignments.json`
- `reviewer/review-package.json`

### 2. 复制并填写配置

复制两个 `.example.json` 文件到本地实验目录，或者直接在副本上修改。不要把真实 API Key 写入 JSON；密钥只通过本机环境变量或 Claude CLI 的登录状态提供。

至少修改：

- `packageDir`：指向已导出的实验包。
- `outputDir`：与实验包隔离的全新输出根目录。
- `run.runId`：每次运行唯一，不能复用旧目录。
- `run.variant`：一次使用 `baseline_direct_prompt`，另一次使用 `agentforge_manifest`。
- `generator.execution.provider`、`model`、`promptVersion`、`adapterVersion`、`parameters`：必须逐字段复制自 `case.json` 的 `downstreamModel`。
- `generator.seedDir`：两个分支必须使用同一个受控种子目录。

### 3. 先运行 preflight

```powershell
npm run quality:product-ui:preflight -- `
  --package-dir artifacts/product-ui-experiments/<studyId>/<caseId> `
  --config <本地编排配置.json>
```

没有可用的外部命令时，可以跳过命令探测，但这只代表配置和输入快照通过：

```powershell
npm run quality:product-ui:preflight -- `
  --package-dir artifacts/product-ui-experiments/<studyId>/<caseId> `
  --config <本地编排配置.json> `
  --skip-command-probe
```

只有 `ready: true` 才允许进入生成阶段。`ready: true` 不是网站质量通过，也不是 AgentForge 优势结论；它只说明本次实验的输入绑定、目录隔离、哈希和配置元数据满足协议。

### 4. 分别运行两个分支

为两个分支使用相同的模型、参数、种子、预览命令和验收规则，只改变 `run.variant` 与唯一 `runId`：

```powershell
npm run quality:product-ui:orchestrate -- --config <baseline-编排配置.json>
npm run quality:product-ui:orchestrate -- --config <agentforge-编排配置.json>
```

编排器会在每个 run 目录保存生成器日志、预览日志、`claude-generator-summary.json`、`orchestration-summary.json`、Playwright 输出和 `runtime-evidence.json`。任何生成失败、预览未就绪或验收失败都必须保留原始状态，不能改写为通过。

### 5. 完成匿名盲评和比较

管理员保管 `admin/blind-review-assignments.json`，评分者只接触 `reviewer/review-package.json` 和匿名候选材料。每个 Case 需要两条分支都真实完成，并由预先登记的独立评分者按同一量表评分。

只有成对运行、匿名映射、量表版本、评分提交和最低样本门槛全部满足时，比较器才会给出可用的描述性分差。单个本地页面、截图数量或浏览器探针通过，不能替代人工视觉评测。

## 证据边界

- 已实现：实验包导出、SHA-256 绑定、分支输入隔离、preflight、生成/预览编排、Playwright 运行证据和盲评数据契约。
- 已验证：本地无模型的协议测试可以发现 Prompt 篡改、配置漂移和输出目录复用。
- 待实测：真实下游 AI 双分支生成、至少 6 个真实 Case、至少 2 名独立评分者、Token/延迟/成本和视觉质量比较。
- 不得声称：在真实成对实验完成前，不得声称 AgentForge 生成的网站更好看、质量更高或优于普通 AI。