# Changelog

All notable changes to AgentForge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added - Phase 1 Improvements

#### Schema简化（-43%字段）
- 简化Review输出Schema：7字段 → 4字段
- 移除冗余字段：`failureScenario`、`evidenceRefs`、`suggestion`、`relatedCandidateIds`
- 保留核心字段：`id`、`candidateId`、`severity`、`description`
- **代码位置**：`src/lib/review/schemas.ts`
- **测试覆盖**：7个单元测试（`src/lib/review/review-conversion.test.ts`）
- **预期效果**：降低模型出错概率，Schema失败率从15.3%降至4-6%

#### JSON容错增强（三层Fallback）
- **Layer 1**：Markdown代码块提取（``\`\`\`json ... \`\`\```）
- **Layer 2**：正则匹配修复（尾部逗号、单引号、注释）
- **Layer 3**：LLM自动修正（使用同一模型重新格式化）
- **代码位置**：`src/lib/planner/structured-output.ts`
- **测试覆盖**：12个单元测试（`src/lib/planner/structured-output.test.ts`）
- **预期效果**：95%+的JSON解析成功率

#### 快速通道（跳过不必要修订）
- 触发条件：`overallAssessment === "no_major_issues" && findings.length === 0`
- 效果：跳过Reviser调用，直接接受Planner方案
- **代码位置**：`src/lib/review/review-service.ts`
- **测试覆盖**：快速通道单元测试
- **预期效果**：30%的case触发快速通道，调用次数从5次降至3.5次

#### 最小化修订提示词
- 引导Reviser进行"外科手术式"修改，保留核心设计
- Prompt优化：强调"minimal changes"、"preserve core decisions"
- **代码位置**：`src/lib/review/review-service.ts`
- **预期效果**：减少过度修改，保持方案一致性

### Added - 验证与分析工具

#### Phase 1 验证脚本
- 新增：`scripts/phase1-validation-runner.ts`
- 功能：24-case验证（10个失败case + 14个成功case）
- 自动统计：token使用、成本、Schema解析尝试次数、快速通道命中率
- 增量保存结果（防止中断丢失数据）

#### API监控工具
- 新增：`scripts/monitor-api-status.ts`
- 功能：定期检查LLM API可用性（每小时）
- 自动通知API恢复
- 后台运行模式支持

#### 成本计算器
- 新增：`scripts/calculate-validation-cost.ts`
- 功能：快速估算不同验证方案的成本和耗时
- 支持5种验证方案对比
- 推荐最优执行顺序

### Added - 文档

#### 架构文档
- 新增：`local-only/ablation/phase1-improvement-diagrams.md`
- 包含：Schema简化流程图、JSON容错架构图、快速通道决策树
- 新增：`local-only/ablation/phase1-validation-visualization-plan.md`
- 包含：验证结果可视化设计（仪表盘、对比表、图表）

#### 规划文档
- 新增：`local-only/ablation/phase2-improvement-ideas.md`
- 包含：7项Phase 2改进方向、优先级排序、成本效益分析
- 新增：`local-only/waiting-period-checklist.md`
- 包含：API阻塞期间的项目完善工作清单

### Fixed

#### 高优先级修复
- **修复Schema解析失败率过高**：从15.3%降至预期4-6%（-65%）
- **修复API调用次数过多**：从平均5次降至预期3.5次（-30%）
- **修复成本过高**：从13.7x baseline降至预期8-9x（-35%）

#### 中优先级修复（待Phase 2）
- Review机制导致的质量下降（覆盖率-8.6%，约束满足率-9.7%）
- 快速通道覆盖不足（仅覆盖no_major_issues场景）
- Evidence支持率不足（Tier 2尚未配置）

### Changed

#### Review Workflow优化
- 优化Reviewer Prompt：减少"找茬心态"，聚焦真正重要的问题
- 优化Reviser Prompt：强调最小化修改，保留核心设计
- 重构：`src/lib/review/review-service.ts`

#### Structured Output重构
- 重构：`src/lib/planner/structured-output.ts`
- 增强：三层JSON容错机制
- 改进：错误信息更详细，包含原始内容和尝试过的修复方法

### Performance

#### 预期性能提升（Phase 1）
- 完成率：84.7% → 92-94% (+7-9%)
- Schema失败率：15.3% → 4-6% (-65%)
- 平均调用次数：5次 → 3.5次 (-30%)
- 平均成本：13.7x → 8-9x (-35%)

### Testing

#### 测试覆盖现状
- 单元测试：299个，100%通过，6.7秒
- E2E测试：26个，100%通过
- TypeScript编译：零错误
- Lint检查：零警告
- 测试覆盖率：31.6%

---

## [0.1.0] - 2026-08-10

### Added - 初始版本

#### 核心框架
- 多Agent协作框架（Planner、Proposer、Reviewer、Reviser、Evaluator）
- LangGraph工作流编排
- SQLite/PostgreSQL双数据库支持
- Prisma ORM集成

#### RAG系统
- TF-IDF基线检索
- bge-m3嵌入式检索
- 混合检索策略
- 文档版本管理

#### 消融实验系统
- 4-variant对照实验框架（single_agent、dual_candidate_no_review、single_candidate_with_review、full_multi_agent）
- 完整的实验授权流程
- 自动成本预算计算
- 结果ledger持久化

#### 测试基础设施
- 轻量级case集（24个case）
- 盲测评分系统
- 自动化E2E测试
- 单元测试框架

#### 前端界面
- Next.js 16 + React 19
- 产品需求输入界面
- 实时进度显示
- 结果报告展示

### Initial Release Features

#### Three Runnable Examples
1. **Attendance System** - 考勤管理系统
2. **Atelier** - 工作室管理系统
3. **Nocturne** - 夜间模式主题系统

#### Documentation
- README.md：项目概览、快速开始
- 架构文档：系统设计、工作流程
- API文档：Agent接口、工具函数

#### Development Tools
- TypeScript配置
- ESLint配置
- Prettier配置
- Git hooks（pre-commit）

---

## [0.0.1] - 2026-06-01

### Added - 原型版本

- 基础Planner Agent实现
- 简单的requirement解析
- 命令行界面
- 基础测试用例

---

## 版本规划

### [0.2.0] - 预计2026-08-25（Phase 1验证完成后）

#### 目标
- Phase 1改进完整验证
- 验证结果可视化
- 实际指标达到预期目标

#### 待完成
- [ ] 执行24-case验证（等待API恢复）
- [ ] 分析验证结果
- [ ] 实现可视化界面
- [ ] 更新文档（预期→实际）

### [0.3.0] - 预计2026-09-05（Phase 2完成后）

#### 目标
- Phase 2 P0改进（发现分级、Prompt优化）
- 质量回升（覆盖率、约束满足率）
- 效率进一步提升

#### 待完成
- [ ] 实现发现分级机制
- [ ] 强化Reviewer Prompt
- [ ] 最小化修订范围
- [ ] Phase 2验证

### [1.0.0] - 预计2026-10-01（生产就绪）

#### 目标
- 生产环境部署
- 完整文档
- 用户手册
- 性能优化

#### 待完成
- [ ] PostgreSQL生产部署
- [ ] 性能压力测试
- [ ] 安全审计
- [ ] 用户培训材料

---

## 贡献指南

查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何为AgentForge做出贡献。

## 许可证

MIT License - 查看 [LICENSE](./LICENSE) 文件了解详情。
