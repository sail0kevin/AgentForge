# 1 分钟演示

## 准备

```bash
ollama pull qwen2.5:3b
ollama serve
npm run dev
```

打开 `http://localhost:3000`。

## 演示流程

1. 在“创建智能体”页展示两个默认 Agent：需求分析师、开发报告负责人。
2. 在“对话空间”输入：`请为大学生设计一个 AI 学习助手，并生成开发报告。`
3. 展示需求分析师先输出需求、限制和风险。
4. 展示开发报告负责人读取前序结果后，输出方案、任务、测试和下一步。
5. 打开任一 Agent 编辑页，展示 API URL、模型名和 API Key 掩码；旧 Key 不会回显。
6. 刷新页面，展示聊天历史仍存在；清空对话后刷新，旧消息不会复活。

## 验收命令

```bash
npm run test:e2e:core
npm run build
```

> 当前截图是本地验证产物，默认不提交。公开展示时建议重新截取 1～2 张不含个人信息和密钥的正式图片，放入 `docs/screenshots/` 后在 README 引用。
