# AgentForge 快速演示
<!-- 文件名：demo - 本地演示指南 -->

更新时间：2026-07-19（Asia/Shanghai）

## 准备

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

打开 `http://localhost:3000`。当前没有公开在线演示地址；本指南描述的是本地 Web MVP。

## 主演示：从需求到可恢复产品/UI实施报告组

1. 登录后从统一导航进入“开发工作流”；
2. 点击“填入演示需求”，系统会自动填入：`为大学运营团队建设内容管理后台，需要角色权限、审核流程、操作审计、可访问性和分阶段交付。`
3. 选择“确定性基线”，点击“分析并执行”；
4. 展示七节点时间线、PlanningArtifact、彼此隔离的 Delivery / Quality 候选和 ReviewWorkflow；
5. Evaluator 遇到高影响取舍后，页面显示“工作流已安全暂停”；
6. 选择“混合方案”，填写“权限和审计是硬门槛，其余功能按风险分批”，点击“从 Checkpoint 恢复”；
7. 进入“产品/UI实施报告中心”，从已批准评审生成三套独立方案：体验优先、视觉优先和工程优先；
8. 展示每套方案的页面清单、用户流程、组件状态、设计 Token、响应式要求、证据和视觉验收标准；
9. 复制当前方案的下游 AI 编程 Prompt，或导出单套/整组三套 Markdown；
10. 下游网站实际运行后，在“生成后验收”区域记录通过或需要修改的真实结果；
11. 刷新页面，确认工作流位置、报告组和验收反馈仍然存在，且不会自动重复生成新版本。

对应的已审查截图：

- `docs/screenshots/workflow-completed.png`：完成后的工作流时间线、Checkpoint 和 Artifact 链；
- `docs/screenshots/report-demo.png`：报告中心、动态目录、来源和 Markdown 导出；
- `docs/screenshots/workspace-redesign.png`：当前统一工作台、持久任务空间、Agent 成员和统一导航。

截图只是本地 UI 证据，不代表在线部署或模型质量结论。

## 模型模式演示

先准备 Ollama：

```bash
ollama pull qwen2.5:3b
ollama serve
```

创建至少一个 Ollama Agent并配置模型后，在“开发工作流”选择“真实模型”。为 Planner、两个候选、Reviewer、Evaluator 和 Reporter选择Agent；同一个Agent可以承担多个角色，但 Delivery / Quality候选仍是两次输入隔离的调用。

模型演示可能因小模型结构化输出能力而失败。失败会显示安全错误和恢复入口，不应临时关闭 Schema校验来“保证演示成功”。正式答辩建议先用 baseline完整展示状态机，再单独展示 model配置与失败审计。

## 备选演示：自由双 Agent 对话

1. 在“创建智能体”页展示兼容的自由 Agent 入口；
2. 在“对话空间”输入：`请为大学生设计一个 AI 学习助手，并生成开发建议。`
3. 展示后续 Agent 读取前序输出、SSE 过程、消息恢复和 API Key 掩码。

自由对话是保留的轻量入口，不代表产品工作流的能力上限。

## 质量验证演示

### 完整工程门禁

```bash
npm run quality:all
```

2026-08-02 当前工作区的聚焦验证为 `208/208` Unit；SQLite/PostgreSQL schema 校验、TypeScript、ESLint 和 Production Build 通过。历史完整门禁和本轮聚焦门禁按日期分别记录，不把单次聚焦验证写成全部质量结论。

### 项目真实文档检索

```bash
npm run quality:rag:repository
```

该命令读取 `README.md` 和当前开发状态文档。文档收口后的最终复跑生成31个带标题路径与行号来源的Chunk，6个检索意图6/6命中目标章节。这是仓库文档冒烟门禁，不是通用检索准确率或真实模型语义质量。

### 盲评工具链预检

```bash
npm run quality:blind:dry-run
```

该命令以 `synthetic: true`、`modelCalled: false` 的合成数据预检四臂协议，当前贯通24案例、5次重复、4个实验臂，共480条运行计划。实际 Provider 调用仍为 `0`，不得把预检描述成真实模型盲评或多Agent质量提升。

## 演示边界

- 主演示展示产品级 Planner、双候选、Review、人工确认、Reporter 和 Checkpoint；
- baseline证明流程和契约，不代表真实模型语义质量；
- RAG当前是TF-IDF，没有Embedding、RRF或向量数据库；
- Tool是受计划授权的受控只读工具，Provider原生Tool Calling尚未统一完成；
- PostgreSQL Checkpointer、租约和 Fencing Token 已实现，并在专用临时数据库完成验收；共享生产环境、多实例负载和备份恢复仍未验证；
- 正式导出只有Markdown，PDF/DOCX尚未完成；
- Electron是实验性入口，正式交付范围是Web MVP；
- 当前没有公开在线演示地址；
- 真实四臂模型实验仍需实际 Provider 调用、人工 Golden Set 标注和至少2名独立评分者评分；当前没有真实质量提升、成本或视觉结果数字。
