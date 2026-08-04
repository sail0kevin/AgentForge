# AgentForge Product/UI 实施包说明

日期：2026-08-04

## 目的

实施包（`implementation-manifest`）把 AgentForge 的单个 Product/UI 方案转换为下游 AI 编程工具或自动化流水线可以直接读取的 JSON。它避免把不同方案的页面、视觉规则与验收标准混在一起。

## 已实现

- `GET /api/reports/product-ui/:id/export?format=implementation-manifest&solutionId=...` 可导出单方案 JSON。
- Product/UI 报告详情 API 会为每个方案返回 `implementationManifest`。
- 报告中心提供“下载实现包 JSON”入口。
- 实施包包含报告组与评审溯源、产品定位、视觉方向、路由蓝图、实施顺序、交付边界、GitHub/UI 证据和验收矩阵。
- 实施包会结合最新运行验收反馈输出 `pending`、`pass` 或 `needs_revision`；没有完整真实证据时不会标为通过。

## 已验证的下游落地案例

- `/generated/attendance`：企业团队考勤工作台。
- `/generated/atelier`：数字艺术展览。
- `/generated/nocturne`：数字聆听室。

三个页面以报告中的产品定位、视觉方向、路由、组件、状态和响应式要求为依据，展示结构化 Product/UI 报告可以被下游实现流程消费。页面是仓库内的可运行案例，业务数据均为本地演示数据。

## 明确边界

三个案例是人工或 AI 编程协作下的报告映射实现，不能表述为实施包已自动编译任意网站。

实施包不会自动生成页面源码、部署地址或截图。当前下游步骤仍需要由 AI 编程工具或开发流程读取 JSON，创建代码、运行网站、采集截图并完成验收，然后把真实 runtime evidence 回写到报告组。

## 使用方式

1. 在报告中心选择一套 Product/UI 方案。
2. 下载“实现包 JSON”。
3. 将 JSON 与目标代码库交给 AI 编程工具或执行流水线。
4. 网站实现后记录启动命令、预览地址、截图、说明和每项验收结果。
5. 只有在完整真实证据回写后，方案才会被标记为通过。