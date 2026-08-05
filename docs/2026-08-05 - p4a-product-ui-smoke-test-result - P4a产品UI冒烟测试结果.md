# P4a 产品/UI 冒烟测试结果

> 日期：2026-08-05
> 目的：验证"真实 ReportGroup → 实验包 → prefire → orchestrate → 网站生成"全链路
> 性质：**链路验证**，非效力证明（baseline 报告由基线模板生成，非模型生成）

---

## 运行结果

| 指标 | Baseline（直接提示） | AgentForge（报告+清单） |
|------|---------------------|----------------------|
| 状态 | ✅ completed | ✅ completed |
| 耗时 | ~28 分钟 | ~30 分钟 |
| 生成文件数 | 22 | 30 |
| 页面截图 | 8 张（desktop+mobile × 4 路由） | 8 张 |
| HTTP 根路径 | 200 | 200 |
| Playwright 证据 | ✅ | ✅ |

## 关键结论

1. **全链路打通**：真实 `ProductUIReportGroup` → 实验包导出 → prefire `ready:true` → orchestrate → Claude 生成网站 → Playwright 截图，全链路无需人工干预。

2. **两组均生成可运行网站**：根路径均返回 HTTP 200，子路径返回 404（静态服务器无客户端路由，属正常现象）。

3. **AgentForge 产物更结构化**：
   - Baseline：22 文件，聚焦内容管理视图（dashboard/content/users/review/audit/settings）
   - AgentForge：30 文件，包含 `EvidenceTable`、`FindingList`、`CandidateComparison`、`DesignTokenPanel`、`WorkflowStepper` 等组件 —— 这些直接源自报告中的结构化信息（evidence、findings、candidates、design tokens）

4. **超时是第一瓶颈**：Baseline 在 15 分钟超时前未完成；提到 30 分钟后通过。AgentForge 需要 30+ 分钟（报告+清单的 prompt 更长）。

## 下一步（待预算）

- 扩展至 20 case × 2 评分者（需人工盲评）
- 消融实验（需 LongCat API Key）
- 自动验收不能单独等同于美学质量；应和人工盲评、任务完成度、可访问性一起使用

## 运行产物

```
artifacts/product-ui-experiments/e2e-smoke-test/
├── case-001/                # 实验包（case.json + operator/ + admin/ + reviewer/）
└── configs/
    ├── baseline/            # baseline 配置
    └── agentforge/          # agentforge 配置

artifacts/product-ui-implementation-runs/e2e-smoke-test/
├── case-001-baseline-20260805-002/       # baseline 运行产物
│   ├── generated-project/                # 生成的网站源码
│   └── playwright/                       # 截图 + 运行证据
└── case-001-agentforge-20260805-003/     # agentforge 运行产物
    ├── generated-project/
    └── playwright/
```

---

*配合 `2026-08-05 - v2-verifiability-execution-plan - V2可验证性执行方案.md` 使用*
