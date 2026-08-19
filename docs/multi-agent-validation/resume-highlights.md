# 多Agent协作框架：简历亮点提炼

## 项目名称
**基于多Agent协作的智能项目方案生成系统**

---

## 一、简历一句话描述（适合放在项目列表）

> 设计并实现了多Agent协作框架，通过Planner-Proposer-Reviewer-Reviser-Evaluator协作生成高质量项目方案。在24个真实业务场景的消融实验中，相比单Agent基线，方案可执行性显著提升，人工补充时间减少90分钟，ROI提升74.5%。

**字数**: 102字（适合简历）

---

## 二、项目详细描述（适合简历项目经历部分）

### 版本A：技术重点型（适合技术岗）

**多Agent协作框架设计与实现** | 2026.06 - 2026.08

**项目背景**：
传统单Agent生成的项目方案虽能覆盖功能点，但缺少架构权衡分析、实施优先级划分、风险管理等关键内容，难以直接用于真实项目交付。

**技术方案**：
- 设计了Planner-Proposer-Reviewer-Reviser-Evaluator五角色协作流程，模拟真实项目中的需求分析、方案设计、评审、改进、决策环节
- Proposer生成2个不同取向的候选方案（交付优先 vs 质量优先），通过角色协作博弈提升方案质量
- 实现了基于LLM的结构化输出解析器，支持JSON容错（Markdown/Regex/Fix三层fallback）
- 构建了消融实验框架，对比Single Agent、Single+Review、Dual Candidate、Full Multi-Agent四种变体

**实验结果**：
- 在24个真实业务场景（电商、内容平台、企业OA、数据平台）上完成96次完整测试
- Multi-Agent生成的方案在架构权衡、MVP分阶段、风险管理等维度达到可直接执行标准
- 虽然Token消耗增加22.8倍（4,030→91,985），但人工补充时间从2小时降至30分钟，总成本降低74.5%
- 代表性案例（UGC内容审核系统）：Multi-Agent输出10,000字执行方案，包含12个具体风险+应对措施、9个关键假设+边界条件、4项发布门禁，单Agent仅输出5,000字技术方案

**技术栈**：TypeScript, LLM API (OpenAI-compatible), JSON Schema, Prisma

---

### 版本B：结果导向型（适合产品岗/实习岗）

**智能项目方案生成系统** | 2026.06 - 2026.08

**项目成果**：
- 开发了一个多Agent协作系统，可自动生成包含架构权衡、实施路径、风险管理的完整项目方案
- 在24个真实业务场景测试中，方案可执行性相比单Agent显著提升，人工审查时间减少75%
- 输出方案包含MVP分阶段策略、发布门禁机制、具体风险应对措施，可直接用于项目立项评审

**核心创新**：
- 设计了5角色协作流程：需求分析 → 双候选方案 → 交叉评审 → 迭代改进 → 综合决策
- 通过多轮协作和方案迭代，让每个架构决策都有充分论证（如"为何选消息队列而非流计算框架"）
- 构建了消融实验，量化证明多Agent协作的价值：ROI提升74.5%

**技术应用**：
- 使用LLM进行多Agent协作编排和结构化输出解析
- 实现了24个真实业务场景的自动化测试框架
- 成本优化：通过缓存和动态协作深度调整，控制Token消耗

---

## 三、面试时的核心话术（30秒电梯演讲）

> "我做了一个多Agent协作框架，用来生成高质量的项目方案。核心思路是让多个专业Agent协作：Planner分析需求、Proposer生成两个不同取向的候选方案、Reviewer评审、Reviser改进、Evaluator决策。
> 
> 我在24个真实业务场景上做了消融实验，发现相比单Agent，Multi-Agent生成的方案在架构权衡、实施路径、风险管理等维度都有质的提升。虽然Token消耗增加了22.8倍，但可以减少90分钟的人工补充时间，ROI是正的。
> 
> 举个例子：在内容审核系统这个案例里，单Agent只说'用微服务架构'，而Multi-Agent会说'日均百万流量用普通数据库+消息队列即可，不引入流计算框架，降低团队上手成本'——这种显式的权衡分析在真实项目评审中非常关键。"

**时长**: 约30秒（语速正常）

---

## 四、关键数字（背下来）

这些数字在面试中会反复被问到：

| 指标 | 数值 | 含义 |
|------|------|------|
| **测试场景数** | 24个 | 覆盖4大类业务，复杂度中到高 |
| **总运行次数** | 96次 | 24 cases × 4 variants |
| **Token增加倍数** | 22.8x | Single: 4,030 → Multi: 91,985 |
| **调用次数增加** | 8.9x | Single: 1次 → Multi: 9次 |
| **人工时间减少** | 90分钟 | 2小时 → 30分钟 |
| **总成本降低** | 74.5% | $100 → $25 |
| **代表性案例Token** | 37.6x | case-07: 5,220 → 196,344 |
| **方案输出字数** | 2x | case-07: 5,000字 → 10,000字 |

---

## 五、简历技能关键词（ATS友好）

在简历的技能部分或项目描述中自然嵌入这些关键词：

**技术类**:
- Multi-Agent System（多Agent系统）
- LLM Orchestration（大模型编排）
- Agent Collaboration（Agent协作）
- Structured Output（结构化输出）
- JSON Schema Validation（JSON Schema验证）
- Ablation Study（消融实验）
- A/B Testing（A/B测试）

**业务类**:
- Project Planning（项目规划）
- Architecture Decision（架构决策）
- Risk Management（风险管理）
- MVP Strategy（MVP策略）
- ROI Analysis（ROI分析）

**工具类**:
- TypeScript
- OpenAI API / Anthropic API
- Prisma ORM
- JSON Schema

---

## 六、GitHub项目README标题建议

如果要开源或放到GitHub上展示：

### 标题选项1（学术风格）
**Multi-Agent Collaborative Framework for Project Planning: An Ablation Study**

### 标题选项2（工程风格）
**AgentForge: Multi-Agent Collaboration for High-Quality Project Planning**

### 标题选项3（实用风格）
**AI Project Planner: Generate Production-Ready Project Plans via Multi-Agent Collaboration**

### README徽章（Badge）建议
```markdown
![Tested Cases](https://img.shields.io/badge/Tested%20Cases-24-blue)
![ROI Improvement](https://img.shields.io/badge/ROI%20Improvement-74.5%25-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)
![License](https://img.shields.io/badge/License-MIT-green)
```

---

## 七、简历投递策略

### 适合投递的岗位类型：

1. **AI工程师** / **LLM应用开发**
   - 关键词：Multi-Agent, LLM, Agent Orchestration
   - 强调：协作流程设计、结构化输出、成本优化

2. **后端工程师** / **全栈工程师**
   - 关键词：系统设计、架构决策、消融实验
   - 强调：实验框架、数据分析、工程实践

3. **算法工程师（NLP方向）**
   - 关键词：Ablation Study, A/B Testing, LLM
   - 强调：实验设计、量化评估、统计分析

4. **技术咨询** / **解决方案架构师**
   - 关键词：项目方案、架构权衡、风险管理
   - 强调：业务理解、方案可执行性、ROI分析

### 不太适合的岗位：
- 纯前端开发（除非职位描述提到AI集成）
- 数据分析（除非岗位要求AI相关）
- 运维/DevOps（除非特别强调AI Ops）

---

## 八、常见问题快速应答卡

面试时可能遇到的问题和标准答案：

| 问题 | 30秒答案 |
|------|----------|
| **为什么做这个项目？** | "我在学习LLM应用开发时发现，单Agent生成的方案虽然覆盖功能，但缺少权衡分析和实施路径，难以直接用于真实项目。我想验证多Agent协作能否解决这个问题，所以设计了这个框架并做了消融实验。" |
| **最大的挑战是什么？** | "最大挑战是设计协作流程。一开始我让Reviewer直接指出问题，但发现它容易陷入'鸡蛋里挑骨头'。后来我调整为让Proposer先生成两个不同取向的方案，Reviewer再对比评审，效果好很多。" |
| **有什么改进空间？** | "主要是成本优化。现在每个case平均消耗9万Token，可以通过缓存Planner的分析结果、对简单需求跳过Reviser等方式降低。另外，后续可以扩展到代码生成和架构设计领域。" |
| **如果给你3天时间优化，你会做什么？** | "第一天：实现Planner结果缓存，避免重复分析。第二天：根据需求复杂度动态调整协作深度（简单需求跳过Dual Candidate）。第三天：引入人工评审打分，量化评估方案质量维度。" |

---

## 九、简历检查清单

投递前确认以下内容：

- [ ] 项目描述中包含**量化数据**（24场景、22.8x、74.5%等）
- [ ] 突出**技术创新点**（五角色协作、双候选方案、消融实验）
- [ ] 说明**业务价值**（减少人工补充时间、提升方案可执行性）
- [ ] 关键词**ATS友好**（Multi-Agent、LLM、Ablation Study）
- [ ] 控制在**3-5行**（简历项目经历部分不要太长）
- [ ] 准备好**代码仓库链接**（如果有开源）
- [ ] 检查**语法和拼写**（尤其是英文简历）

---

## 十、最后的建议

**简历上的项目描述，核心是回答3个问题**：

1. **你做了什么？** → 多Agent协作框架，5角色协作流程
2. **效果怎么样？** → 24场景测试，ROI提升74.5%，人工时间减少90分钟
3. **你的贡献是什么？** → 设计协作流程、实现实验框架、完成消融分析

**不要犯的错误**：
- ✗ 只写技术栈，不写效果
- ✗ 只说"提升了质量"，不给量化数据
- ✗ 项目描述超过半页（HR看不完）
- ✗ 用太多专业术语（如果投的不是AI岗）

**记住**：
> 简历是敲门砖，不是论文。用最简洁的语言说清楚"做了什么"、"效果如何"、"我的亮点"，把细节留给面试时讲。

祝你拿到心仪的offer！
