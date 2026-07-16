# AgentForge 快速演示
<!-- 文件名：demo - 本地演示指南 -->

## 准备

```bash
npm run dev
```

打开 `http://localhost:3000`。

## 主演示：从需求到可恢复开发报告

1. 登录后进入“开发工作流”；
2. 点击“填入演示需求”，系统会自动填入：`为大学运营团队建设内容管理后台，需要角色权限、审核流程、操作审计、可访问性和分阶段交付。`
3. 选择“确定性基线”，点击“分析并执行”；
4. 展示七节点时间线，以及 PlanningArtifact和ReviewWorkflow；
5. Evaluator遇到高影响取舍后，页面显示“工作流已安全暂停”；
6. 选择“混合方案”，填写“权限和审计是硬门槛，其余功能按风险分批”，点击“从Checkpoint恢复”；
7. 进入“动态开发报告中心”，在“从评审生成新版本”区域点击 `approved · hybrid`，生成 ReportArtifact v1；
8. 展示动态目录、最终决策、风险、未决项、来源和 Markdown 导出；
9. 刷新页面，证明工作流位置和报告不会丢失，也不会自动生成 v2。

## 模型模式演示

先准备Ollama：

```bash
ollama pull qwen2.5:3b
ollama serve
```

创建至少一个Ollama Agent并配置模型后，在“开发工作流”选择“真实模型”。为Planner、两个候选、Reviewer、Evaluator和Reporter选择Agent；同一个Agent可以承担多个角色，但候选仍是两次输入隔离的调用。

模型演示可能因小模型结构化输出能力而失败。失败会显示安全错误和恢复入口，不应临时关闭Schema校验来“保证演示成功”。正式答辩建议先用baseline完整展示状态机，再单独展示model配置与失败审计。

## 备选演示：自由双Agent对话

1. 在“创建智能体”页展示需求分析师和开发报告负责人；
2. 在“对话空间”输入：`请为大学生设计一个 AI 学习助手，并生成开发建议。`
3. 展示后续Agent读取前序输出、SSE过程、消息恢复和API Key掩码。

## 演示边界

- 主演示展示产品级Planner、Review、人工确认、Reporter和Checkpoint；自由对话仍是独立轻量入口；
- baseline证明流程和契约，不代表真实模型语义质量；
- model协议桩E2E证明集成，不代表外部真实模型盲评；
- Provider原生Tool Calling、共享Checkpointer、多实例恢复和PDF/DOCX不在当前演示中宣称完成；
- 当前没有经过审查的公开截图、视频或在线部署链接。公开展示时可重新截取 1～2 张不含个人信息和密钥的正式图片，放入 `docs/screenshots/` 后再在 README 引用。

## 验收命令

```bash
npm run test:unit
npm run test:e2e:core
npm run test:e2e:session
npm run lint
npm run build
```

> 当前截图是本地验证产物，默认不提交。公开展示时建议重新截取 1～2 张不含个人信息和密钥的正式图片，放入 `docs/screenshots/` 后在 README 引用。
