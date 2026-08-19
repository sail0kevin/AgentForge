# AgentForge 快速上手指南

## 5分钟体验多Agent协作

### 前置条件

- Node.js 18+ (推荐LTS版本)
- Git
- （可选）Ollama或其他LLM API

---

## 方式一：本地确定性演示（最简单，无需API Key）

这种方式使用预设的固定响应，可以完整体验工作流，但不会真正调用LLM。

### 🚀 一键启动（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/sail0kevin/AgentForge.git
cd AgentForge

# 2. 运行启动脚本
# Windows
quick-start.bat

# Mac/Linux
./quick-start.sh
```

脚本会自动完成依赖安装、配置文件创建、数据库初始化并启动服务。完成后浏览器会自动打开 http://localhost:3000

### 手动安装（可选）

如果你想手动控制每一步：

```bash
# 1. 克隆仓库
git clone https://github.com/sail0kevin/AgentForge.git
cd AgentForge

# 2. 安装依赖
npm ci

# 3. 配置环境
# Windows PowerShell
Copy-Item .env.example .env
# Linux/Mac
cp .env.example .env

# 4. 初始化数据库
npm run db:generate
npm run db:migrate

# 5. 启动服务
npm run dev
```

浏览器访问 http://localhost:3000

### 6. 体验功能

1. **新建需求** → 输入任意需求描述
2. **观察工作流** → 看到需求分析、补充问题、执行计划
3. **对比候选方案** → Delivery优先 vs Quality优先
4. **查看评审结果** → Reviewer的交叉评审意见
5. **查看报告** → 三套Product/UI实施报告

**确定性模式的限制**：
- 输出是预设的固定内容
- 无法处理自定义需求
- 但可以完整体验整个工作流程

---

## 方式二：接入真实LLM（推荐）

### 选项A：使用Ollama（完全免费，本地运行）

#### 1. 安装Ollama

访问 https://ollama.com/download 下载安装。

#### 2. 拉取模型

```bash
# 推荐使用qwen2.5-coder（7B，质量好，速度快）
ollama pull qwen2.5-coder:7b

# 或者使用deepseek-coder-v2（更大，质量更好）
ollama pull deepseek-coder-v2:16b
```

#### 3. 修改 .env

```bash
OLLAMA_BASE_URL="http://localhost:11434"
```

#### 4. 在AgentForge中配置

启动AgentForge后：
1. 点击右上角 **设置**
2. 选择 **Provider: Ollama**
3. 选择你拉取的模型（如 `qwen2.5-coder:7b`）
4. 保存

#### 5. 开始使用

创建新需求，输入真实的产品描述，观察多Agent协作生成方案。

---

### 选项B：使用OpenAI/Anthropic/DeepSeek（付费，质量最好）

#### 1. 获取API Key

- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/
- **DeepSeek**: https://platform.deepseek.com/

#### 2. 在AgentForge中配置

启动AgentForge后：
1. 点击右上角 **设置**
2. 选择 **Provider**（如 OpenAI）
3. 填写 **API Key**
4. 选择 **模型**（推荐 `gpt-4o` 或 `claude-sonnet-3.5`）
5. 保存

#### 3. 开始使用

创建新需求，输入真实的产品描述，观察多Agent协作生成方案。

**成本参考**（一个中等复杂度需求）：
- GPT-4o: ~$0.20 - $0.40
- Claude Sonnet 3.5: ~$0.15 - $0.30
- DeepSeek: ~$0.02 - $0.05

---

## 推荐体验流程

### 第1步：体验基础流程（5分钟）

1. 新建需求，输入：
   ```
   开发一个企业员工考勤管理系统，支持打卡、请假、加班管理
   ```

2. 观察工作流自动运行：
   - Planner分析需求
   - Proposer生成两个候选方案（Delivery优先 vs Quality优先）
   - Reviewer交叉评审
   - Evaluator综合决策
   - Reporter生成三套报告

### 第2步：对比候选方案（5分钟）

在报告中查看：
- **Delivery候选**：关注快速交付，MVP优先
- **Quality候选**：关注工程质量，可扩展性
- 对比两个方案的架构决策差异

###第3步：查看评审意见（5分钟）

在Finding中查看Reviewer指出的：
- 遗漏的功能点
- 架构风险
- 实施优先级建议

### 第4步：查看最终报告（10分钟）

报告包含：
- **产品定位**：目标用户、核心价值
- **架构设计**：技术选型、模块划分
- **UI/UX方向**：视觉风格、交互模式
- **实施路径**：MVP分阶段、里程碑
- **风险管理**：技术风险、应对措施
- **验收标准**：功能、性能、安全

### 第5步：查看报告映射案例（5分钟）

访问已实现的三个页面：
- http://localhost:3000/generated/attendance （企业考勤）
- http://localhost:3000/generated/atelier （数字艺术展览）
- http://localhost:3000/generated/nocturne （数字聆听室）

这些页面是根据AgentForge报告实现的，展示报告如何指导真实开发。

---

## 查看多Agent价值验证（5分钟）

查看我们的实验数据：

1. **统计总结**：`docs/multi-agent-validation/statistical-summary.md`
   - 24个真实场景对比
   - Multi-Agent vs Single-Agent量化数据
   - ROI分析

2. **深度案例**：`docs/multi-agent-validation/case-07-showcase.md`
   - UGC内容审核系统完整对比
   - Single-Agent: 5,000字技术方案
   - Multi-Agent: 10,000字执行方案

3. **简历指南**：`docs/multi-agent-validation/resume-highlights.md`
   - 如何在简历中描述这个项目
   - 面试话术模板
   - 关键数字速查表

---

## 常见问题

### Q1: 启动失败，提示端口被占用？

**解决**：修改端口
```bash
# 修改 package.json 中的 dev 脚本
"dev": "next dev -p 3001"
```

### Q2: Ollama拉取模型很慢？

**解决**：使用国内镜像（如果可用）或选择更小的模型：
```bash
ollama pull qwen2.5-coder:3b  # 更小的版本
```

### Q3: 生成的方案质量不好？

**原因**：
- 确定性模式使用的是固定响应
- Ollama的小模型能力有限

**解决**：
- 使用更大的模型（如deepseek-coder-v2:16b）
- 或使用商业API（GPT-4o、Claude Sonnet 3.5）

### Q4: 如何重置数据库？

```bash
rm prisma/dev.db
npm run db:migrate
```

### Q5: 可以在Windows上运行吗？

✅ 可以！所有命令都支持Windows。PowerShell用户注意：
- 复制文件用 `Copy-Item` 而非 `cp`
- 其他命令保持一致

---

## 下一步

### 如果你想深入了解技术实现：

1. 阅读 [当前运行架构](../2026-08-01%20-%20current-runtime-architecture%20-%20当前运行架构.md)
2. 阅读 [Product/UI实施包说明](../2026-08-04%20-%20product-ui-implementation-manifest%20-%20AgentForge-implementation-manifest.md)
3. 查看源码：
   - `src/lib/workflow/` - LangGraph工作流
   - `src/lib/agents/` - 各个Agent实现
   - `src/lib/planner/` - 需求分析
   - `src/lib/review/` - 评审机制

### 如果你想用于简历/面试：

1. 阅读 [简历亮点提炼](./resume-highlights.md)
2. 阅读 [使用指南](./README.md)
3. 准备面试话术（30秒电梯演讲）

### 如果你想贡献代码：

1. Fork仓库
2. 创建feature分支
3. 运行测试：`npm test`
4. 提交PR

---

## 获取帮助

- **GitHub Issues**: https://github.com/sail0kevin/AgentForge/issues
- **文档索引**: [docs/2026-08-01 - document-index - 文档索引.md](../2026-08-01%20-%20document-index%20-%20文档索引.md)
- **技术细节**: 查看 `docs/` 目录下的完整文档

---

祝你体验愉快！如果觉得项目有帮助，欢迎给个⭐️
