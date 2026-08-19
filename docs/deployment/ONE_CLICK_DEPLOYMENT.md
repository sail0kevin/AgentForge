# AgentForge 一键部署方案

本文档介绍 AgentForge 的多种快速部署方案，从最简单到最完整。

## 🚀 方案对比

| 方案 | 用户门槛 | 启动时间 | 适用场景 |
|------|---------|---------|---------|
| **一键脚本** | 需要 Node.js + Git | 2-5分钟 | 本地开发、学习体验 ✅ 已实现 |
| Docker Compose | 需要 Docker | 1-2分钟 | 跨平台部署、团队协作 |
| 在线演示 | 浏览器即可 | 即时访问 | 快速体验、无需安装 |
| 桌面应用 | 下载即用 | 双击启动 | 非技术用户、离线使用 |

---

## ✅ 方案1：一键启动脚本（已实现）

### 特点
- ✅ 自动检测依赖
- ✅ 自动安装 npm 包
- ✅ 自动配置环境
- ✅ 自动初始化数据库
- ✅ 自动打开浏览器

### 使用方法

```bash
# Windows
git clone https://github.com/sail0kevin/AgentForge.git
cd AgentForge
quick-start.bat

# Mac/Linux
git clone https://github.com/sail0kevin/AgentForge.git
cd AgentForge
./quick-start.sh
```

### 脚本做了什么

1. **检查环境**：验证 Node.js 是否已安装
2. **安装依赖**：首次运行时执行 `npm ci`
3. **创建配置**：从 `.env.example` 复制 `.env`
4. **初始化数据库**：自动运行 `db:generate` 和 `db:migrate`
5. **启动服务**：运行 `npm run dev`
6. **打开浏览器**：自动访问 http://localhost:3000

### 适用人群
- 有基本命令行经验的开发者
- 想要本地运行和自定义配置的用户
- 学习和研究 AgentForge 源码的用户

---

## 🐳 方案2：Docker Compose（计划中）

### 特点
- 零依赖，只需要 Docker
- 跨平台一致性
- 支持生产环境部署
- 一键启动/停止

### 使用方法（计划）

```bash
git clone https://github.com/sail0kevin/AgentForge.git
cd AgentForge
docker-compose up
```

### 技术实现

需要创建 `docker-compose.yml`：

```yaml
version: '3.8'
services:
  agentforge:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:./prisma/dev.db
      - APP_AUTH_MODE=local
    volumes:
      - ./prisma:/app/prisma
      - agentforge_data:/app/data
volumes:
  agentforge_data:
```

### 优势
- 不需要在主机安装 Node.js
- 环境隔离，不污染系统
- 适合 CI/CD 流程

---

## 🌐 方案3：在线演示（计划中）

### 特点
- 浏览器直接访问
- 无需任何安装
- 支持分享链接
- 快速体验核心功能

### 部署平台选项

#### Vercel（推荐）
- **优势**：免费额度充足，部署简单，自动 HTTPS
- **限制**：Serverless 函数有 10 秒超时限制
- **适用**：演示确定性模式（预设响应）

#### Railway / Render
- **优势**：支持长时间运行的进程
- **限制**：免费额度较少
- **适用**：接入真实 LLM 的演示

### 部署步骤（Vercel）

1. Fork AgentForge 仓库
2. 在 Vercel 导入项目
3. 配置环境变量：
   ```
   DATABASE_URL=file:./prisma/dev.db
   APP_AUTH_MODE=local
   ```
4. 部署完成后访问 `https://your-project.vercel.app`

### 注意事项
- 在线演示建议使用确定性模式（不调用真实 LLM）
- 如需接入 LLM，需要配置 API Key 环境变量
- 考虑添加访问限制（如密码保护）

---

## 💻 方案4：桌面应用（计划中）

### 特点
- 打包成独立可执行文件
- 双击即可运行
- 无需命令行操作
- 适合非技术用户

### 技术实现

使用 Electron 打包（`package.json` 已配置）：

```bash
# 构建 Windows 应用
npm run electron:build:win

# 构建 Mac 应用
npm run electron:build:mac

# 构建 Linux 应用
npm run electron:build:linux
```

### 产物
- **Windows**：`.exe` 安装包
- **Mac**：`.dmg` 安装包
- **Linux**：`.AppImage` 可执行文件

### 用户体验
1. 下载对应平台的安装包
2. 双击安装/运行
3. 应用自动启动服务和浏览器窗口
4. 无需任何配置

### 优势
- 最低的使用门槛
- 离线运行（除非接入外部 LLM API）
- 适合分发给非技术用户

---

## 🎯 推荐方案

根据不同用户群体的推荐：

| 用户类型 | 推荐方案 | 原因 |
|---------|---------|------|
| **开发者** | 一键脚本 | 可以修改代码，灵活配置 |
| **团队协作** | Docker Compose | 环境一致，易于分享 |
| **快速体验** | 在线演示 | 零安装，立即访问 |
| **非技术用户** | 桌面应用 | 最简单，双击即用 |

---

## 📋 实现优先级

基于用户反馈和实现成本，建议的开发顺序：

### 第1阶段：已完成 ✅
- [x] 一键启动脚本（Windows + Mac/Linux）

### 第2阶段：高优先级
- [ ] 在线演示（Vercel 部署）
- [ ] Docker Compose 配置

### 第3阶段：中优先级
- [ ] Electron 桌面应用打包
- [ ] 发布到 GitHub Releases

### 第4阶段：可选增强
- [ ] 自动更新机制
- [ ] 多语言支持（英文界面）
- [ ] 官方文档网站

---

## 🛠️ 技术细节

### 一键脚本实现要点

**Windows (quick-start.bat)**
- 使用 `chcp 65001` 支持中文输出
- 用 `where` 检测命令是否存在
- 用 `if not exist` 检查文件/目录
- 用 `start` 打开浏览器

**Linux/Mac (quick-start.sh)**
- 使用 `command -v` 检测命令
- 用 `[ ! -f ]` 和 `[ ! -d ]` 检查文件/目录
- 根据平台用 `open` 或 `xdg-open` 打开浏览器

### Docker 注意事项

- 需要处理 SQLite 文件权限
- 考虑使用 PostgreSQL 作为数据库
- 支持挂载 `.env` 文件
- 提供健康检查端点

### 在线演示注意事项

- Serverless 函数有执行时间限制
- 需要持久化存储方案（如 Vercel Blob）
- 考虑添加访问频率限制
- 使用确定性模式避免 API 费用

---

## 📚 相关文档

- [快速上手指南](../multi-agent-validation/QUICKSTART.md)
- [本地演示指南](<../2026-07-19 - local-demo-guide - 本地演示指南.md>)
- [当前运行架构](<../2026-08-01 - current-runtime-architecture - 当前运行架构.md>)

---

## 🤝 贡献

如果你实现了其他部署方案，欢迎提交 PR：

1. Fork 本仓库
2. 创建 feature 分支
3. 提交你的部署配置
4. 更新本文档
5. 发起 Pull Request

---

**最后更新**：2026-08-19
