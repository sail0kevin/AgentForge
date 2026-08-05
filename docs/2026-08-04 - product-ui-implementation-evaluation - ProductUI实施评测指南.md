# ProductUI 实施评测指南

> 日期：2026-08-05
> 
> 目的：验证 AgentForge 生成的 Product/UI 实施报告，是否能够让下游 AI 在相同需求下实现可运行、可验收、可比较的网站。

## 1. 评测结论边界

本项目的核心交付不是一段孤立的 Prompt，而是由需求、规划产物、评审 Finding、来源证据、设计决策、页面/组件规范、实施顺序和验收矩阵组成的 Product/UI 实施报告。Prompt 只是把这份报告交给下游 AI 的兼容入口。

评测必须区分以下结论：

| 结论 | 可以由什么证据支持 | 当前状态 |
| --- | --- | --- |
| 报告能够被结构化导出 | Report、Markdown 和 `implementation-manifest` 通过契约校验 | 已实现，并有单元测试 |
| 来源被记录并映射到设计决策 | 来源引用、完整 commit SHA、路径、许可证状态、设计决策映射 | 已实现；真实来源审计仍需逐案完成 |
| 下游页面能够运行 | Playwright 路由加载、选择器、交互和响应式探针 | Runner 已实现；需要真实运行记录 |
| 下游页面满足明确的功能验收项 | 每个验收项有稳定 ID、状态和截图/测试产物 | Runner 已实现；未注册探针的项目必须保持 `not_verified` |
| AgentForge 生成的网站视觉质量更好 | 同需求双分支实现 + 独立盲评 + 成对统计 | 尚未证明 |
| AgentForge 整体优于普通 AI | 足够数量的成对 Case、完整运行证据和预先定义的判定规则 | 尚未证明 |

浏览器探针只证明注册过的运行行为，不自动证明视觉质量、审美、可用性或整体优势。当前 `qualityClaimEligible` 固定为 `false`，在人工盲评和成对运行证据完成前，不得写成“效果提升”“质量更高”或“优于普通 AI”。

## 2. 证据从哪里来

每条 Product/UI 设计结论都必须能够回到以下一种或多种来源：

1. 用户原始需求：页面目标、用户、业务约束、必须完成的任务。
2. AgentForge 工作流产物：Planner 的范围与假设、方案 Agent 的候选方案、Reviewer Finding、Evaluator 决策和验收要求。
3. 知识库证据：经过检索并保存来源定位的信息。引用内容只能支持它实际覆盖的设计结论。
4. GitHub 设计证据：仓库、路径、固定 commit SHA、代码或文档片段，以及许可证核验状态。GitHub 代码可以说明某种模式存在，不能单独证明该模式适合当前需求，也不能证明生成页面质量。
5. 明确标注的目标设计：当没有足够证据时，必须写成 `target_design`，并列出验证方式，不得伪装成已验证事实。

报告使用“证据 → 设计决策 → 页面/组件 → 验收项”的映射。下游 AI 应优先执行已绑定来源的设计决策；对于 `unverified` 或 `target_design` 项，必须保留假设并在实现结果中回传验证状态。

## 3. 对照实验设计

### 3.1 Case 注册

每个 Case 先固定以下输入，再生成两个实现分支：

- `studyId`：同一轮研究的 ID。
- `caseId`：单个需求案例的稳定 ID。
- `requirement`：不少于 20 个字符的原始需求快照。
- `reportGroupId`、`solutionId`：对应 AgentForge 报告和方案的稳定 ID。
- `routes`：该网站需要实现的路由集合。
- `expectedAcceptanceIds`：完整验收矩阵的稳定 ID 集合。
- `downstreamModel`：供应商、模型、Prompt 版本和参数。
- `humanReviewRubricVersion`：人工盲评量表版本。
- `minimumCaseCount`：默认至少 6 个 Case；这是实验门槛，不是实验结果。
- `minimumRaterCount`：默认至少 2 名独立评分者；这是实验门槛，不是实验结果。

### 3.2 两个实现分支

每个 Case 必须成对执行：

- `baseline_direct_prompt`：只提供同一份需求和预先规定的基础指令，不绑定 AgentForge 报告或 Manifest。
- `agentforge_manifest`：提供同一份需求，以及固定版本的完整报告和 `implementation-manifest`。

两个分支必须使用相同的下游模型、参数、运行环境、时间限制和验收规则。每个分支记录 Prompt、Report、Manifest 的 SHA256；Baseline 的 Report 和 Manifest SHA 必须为空，AgentForge 分支必须绑定两者。任何输入或模型不一致都应记为协议偏差，不得合并统计。

### 3.3 人工盲评

自动化运行完成后，去除分支名称和生成顺序，随机化页面展示顺序，由独立评分者按同一量表评分。实验管理员保存“匿名候选 → 实际分支”的分配表，评分者只能看到 `candidateId`、截图和预览地址，不能看到 `variant`。

每个 Case 必须登记恰好两个匿名候选，并分别映射到 `baseline_direct_prompt` 和 `agentforge_manifest`。评分提交记录必须包含 Case、匿名候选、匿名评分者、量表版本、六个维度的 1 至 5 分和每项评分理由；提交记录严格禁止携带 `variant`，避免把分支身份泄露给评分者：

- 需求覆盖：页面是否完成需求中的核心任务和内容。
- 信息架构：导航、层级、布局和重点是否清楚。
- 视觉完成度：字体、间距、颜色、对比度、组件一致性和整体审美。
- 交互与状态：加载、空状态、错误、反馈和关键操作是否完整。
- 响应式质量：桌面与移动端是否保持可用且无明显布局破坏。
- 实施清晰度：页面结构、组件组织和实现结果是否容易继续维护。

比较器会校验以下条件：候选分配属于当前研究和 Case；每个 Case 同时存在两条分支；评分量表版本一致；同一评分者对同一 Case 的两个候选都有评分；没有重复提交；每个 Case 达到 `minimumRaterCount`。只填写 `humanReviewCount` 而没有逐条 assignment/submission 记录时，会产生 `HUMAN_REVIEW_DATASET_MISSING`，不能获得质量比较资格。

`qualityComparisonEligible=true` 只表示盲评数据足以生成“描述性、逐维度”的 AgentForge - Baseline 分差，`qualityClaimEligible` 仍保持 `false`。它不能直接推出“AgentForge 更好看”或“稳定优于普通 AI”。
## 4. 自动化运行

Runner 只访问已经启动的预览地址，生成桌面端和移动端截图，并运行已经注册的浏览器探针。它不决定使用哪个下游模型，也不读取或输出模型密钥。

支持的探针类型：

- `route`：路由加载后文档非空。
- `selector_visible`：指定选择器可见。
- `selector_count`：指定选择器数量符合预期。
- `click_then_visible`：点击触发元素后目标元素可见。
- `responsive_no_horizontal_overflow`：指定视口没有横向溢出。
- `document_language`：文档 `lang` 属性符合预期。

没有注册探针的验收项自动输出 `not_verified`。验收状态不能由自然语言报告、截图存在或程序没有抛错推断出来。

示例运行方式：

```powershell
npm run dev -- --port 3100
npm run quality:product-ui:evaluate -- --config <本地评测配置.json>
```

配置中的 `previewUrl`、`launchCommand`、Case、分支、模型和输出目录必须来自真实运行。临时配置和生成截图建议放在本地 `artifacts/`，不要把伪造的运行结果提交到仓库。

### 4.1 生成与预览编排器（已实现）

`quality:product-ui:orchestrate` 将同一个冻结实验包中的分支输入、用户明确提供的下游生成器命令、预览命令与 Runner 串联。它只通过 `command + args` 启动进程，不会把外部字符串拼接为 shell；生成器和预览程序的标准输出/错误输出会写入 Artifact，且不会在控制台回显。

```powershell
npm run quality:product-ui:orchestrate -- --config <本地编排配置.json>
```

配置必须显式指定 `packageDir`、`run`、`generator`、`preview` 与可选 `evaluator`。生成器通过环境变量读取被冻结的输入：两个分支均可读取 `AGENTFORGE_CASE_PATH`、`AGENTFORGE_PROMPT_PATH`、`AGENTFORGE_RUN_ID` 与 `AGENTFORGE_ARTIFACT_DIR`；只有 `agentforge_manifest` 分支会收到 `AGENTFORGE_REPORT_PATH` 与 `AGENTFORGE_MANIFEST_PATH`。Baseline 环境会主动移除这两条路径，避免报告材料泄漏到对照组。

编排器在生成器成功、预览地址实际可访问后才调用 Runner，并写入 `orchestration-summary.json`、生成器日志、预览日志与 `runtime-evidence.json`。超时、生成失败、预览未就绪或浏览器验收失败都会返回不同状态，不会被改写为通过。该能力只自动化可复现的运行交接，不代表已真实调用任何模型，也不证明页面视觉质量。

## 4.2 运行前 preflight（已实现）

在调用下游生成器前，先运行 `quality:product-ui:preflight`。它不调用模型、不启动网站，也不会产生外部费用，只检查本次实验是否具备可复核的输入条件：

- `case.json`、Prompt、Report 和 Manifest 是否存在且符合 Schema。
- 两条冻结 Prompt 的 SHA-256 是否与 `case.json` 一致。
- AgentForge Report/Manifest 的类型、版本、绑定哈希和 `packageDir` 是否一致。
- `outputDir` 是否与实验包、seed 目录隔离，当前 `runId` 输出目录是否为空。
- 生成器中的 provider、model、Prompt 版本、adapter 版本和参数是否逐字段匹配 `case.json`。
- 生成器、预览命令和 Claude CLI 是否可解析（可用 `--skip-command-probe` 只做静态检查）。

```powershell
npm run quality:product-ui:preflight -- `
  --package-dir <实验包目录> `
  --config <本地编排配置.json>
```

`ready: true` 只表示实验协议可以开始，不表示下游网站已经生成，也不表示视觉质量通过。任何 blocking reason 都必须先修复；不能用截图、浏览器探针或本地示例页面替代真实双分支实验。
## 5. 结果计算

### 5.1 自动化指标

- 验收通过率：`passed / expected`。只有状态为 `passed` 且至少有证据路径的项目才计入分子。
- 完整证据率：每个预期验收项都有真实结果且没有失败或缺失。
- 运行完成率：`completed runs / registered runs`。
- 平均观察运行时长：只对有合法开始和结束时间的已完成运行计算。

这些指标只能描述注册过的行为和运行过程，不能替代人工视觉评分。

### 5.2 成对质量比较

对同一个 `caseId` 的两个匿名候选，比较器按每名完成成对评分的评分者、每个维度计算：

`AgentForge 分数 - Baseline 分数`

当前比较器输出六个维度的 Baseline 平均分、AgentForge 平均分、平均分差、成对评分数量，以及已评分和达到门槛的 Case 数。它会拒绝分支缺失、输入快照不一致、运行缺失、候选映射错误、量表版本不一致、重复评分和单侧评分。

`qualityComparisonEligible` 仅在全部 Case 的成对运行、匿名候选映射和最低成对评分人数都完整时才为 `true`。这是一项数据完备性状态，不是效果结论；需要报告每个 Case 的原始评分、样本量和预先登记的统计规则后，才可以进行更进一步的描述性或统计分析。

Token、延迟和成本只有在下游实现过程真实记录了模型调用和计费数据后才能报告；本 Runner 的浏览器时长不等于模型生成时长，也不等于成本。
## 6. 结果 Artifact

每个运行至少保存：

- Case 注册快照。
- 两个分支各自的 Prompt/Report/Manifest SHA。
- 下游模型、参数和源码版本。
- `runtime-evidence.json`。
- `orchestration-summary.json`、生成器 stdout/stderr 日志和预览 stdout/stderr 日志（使用编排器时）。
- 每个路由的桌面端和移动端截图。
- Playwright 输出和运行日志。
- 由实验管理员保管的匿名候选分配表（含 `candidateId` 与实际 `variant`）。
- 不包含分支身份的盲评提交记录：原始分数、评分理由、量表版本和匿名评分者 ID。
- 协议偏差、失败复现步骤和未验证项。

比较器会拒绝挂错 Case、分支、模型或输入快照的运行记录，并在缺少成对运行时输出 `RUN_MISSING`。盲评记录若缺少另一匿名候选、引用未知候选、泄露 `variant` 或与量表版本不一致，也不能进入质量比较。以上记录不能被手工改写成通过。
## 6.1 实验包导出（已实现）

为了减少手工拼接实验输入和盲评材料的风险，可以为每个真实 Case 导出一个实验包：

```powershell
npm run quality:product-ui:experiment-package -- --input <实验包输入.json> --output artifacts/product-ui-experiments/<studyId>/<caseId>
```

输入 JSON 至少需要包含 `studyId`、`caseId`、完整 `reportGroup`、目标 `solutionId`、固定的 `downstreamModel` 和 `humanReviewRubricVersion`；可选传入浏览器 `acceptanceProbes`、最低 Case/评分者门槛以及真实评审 Artifact 路径。导出器会重新生成并锁定：

- `case.json`：同一 Case 的需求、路由、验收 ID、探针、模型参数和两条分支的 SHA。
- `operator/baseline-direct-prompt.md`：只包含原始需求的直接 Prompt，不携带 AgentForge 报告或 Manifest。
- `operator/agentforge-manifest-prompt.md`：携带冻结 `implementation-manifest` 的实施 Prompt。
- `operator/agentforge-report.json`、`operator/agentforge-manifest.json`：供实验管理员核对的原始交付物。
- `admin/blind-review-assignments.json`：匿名 `candidateId` 到实际分支的映射，只能由实验管理员保管。
- `reviewer/review-package.json`：只包含匿名候选、评审材料路径和空白评分模板，不包含 `variant` 或分支映射。

评分模板中的空分数、空理由和占位评分者 ID 不是实验结果。只有评分者填入真实数据，并通过 `ProductUIBlindReviewSubmissionSchema` 校验后，才能交给比较器。实验包不会自行调用下游模型或声称网站已经实现；可使用编排器执行用户明确配置的生成/预览命令，但网站源码、截图、运行日志和 Playwright 证据仍必须由两个分支分别真实交回。
### 6.2 Claude Code 受控生成器与可复现种子（已实现）

编排器可以调用 `npm run quality:product-ui:claude-generator -- --config <生成器配置.json>` 适配 Claude Code。该 CLI 必须运行在编排器传入的环境变量下：它会校验冻结 Prompt 的 SHA256，且配置中的 `projectDir` 必须与 `AGENTFORGE_IMPLEMENTATION_PROJECT_DIR` 完全一致并位于本次 `outputDir/<runId>/generated-project` 内。

- 若配置 `seedDir`，生成器会在调用模型前复制受控种子项目，并把递归、稳定排序后的文件哈希与数量写入 `seed-snapshot.json`；Baseline 与 AgentForge 分支必须使用同一份 seed，不能复用已有生成目录。
- 下游 Claude 进程只获得本次隔离项目目录，不会收到实验包、冻结 Prompt、Report 或 Manifest 路径；Baseline 若检测到报告或 Manifest 输入会直接拒绝运行。
- Windows 的 `.cmd` / `.bat` Claude 命令通过 `cmd.exe` 兼容执行；默认使用 `acceptEdits`，不使用跳过权限校验的参数。
- 成功退出只表示生成器命令完成，不代表页面功能、视觉、可用性或 AgentForge 相对 Baseline 的质量已经通过；后续仍必须以同模型、同参数、同种子完成真实成对运行、Playwright 验收和独立盲评。
## 7. 当前实现状态（2026-08-05）

### 已实现

- Product/UI 报告、Markdown 报告和 `implementation-manifest` 的结构化导出。
- GitHub/知识库来源到设计决策的映射、证据边界声明与 `target_design`/`verified` 状态区分。
- 下游实施运行记录，绑定 Prompt、Report、Manifest、模型、参数和源码版本。
- 固定 Baseline 与 AgentForge 两个实验分支的 Case 契约。
- Playwright Runner、桌面/移动截图和六类基础浏览器探针；未注册项自动标记 `not_verified`。
- 成对运行比较器：拒绝输入快照、模型、Case 或分支不一致的运行记录，并报告 `RUN_MISSING` 等协议偏差。
- 匿名盲评数据模型与比较器：验证候选分配、六维评分理由、量表版本、成对评分、最低评分者人数和重复提交；只有数据完备时才给出描述性逐维分差。
- 实验包导出 CLI：为每个 Case 固定两条输入，拆分管理员映射、下游实施材料和不泄露分支身份的评分者材料。
- 下游实施编排 CLI：按用户显式配置运行生成器与预览命令，隔离 Baseline/AgentForge 分支环境，保存进程日志和编排摘要，并在预览就绪后调用现有 Playwright Runner；不内置供应商 API、密钥或模型选择。
- 报告中心的“对照实验包”入口：用户可为当前方案填写下游模型、Prompt 版本、Case/评分者门槛，直接下载同一份冻结的双分支实验包；该入口仅导出材料，不调用模型、不生成网站、不产生质量结论。
- 报告中心的运行证据导入：仅接收 Runner 产出的、与当前报告组及方案匹配的 `agentforge_manifest` 证据；导入仅回填运行和验收草稿并保持 `needs_revision`，服务端会拒绝 Baseline、错误报告组或错误方案，防止对照分支或错配证据被写入报告验收。

### 已验证

- `npm run typecheck` 通过。
- 编排器单元测试覆盖 Baseline 不暴露 Report/Manifest、生成失败短路、成功路径的日志元数据传递，以及真实子进程超时终止与日志保留；该验证使用本地 Node 子进程和模拟下游依赖，不构成真实 AI 生成记录。
- 2026-08-04 新增运行证据导入回归后，`npm run typecheck` 与 `npm run test:e2e:core`（`26/26`）通过：浏览器导入 `runtime-evidence.json` 后保持“需修改”，保存后由 API 验证同一 `implementationRun.runId` 仍被持久化；Baseline、错误报告组与错误方案绑定均返回明确的拒绝错误。该验证不生成下游网站，也不产生视觉质量结论。
- `npm run test:unit` 通过：239 passed、0 failed。
- `npm run lint` 通过。
- `npm run build` 通过。
- `git diff --check` 已通过；未发现空白符补丁错误。
- `npm run quality:all` 曾于 2026-08-04 成功退出，覆盖密钥卫生、RAG 回归、盲评工具链演练、Core `26/26` 与 Session `1/1` E2E、TypeScript、ESLint、文档链接检查和生产构建；该门禁不调用下游模型。本轮针对运行证据契约修复，单独复跑了类型检查、ESLint、239 个单测、生产构建和 Core `26/26` E2E。
- 本地 AgentForge 分支的真实浏览器烟雾运行已保存于 `artifacts/product-ui-implementation-evaluation/local-smoke-agentforge/`：`/generated/attendance`、`/generated/atelier`、`/generated/nocturne` 共 13 个注册探针通过，含 6 张桌面/移动端截图；三条页面的核心交互、移动端无横向溢出和 `zh-CN` 语言标记均有运行证据。

### 待实测

- 至少 6 个真实需求 Case 的双分支下游生成实验。
- 至少 2 名独立评分者按同一盲评量表完成每个 Case 的成对评分，并保存原始 assignment/submission Artifact。
- 每个真实 GitHub 设计来源的许可证状态、内容适配性与设计决策绑定审计。
- 下游模型真实 Token、延迟、成本、重试和并发数据采集。

### 尚未证明

- AgentForge 报告是否稳定地让下游 AI 生成更好看的网站。
- AgentForge 是否比普通直接 Prompt 具有统计上或业务上更好的结果。
- 三个本地示例页面是否代表真实用户场景下的整体表现。
- 下游模型的 Token、延迟、成本和并发能力。
## 8. 执行清单

1. 为每个真实需求注册 Case，保存需求、报告、Manifest 和验收矩阵快照。
2. 固定下游模型、参数、Prompt 版本和运行环境。
3. 生成并运行 Baseline 与 AgentForge 两个分支。
4. 使用 Runner 生成截图、运行证据和 Playwright 产物。
5. 检查输入 SHA、模型、Case 和分支是否成对匹配。
6. 由独立评分者完成盲评并保存原始分数。
7. 使用比较器生成描述性统计和协议偏差清单。
8. 只有达到预先登记的样本与评分门槛，且证据完整时，才更新项目的质量结论。

## 9. 对外表述建议

在真实对照实验完成前，可以准确表述为：

> AgentForge 已实现一套将设计证据、实施规范和验收矩阵导出为下游 AI 可执行交付物的链路，并提供绑定输入快照的 Playwright 运行验收与 Baseline 对照实验工具。

暂时不要表述为：

> AgentForge 能稳定生成比普通 AI 更好看的网站。

后一句必须等待成对实现、独立盲评和完整结果 Artifact 共同支持。
