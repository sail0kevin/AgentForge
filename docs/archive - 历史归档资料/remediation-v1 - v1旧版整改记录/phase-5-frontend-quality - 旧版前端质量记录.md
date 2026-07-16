# Phase 5：前端拆分、工程质量和交付形态
<!-- 文件名：phase-5-frontend-quality - 旧版前端质量记录 -->
<!-- 所属目录：remediation-v1 - v1旧版整改记录 -->

阶段状态：待处理  
最后更新：2026-07-15  
对应问题：P2-1、P2-2、P2-3、P2-4

## 1. 阶段目标

在核心运行、RAG 和 Tool 语义稳定后收口前端结构、API 一致性、工程检查和对外交付，不在此阶段引入新的自主 Agent 功能。

## 2. P2-1：拆分前端主组件

`workspace-app.tsx` 当前约 1578 行，同时管理多个页面、SSE、历史、知识和设置。

计划拆分：

```text
components/workspace/
  chat/
  agents/
  knowledge/
  dashboard/
  settings/
hooks/
  use-manual-run-stream.ts
  use-persisted-messages.ts
  use-knowledge-library.ts
```

要求：

- [ ] 页面组件只接收必要状态；
- [ ] SSE 解码和取消逻辑集中；
- [ ] 删除旧 localStorage 消息函数；
- [ ] 删除乱码注释和未使用状态；
- [ ] 错误、loading 和空状态一致；
- [ ] 保持现有用户行为不回退。

## 3. P2-2：Workspace 创建契约

`workspaceCreateSchema` 接受 `agentIds`，API 当前静默忽略。

选择之一：

1. 在同一事务中创建 WorkspaceAgent，并校验全部 Agent 归属；或
2. 从创建 Schema 和公开 API 契约移除 `agentIds`。

不能继续保留“请求成功但字段无效”的行为。

## 4. P2-3：Electron 交付决策

当前 Electron 依赖系统 `npm start`、固定端口和应用目录，不能视为已完成安装包。

只有确认桌面分发是产品目标后才执行：

- [ ] 内置可启动的服务进程，不依赖用户安装 npm；
- [ ] 使用受控动态端口并校验健康响应身份；
- [ ] SQLite 与日志写入 `app.getPath("userData")`；
- [ ] 处理服务退出、窗口重开和异常恢复；
- [ ] Windows 干净机器安装与卸载测试；
- [ ] 安装包不包含 `.env`、开发数据库或个人数据。

若不做桌面交付，应删除容易造成误解的打包声明，保留 Web MVP 定位。

## 5. P2-4：单 Agent/双 Agent 价值评测

建立 10～20 个固定需求样例，对比：

- 单 Agent；
- 当前双 Agent；
- 双 Agent + RAG；
- 后续可能的交叉评审。

记录需求覆盖、可行性、可测试性、风险识别、人工修改量、延迟和 Token。没有明显收益时，不增加更多 Agent 角色。

## 6. 工程质量验收

```bash
npm run lint
npm run test:unit
npm run test:e2e:core
npm run build
```

- [ ] 全量 lint 无错误；
- [ ] 单元测试通过；
- [ ] 核心 E2E 使用隔离数据库通过；
- [ ] 构建 warning 已解决或有明确接受理由；
- [ ] 正式截图不含密钥、本机路径和测试数据；
- [ ] README、当前状态和公开报告描述一致。

## 7. 执行记录

| 时间 | 问题 ID | 动作 | 验证 | 状态 |
|---|---|---|---|---|
| 2026-07-15 | P2-1 | 记录当前组件规模和 Lint 基线 | Lint：8 错误、12 警告 | 已完成 |

## 8. 阶段完成条件

- 前端主要模块单一职责；
- API 不再静默忽略请求字段；
- 工程检查全部通过；
- Web/Electron 产品形态有明确决策；
- 多 Agent 扩展由评测证据支持。
