# AgentForge 公开截图说明

更新时间：2026-07-19（Asia/Shanghai）

本目录中的图片用于GitHub项目页和本地演示文档。截图均应来自本地演示数据，不得包含真实API Key、账号密码、个人资料、本机绝对路径或生产数据。

## 当前截图

- `workflow-completed.png`：确定性baseline经过人工裁决后的完整工作流，展示节点时间线、安全Checkpoint标识、Artifact链和已完成的ReportArtifact。
- `report-demo.png`：报告中心，展示版本记录、最终决策、动态目录、来源清单和Markdown导出入口。
- `workspace-redesign.png`：新版统一任务对话工作台，展示左侧统一导航、持久任务空间、Agent成员和对话区域。它证明当前UI入口和视觉布局，不证明真实模型质量。

## 使用边界

- 这些图片是本地Web MVP截图，不代表已有公开在线演示地址。
- 不要把截图当成真实模型盲评、性能、稳定性或生产部署证据。
- `workflow-completed.png` 和 `report-demo.png` 对应确定性baseline流程；baseline只证明工作流和契约可以复现。
- `workspace-redesign.png` 只描述当前统一工作台，不表示本轮文档收口重新开发了UI。
- 当前正式交付范围是Web MVP；Electron仍是实验性入口。

如页面结构、导航、截图中的数据或安全边界发生变化，应从本地演示流程重新生成图片，并同步更新README和本说明。不要截取包含Provider凭证或个人数据库的真实运行页面。
