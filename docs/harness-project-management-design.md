# Hermes Desktop 项目管理 + Harness-Kit 可视化 — 产品设计文档

> 日期：2026-05-29
> 作者：Hermes Agent (AI)
> 版本：v1.0

---

## 目录

1. [背景与动机](#1-背景与动机)
2. [竞品分析](#2-竞品分析)
3. [Hermes 的 Hook 能力调研](#3-hermes-的-hook-能力调研)
4. [Harness-Kit 整合分析](#4-harness-kit-整合分析)
5. [整体架构设计](#5-整体架构设计)
6. [产品设计：项目管理页](#6-产品设计项目管理页)
7. [产品设计：Harness 可视化面板](#7-产品设计-harness-可视化面板)
8. [数据模型](#8-数据模型)
9. [ICO 框架分析](#9-ico-框架分析)
10. [分阶段路线图](#10-分阶段路线图)
11. [与现有功能的协同效应](#11-与现有功能的协同效应)
12. [风险评估](#12-风险评估)

---

## 1. 背景与动机

### 1.1 当前痛点

Hermes Desktop 的会话管理是**扁平的**——所有对话在左侧 Sidebar 里平铺，按时间分组（24小时内 / 3天内 / 更早）。没有「项目」层级：

- 用户做多个项目时只能靠记忆区分会话
- 没有工作目录级联能力
- 没有项目级配置（AGENTS.md / CLAUDE.md 的自动加载）
- Phase 0/1 的功能已打磨完毕，需要 Phase 3 的新功能

### 1.2 用户诉求

> "想在当前项目加个项目管理的功能，参考 Codex 桌面版和 Claude 桌面版的项目管理，包括项目目录、项目名称、介绍、项目相关文件，左边导航加项目管理的图标，点击进入项目管理界面，可以查看已有的项目列表，点击进入项目，可以在项目里面发起对话。"

同时希望结合已有项目 `harness-kit-v2` 的 Hook 系统和状态文件体系，**让项目管理可视化**。

---

## 2. 竞品分析

### 2.1 Codex Desktop（OpenAI）

| 维度 | 做法 |
|------|------|
| **项目定义** | 项目 = 文件夹。选择一个本地目录就创建一个项目 |
| **导航** | 左侧 NavBar 切换「聊天」和「项目」 |
| **项目列表** | 网格/列表视图，展示项目名称、路径、最近活动 |
| **项目内对话** | 所有对话自动读取项目目录中的文件作为上下文 |
| **文件感知** | 自动索引项目文件，对话中可 `@filename` 引用 |
| **配置** | `.codex/config.yaml` 定义项目级指令 |

**关键交互**：打开文件夹 → 自动识别项目结构 → 新对话默认带上项目上下文

### 2.2 Claude Desktop / Claude Code（Anthropic）

| 维度 | 做法 |
|------|------|
| **项目定义** | 项目 = 工作目录 + AGENTS.md / CLAUDE.md |
| **导航** | Claude.ai 有 Projects 概念；Claude Code 以启动目录为项目 |
| **项目列表** | Claude.ai 中 Projects 页面显示所有项目 |
| **项目内对话** | `claude` 命令启动的会话自动关联当前工作目录 |
| **文件上下文** | AGENTS.md / CLAUDE.md 定义项目级指令；`/add-files` 手动添加 |
| **配置** | 项目根目录下的这些文件定义项目级指令和上下文 |

**关键交互**：在目录中启动 Claude → 自动加载 AGENTS.md → 所有对话共享项目知识

### 2.3 Hermes Desktop 的定位

综合两者优点：

| 继承自 | 具体设计 |
|--------|---------|
| **Codex 的 UI 交互** | 项目列表卡片网格、项目内会话列表、左侧 NavBar 入口 |
| **Claude 的文件上下文** | 项目目录自动成为 hermes 进程的工作目录，AGENTS.md 自动加载 |
| **Harness-Kit 的状态体系** | `.harness/` 状态文件作为项目级上下文，显示 Sprint/Feature/Decision |

---

## 3. Hermes 的 Hook 能力调研

### 3.1 Hermes Agent 的核心架构

当前通信模型是**一次性进程**：

```
用户发消息 → spawn "hermes chat -q <msg> --resume <id>" → 读 stdout → 进程退出
```

### 3.2 Hermes 现有的「Hook 等价物」

| 能力 | 类型 | 是否等价于 Hook |
|------|------|:---:|
| **Webhooks** (`hermes webhook subscribe`) | HTTP 入站 | ❌ 不是 Agent 生命周期事件 |
| **Cron Jobs** (`hermes cron create`) | 定时触发 | ❌ 不是事件驱动 |
| **Shell Hooks Allowlist** (`~/.hermes/shell-hooks-allowlist.json`) | 白名单 | ❌ 不是 Hook 脚本系统 |
| **Plugin 系统** (`hermes plugins`) | 扩展 | ❌ 不暴露 Session 生命周期事件 |
| **Tauri 事件系统** (`listen/emit`) | 进程间通信 | ✅ 可在 Desktop 层模拟 Hook 行为 |
| **Tauri 进程生命周期** | 子进程管理 | ✅ 可监控 hermes 进程的启动/退出 |

### 3.3 关键结论：两层面的 Hook

| 层面 | 是否有 Hook | 说明 |
|------|:--------:|------|
| **Agent 运行时层**（hermes CLI） | ❌ | 没有 SessionStart/PreToolUse/PostToolUse/Stop 事件 |
| **Desktop 客户端层**（Tauri） | ✅ | 可通过 Tauri 事件 + 进程管理模拟类似行为 |

这意味着：**harness-kit 的 Hook 脚本不能直接在 hermes 中运行**，但 Hermes Desktop 可以通过读取 `.harness/` 状态文件来「感知」Hook 的执行结果。

---

## 4. Harness-Kit 整合分析

### 4.1 Harness-Kit 的 Hook 运行在什么层面

Harness-Kit 的 Hook 系统是为 **Claude Code / Cursor / Codex CLI** 设计的。

以 Claude Code 的配置为例（`template/.claude/settings.json`）：

```json
{
  "hooks": {
    "SessionStart": [{ "command": "bash .harness/hooks/session-start.sh", "additionalContext": true }],
    "PreToolUse":  [{ "matcher": "Bash", "command": "bash .harness/hooks/guard-dangerous.sh" }],
    "PostToolUse": [{ "matcher": "Write", "command": "bash .harness/hooks/post-write.sh", "async": true }],
    "Stop":        [{ "command": "bash .harness/hooks/session-end.sh", "additionalContext": true }]
  }
}
```

这些 Hook 是透过 **Claude Code 的原生 Hook API** 触发的，不是独立的进程管理机制。

### 4.2 对照：支持 Harness-Kit 的工具

| AI 工具 | 强制执行方式 | 运行层面 |
|---------|-------------|---------|
| Claude Code | 原生 Hook（`.claude/settings.json`） | CLI 进程 |
| Cursor | 原生 Hook（`.cursor/hooks.json`） | IDE 进程 |
| Codex CLI | 原生 Hook（`.codex/hooks.json`） | CLI 进程 |
| OpenCode | Plugin（`.opencode/plugin/`） | CLI 进程 |
| **Hermes Agent** | **无原生 Hook** | — |

### 4.3 整合点：共享状态文件

无论 Hook 跑在哪个工具上，最终操作的都是同一套状态文件：

```
.harness/
├── state/
│   ├── features.json           ← 功能完成合约
│   └── current-sprint.md       ← 当前 Sprint 目标
├── registry/
│   ├── _index.md               ← 决策索引
│   ├── decisions/              ← 架构决策记录 (ADR)
│   └── sessions/               ← Session 摘要
└── product/
    └── backlog.md              ← 需求池
```

**整合的核心思想**：

> **Harness-Kit Hook（在 Claude Code/Codex 中运行）← 读写 → `.harness/` 状态文件 ← 读 → Hermes Desktop（可视化展示）**

### 4.4 双向桥接架构

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌─────────────────────┐         ┌─────────────────────────┐ │
│  │ Claude Code / Codex  │         │   Hermes Desktop        │ │
│  │  (强制执行层)         │         │   (可视化层)            │ │
│  │                     │         │                         │ │
│  │ SessionStart Hook   │         │ Project Detail Page:    │ │
│  │ → 注入 registry     │         │ ├ 🎯 Sprint Goal       │ │
│  │ → 加载 sprint       │         │ ├ 📋 Feature Progress  │ │
│  │ → 读 features.json  │         │ ├ 📝 Decision Timeline │ │
│  │                     │         │ ├ 🕐 Session History   │ │
│  │ Stop Hook           │         │ ├ 📚 Backlog           │ │
│  │ → 强制 SESSION_END  │         │                         │ │
│  │ → 写 session 摘要   │         │ 项目内对话:             │ │
│  │ → 更新 features     │         │ ├ 自动继承工作目录       │ │
│  │                     │         │ ├ 加载 AGENTS.md 上下文 │ │
│  │ PreToolUse Hook     │         │ └ 写入 session 摘要     │ │
│  │ → 拦截危险命令      │         │                         │ │
│  └─────────┬───────────┘         └─────────┬───────────────┘ │
│            │                               │                │
│            │   共享状态文件                  │                │
│            └─────── .harness/ ──────────────┘                │
│              ┌──────────────────────────┐                    │
│              │  features.json          │                    │
│              │  current-sprint.md      │                    │
│              │  registry/_index.md     │                    │
│              │  registry/sessions/*    │                    │
│              │  product/backlog.md     │                    │
│              └──────────────────────────┘                    │
│                                                              │
│  Harness-Kit = 机械执行层   │   Desktop = 可观察 + 可操作    │
│  保证 Agent 不跑偏          │   让用户看清全局、可交互        │
│  强制 SESSION_END           │   Sprint 看板 Feature 进度     │
│  拦截危险命令                │   决策时间线 Session 历史      │
│  验证格式完整性              │   Backlog 管理                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.5 各自不可替代的能力

| 能力 | Harness-Kit Hook | Hermes Desktop Project Page |
|------|:---------------:|:--------------------------:|
| 机械执行 SESSION_END | ✅ exit code 2 强制阻断 | ❌ 无法强制 |
| 拦截 `rm -rf /` | ✅ PreToolUse 实时拦截 | ❌ 无法实时拦截 |
| 进度可视化 | ❌ 只能文本输出 | ✅ 进度条、Kanban 看板、时间线 |
| 拖放操作 | ❌ | ✅ 拖放重排序 |
| 多项目总览 | ❌ | ✅ 项目列表全局进度 |
| 编辑 state 文件 | ❌ 只读/追加 | ✅ 内联编辑 |
| features.json 格式校验 | ✅ 自动校验 | ❌ |
| Session 摘要写入 | ✅ Stop Hook | ✅ 可在 Tauri 层实现 |
| 时间线可视化 | ❌ | ✅ 时间线 |

---

## 5. 整体架构设计

### 5.1 项目 = 带 Harness 的工作目录

```
Project {
  id: string             // "proj_a1b2c3"
  name: string           // "Hermes Desktop 开发"
  description: string    // "Tauri 桌面客户端..."
  directory: string      // "/Users/wuguirong/sourceCode/hermes-desktop"
  files: string[]        // ["AGENTS.md", "src/", "design/"]
  created_at: string     // ISO 8601
  updated_at: string     // ISO 8601
}
```

数据存储在 `~/.hermes/desktop/projects.json`。

### 5.2 会话与项目的关系

在 Hermes Desktop 的 Rust 层（`lib.rs`），给 Session 增加可选的 `project_id` 字段：

```rust
pub struct Session {
    pub id: String,
    pub title: String,
    // ...
    pub project_id: Option<String>,  // ← 新增
}
```

通过 **本地映射表** 维护关联：桌面端在 `projects.json` 之外维护 `project → session_ids[]` 的映射。

### 5.3 项目创建流程

```
用户点击「+ 新建项目」
  → 输入名称 + 描述 + 选择工作目录
  → Rust 后端检测目录是否有 .harness/ 目录
     ├── 有 → 自动关联已有 harness 状态
     └── 无 → 显示「安装 harness-kit」引导
  → 写入 ~/.hermes/desktop/projects.json
  → 跳转到项目详情页
```

### 5.4 项目内对话流程

```
用户在项目详情页 → 点击「+ 新对话」
  → ChatPage 以项目目录为工作目录启动 hermes 进程
  → 自动加载项目目录下的 AGENTS.md / CLAUDE.md
  → 可选：加载 .harness/ 状态作为上下文
  → 对话过程中：
    - 工作目录继承项目目录
    - 侧边栏只显示此项目的会话
    - 会话元数据记录 project_id
  → 对话结束时（可选）：
    - Rust 后端写入摘要到 .harness/registry/sessions/
```

---

## 6. 产品设计：项目管理页

### 6.1 左侧导航

```
当前:  对话 | 记忆 | 管理 | 设置
新增:  对话 | 项目 | 记忆 | 管理 | 设置
```

图标用 `folder`（文件夹 SVG），沿用现有 Icon 组件体系。

### 6.2 项目列表页（空状态）

```
┌──────────────────────────────────────────────────┐
│ 项目                                    [+ 新建项目] │
├──────────────────────────────────────────────────┤
│                                                  │
│                📂                                │
│            还没有项目                             │
│   创建一个项目来组织你的工作和对话                   │
│                                                  │
│          [+ 创建第一个项目]                        │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 6.3 项目列表页（有项目）

```
┌──────────────────────────────────────────────────┐
│ 项目                                    [+ 新建项目] │
├──────────────────────────────────────────────────┤
│                                                  │
│ ┌─────────────────┐ ┌─────────────────┐          │
│ │ 📁 Hermes Desk.. │ │ 📁 个人博客       │          │
│ │ Tauri 桌面客户端  │ │ Astro + MDX      │          │
│ │ /Users/.../her.. │ │ /Users/.../blog  │          │
│ └─────────────────┘ └─────────────────┘          │
│                                                  │
│ ┌─────────────────┐                              │
│ │ 📁 数据分析项目   │                              │
│ │ Jupyter + Panda  │                              │
│ │ /Users/.../data  │                              │
│ └─────────────────┘                              │
│                                                  │
└──────────────────────────────────────────────────┘
```

响应式网格，`grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`。

### 6.4 项目详情页（有 Harness 时）

```
┌──────────────────────────────────────────────────────────────┐
│ ← 返回项目列表          📁 Hermes Desktop 开发    [harness]     │
│                         /Users/wuguirong/.../hermes-desktop   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌─ 🎯 Sprint Goal ─────────────────────────────────────┐     │
│ │ Phase 2 — macOS 原生感                                │     │
│ │ 目标：让用户觉得「这是个真正的 Mac 应用」               │     │
│ │                                                      │     │
│ │ [编辑] — 可内联编辑 current-sprint.md                 │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                               │
│ ┌─ 📋 Feature Progress ────────────────────────── 2/5 完成 ─┐ │
│ │                                                             │ │
│ │  ✅ feat-201 菜单栏托盘集成                       已完成    │ │
│ │  ✅ feat-202 全局快捷键唤起                       已完成    │ │
│ │  🚧 feat-203 原生通知推送                         进行中    │ │
│ │  ⬜ feat-204 毛玻璃 + 主题深度打磨                 未开始    │ │
│ │  ⬜ feat-205 快捷键面板                           未开始    │ │
│ │  ⬜ feat-206 配置引导卡片                         未开始    │ │
│ │                                                             │ │
│ │  ████████████░░░░░░░░░░ 40%                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─ 📝 最近决策 ─────────────────────────────────────────┐     │
│ │ ● 2026-05-22 决定采用 Tauri v2 plugin 体系实现系统托盘 │     │
│ │ ● 2026-05-20 决定 Theme 使用 CSS 变量而非多样式表      │     │
│ │ ● 2026-05-18 决定 Dashboard 融合用 postMessage 方案   │     │
│ │                                    [查看全部 →]        │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                               │
│ ┌─ 🕐 会话记录 ─────────────────────────────────────────┐     │
│ │                                                         │     │
│ │  10:30 修复系统托盘图标在深色模式下不清晰的问题   进行中   │     │
│ │  昨天   实现全局快捷键 Cmd+Shift+H                      │     │
│ │  昨天   调研 Tauri v2 的 tray plugin API               │     │
│ │  3天前  Dashboard 主题融合方案评审                      │     │
│ │                        [+ 新对话]  [查看全部 Session]    │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                               │
│ ┌─ 📚 Backlog ──────────────────────────────────────────┐     │
│ │  P1  Phase 3 扩展功能（SOUL.md 编辑器等）              │     │
│ │  P2  bug: 深色模式下文件树图标颜色不一致                │     │
│ │  P3  考虑支持云同步 .harness/                          │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 6.5 项目详情页（无 Harness 时）

```
┌──────────────────────────────────────────────────────────────┐
│ ← 返回项目列表          📁 普通项目                           │
│                         /Users/xxx/my-temp-project            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│                                                               │
│               📂                                              │
│        此项目目录下没有 .harness/ 目录                          │
│                                                               │
│    安装 harness-kit 以启用 Sprint/Feature/Decision 可视化面板  │
│                                                               │
│   ┌──────────────────────────────────────────────────────┐   │
│   │ npm install -g harness-kit && cd ... && harness-kit  │   │
│   └──────────────────────────────────────────────────────┘   │
│              [点击复制]                                        │
│                                                               │
│              [我知道怎么做，跳过]                              │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 6.6 新建项目对话框

```
┌─────────────────────────────────────┐
│ 新建项目                             │
│                                     │
│ 项目名称 *                           │
│ ┌─────────────────────────────────┐ │
│ │ Hermes Desktop 开发              │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 项目描述                             │
│ ┌─────────────────────────────────┐ │
│ │ Tauri 桌面客户端，为普通用户解决  │ │
│ │ hermes 使用门槛...               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 工作目录 *                           │
│ ┌─────────────────────────── [浏览]┐ │
│ │ /Users/wuguirong/sourceCode/...  │ │
│ └─────────────────────────────────┘ │
│                                     │
│        [取消]          [创建项目]     │
└─────────────────────────────────────┘
```

工作目录选择使用 Tauri 的 `dialog.open({ directory: true })` 原生对话框，支持 macOS Finder 样式。

---

## 7. 产品设计：Harness 可视化面板

### 7.1 Sprint Goal 面板

| 项目 | 值 |
|------|-----|
| 来源 | `.harness/state/current-sprint.md` |
| 展示 | Markdown 渲染（简要），截取前 6 行非标题非分隔符内容 |
| 操作 | 右上角「编辑」按钮 → 内联编辑器 → 保存回文件 |
| 空状态 | "未检测到 Sprint 目标" |

### 7.2 Feature Progress 面板

| 项目 | 值 |
|------|-----|
| 来源 | `.harness/state/features.json` |
| 展示 | 进度条（百分比）+ 条目列表，✅=已完成 ⬜=未完成 |
| 操作 | 无（只读，遵循 features.json 的 passes 不可逆约束） |
| 空状态 | "未检测到功能列表" |
| 头信息 | `已完成数/总数` 显示在面板标题右侧 |

### 7.3 Decision Timeline 面板

| 项目 | 值 |
|------|-----|
| 来源 | `.harness/registry/_index.md` |
| 展示 | 提取 `- ` 或 `* ` 开头的行，最多展示 10 条 |
| 操作 | 点击「查看全部 →」可展开完整 `_index.md` |
| 空状态 | "暂无决策记录" |

### 7.4 Session History 面板

| 项目 | 值 |
|------|-----|
| 来源 | `.harness/registry/sessions/` 目录下的 `.md` 文件 |
| 展示 | 文件名（去掉 `.md` 后缀，`-` 替换为空格），最多 20 条 |
| 操作 | 点击条目可展开查看完整 Session 摘要 |
| 空状态 | "暂无会话记录" |

### 7.5 Backlog 面板

| 项目 | 值 |
|------|-----|
| 来源 | `.harness/product/backlog.md` |
| 展示 | 文件内容的预览（前 30 行），以 Markdown 渲染 |
| 操作 | 可展开查看全部，未来支持编辑 |
| 空状态 | "暂无 backlog" |

### 7.6 Harness 检测徽章

项目详情页头部，如果检测到 `.harness/` 目录，显示徽章 `harness`（accent 色圆角标签）。点击可跳转到 `.harness/` 目录。

---

## 8. 数据模型

### 8.1 Rust 后端

```rust
// Project 类型
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub directory: String,
    pub files: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

// 存储格式：~/.hermes/desktop/projects.json
pub struct ProjectsStore {
    pub projects: Vec<Project>,
}

// Harness 状态
pub struct HarnessState {
    pub has_harness: bool,
    pub sprint_goal: Option<String>,
    pub features: Option<HarnessFeatures>,
    pub recent_decisions: Vec<String>,
    pub sessions: Vec<HarnessSessionEntry>,
    pub backlog: Option<String>,
}

pub struct HarnessFeatures {
    pub total: usize,
    pub completed: usize,
    pub pending: usize,
    pub items: Vec<HarnessFeatureItem>,
}
```

### 8.2 前端类型

```typescript
interface Project {
  id: string;
  name: string;
  description: string;
  directory: string;
  files: string[];
  created_at: string;
  updated_at: string;
}

interface HarnessState {
  has_harness: boolean;
  sprint_goal: string | null;
  features: HarnessFeatures | null;
  recent_decisions: string[];
  sessions: { title: string; time: string }[];
  backlog: string | null;
}

interface HarnessFeatures {
  total: number;
  completed: number;
  pending: number;
  items: HarnessFeatureItem[];
}

interface HarnessFeatureItem {
  id: string;
  description: string;
  passes: boolean;
  acceptance?: string;
}
```

### 8.3 Tauri 命令（IPC）

| 命令 | 方向 | 说明 |
|------|------|------|
| `list_projects()` | Rust → Frontend | 获取所有项目 |
| `get_project(id)` | Rust → Frontend | 获取单个项目 |
| `create_project(name, description, directory)` | Frontend → Rust | 创建项目 |
| `update_project(id, name, description, directory)` | Frontend → Rust | 更新项目 |
| `delete_project(id)` | Frontend → Rust | 删除项目 |
| `read_harness_state(project_dir)` | Rust → Frontend | 读取 Harness 状态文件 |

---

## 9. ICO 框架分析

使用 AI 界面设计技能（`ai-interface-design.SKILL.md`）的 ICO 框架分析。

### 9.1 Input 阶段：用户如何创建/进入项目？

| 通道 | 设计 |
|------|------|
| **隐式上下文** | 检测当前 WorkingDirBar 中的工作目录 → 如果是已知项目目录 → 提示「是否为此目录创建项目？」 |
| **显式提示** | 项目管理页的「+ 新建项目」按钮 → 对话框填写 |
| **直接操控** | 左侧 NavBar 常驻入口（零学习曲线） |
| **空状态引导** | 首次打开项目页时，空状态卡片引导「创建第一个项目」 |

**避免的设计陷阱**：不要让用户手动输入目录路径。用系统原生文件夹选择器（Tauri `dialog.open`）。

### 9.2 Computation 阶段：创建/切换时发生了什么？

| 操作 | 耗时 | 用户感知 |
|------|:----:|---------|
| 创建项目 | < 100ms | 无感（写 JSON 文件） |
| 切换项目 | 即时 | React 路由切换 |
| 读取 Harness 状态 | < 50ms | 无感（读文件） |
| 首次索引大项目 | 100-500ms | 骨架屏/loading |

### 9.3 Output 阶段：用户看到什么？

| 原则 | 落地设计 |
|------|---------|
| **清晰** | 项目卡片：名称 + 描述 + 目录路径 + 最近活动 |
| **可验证** | 项目详情页显示 Harness 状态来源文件路径 |
| **有根基** | 对话界面顶部显示「📁 当前项目：Hermes Desktop」 |
| **可操作** | 每个项目卡片点击 → 进入项目；项目内可新建对话 |
| **可调整** | 项目设置中编辑名称/描述/目录 |

### 9.4 功能发现

使用 AI 界面设计技能的 2×2 发现矩阵：

|  | **低系统主动** | **高系统主动** |
|--|:------------:|:-------------:|
| **低用户意图** | NavBar 常驻图标（被动可见） | 检测到 AGENTS.md 时提示「创建项目」（轻量） |
| **高用户意图** | 项目页入口 | 输入 `/project` 斜杠命令快速创建 |

---

## 10. 分阶段路线图

### Step 1：项目管理基本功能（估时 5-7 天）

项目 CRUD + 左侧导航入口 + 项目列表/详情页 + 空壳对话框架。

| Task | 内容 | 时间 |
|------|------|:----:|
| 1 | Rust 后端 — 项目 CRUD 命令（projects.rs） | 1天 |
| 2 | 前端类型定义（Project 接口） | 0.2天 |
| 3 | NavBar 增加「项目」入口 + 路由 | 0.5天 |
| 4 | 项目列表页 ProjectsPage + 空状态 | 1天 |
| 5 | 项目详情页 ProjectDetailPage（空壳） | 1天 |
| 6 | CSS 样式补全 + 导航联动验证 | 0.5天 |

### Step 2：Harness 状态可视化面板（估时 5-6 天）

读取 `.harness/` 下的状态文件，展示四个面板。

| Task | 内容 | 时间 |
|------|------|:----:|
| 7 | Rust 后端 — Harness 状态读取命令（harness.rs） | 1天 |
| 8 | Sprint Goal 面板组件 | 0.5天 |
| 9 | Feature Progress 面板组件 | 1天 |
| 10 | Decision Timeline 面板组件 | 0.5天 |
| 11 | Session History 面板组件 | 0.5天 |
| 12 | 项目详情页集成 + Harness 检测逻辑 | 1天 |
| 13 | 安装 harness-kit 引导卡片 | 0.5天 |

### Step 3：项目内对话深度集成（估时 3-4 天）

| Task | 内容 | 时间 |
|------|------|:----:|
| 14 | ChatPage 项目上下文 props 改造 | 1天 |
| 15 | 项目内会话自动关联 project_id | 1天 |
| 16 | 对话结束后写入 session 摘要 | 1天 |
| 17 | 侧边栏按 project_id 过滤 | 0.5天 |

**总计估时：13-17 天（约 3 周 spread）**

---

## 11. 与现有功能的协同效应

| 现有功能 | 与项目管理的协同 |
|---------|----------------|
| **工作目录切换 (feat-209)** | 项目自动设定工作目录，取代手动切换 |
| **文件树侧边栏 (feat-210)** | 进入项目后，文件树默认展示项目目录 |
| **上下文压缩 (feat-004)** | 项目关联文件作为持久上下文，压缩时优先保留 |
| **快照/回滚 (feat-106)** | 快照作用域从会话级扩展到项目级（可选） |
| **后台任务 (feat-108)** | 项目的后台任务在项目详情页内可见 |
| **分支会话 (feat-208)** | 分支在项目内更有意义（同一项目不同方向） |
| **@引用菜单 (feat-216)** | 项目目录作为文件引用范围 |
| **Memory 编辑器** | 考虑增加项目级记忆（PROJECT.md）作为第三个面板 |

### 11.1 与产品规划的关系

当前产品规划 v3.0 的 P3 条目：

> - SOUL.md 编辑器
> - Context 文件浏览器
> - 子 Agent 监控树
> - 浏览器自动化截图预览
> - /steer 图形化

项目管理能**串联这些 P3 功能**——项目是这些功能的上层容器：每个项目有自己的 Context 文件、Agent 监控树、SOUL.md。

---

## 12. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|:----:|---------|
| **与 hermes CLI 的 session 管理不一致** | 🟡 中 | 完全在桌面端维护 project→session 映射，不依赖 CLI 改动 |
| **项目切换时 ChatPage 状态丢失** | 🟡 中 | ChatPage 已永久挂载（App.tsx 现有机制），通过 props 切换上下文而非卸载 |
| **文件索引性能（大项目）** | 🟢 低 | 只索引用户手动选择的文件，不做全目录自动扫描 |
| **导航层级过深** | 🟢 低 | 保持两级：项目列表 → 项目详情，不引入子项目/文件夹嵌套 |
| **与 Harness-Kit 版本兼容** | 🟡 中 | 读取 `.harness/` 状态文件时做严格错误处理，格式变化不导致崩溃 |
| **用户不需要 Harness 但使用了项目功能** | 🟢 低 | 无 Harness 时只显示安装引导，不强迫使用 |
| **features.json 误写操作** | 🟡 中 | Desktop 端只读，不提供修改 passes 的 UI（遵循 harness-kit 约束） |

### 12.1 不做的事

以下内容明确**不在**本方案范围内：

- 修改 hermes CLI 核心代码
- 为 hermes 添加原生 Hook 事件系统
- 在 Desktop 中实现 Harness-Kit 的 Hook 脚本运行功能
- 项目级 git 操作
- 多用户/权限系统
- 云端同步

---

## 附录 A：文件变更清单总览

### 新增文件

| 路径 | 说明 |
|------|------|
| `src-tauri/src/commands/projects.rs` | 项目 CRUD 命令 |
| `src-tauri/src/commands/harness.rs` | Harness 状态读取命令 |
| `src/pages/ProjectsPage.tsx` | 项目列表页 |
| `src/pages/ProjectDetailPage.tsx` | 项目详情页 |
| `src/components/ProjectCard.tsx` | 项目卡片组件 |
| `src/components/CreateProjectDialog.tsx` | 新建项目对话框 |
| `src/components/HarnessSprintPanel.tsx` | Sprint 面板组件 |
| `src/components/HarnessFeaturePanel.tsx` | Feature 面板组件 |
| `src/components/HarnessDecisionPanel.tsx` | Decision 面板组件 |
| `src/components/HarnessSessionPanel.tsx` | Session 面板组件 |

### 修改文件

| 路径 | 改动 |
|------|------|
| `src-tauri/src/commands/mod.rs` | 注册 projects 和 harness 模块 |
| `src-tauri/src/lib.rs` | Session 加 `project_id` 字段，注册 Tauri 命令 |
| `src-tauri/Cargo.toml` | 添加依赖（chrono, home） |
| `src/types.ts` | 新增 Project / HarnessState 接口 |
| `src/components/NavBar.tsx` | 新增「项目」导航项 |
| `src/components/Icon.tsx` | 新增 folder 图标 |
| `src/App.tsx` | 新增路由和事件处理 |
| `src/pages/ChatPage.tsx` | 接收 projectContext props |
| `src/index.css` | 新增所有项目页和 Harness 面板样式 |

---

## 附录 B：Harness-Kit Hook 脚本概览

了解这些有助于理解 Hermes Desktop 读取哪些文件以及它们的生命周期：

| Hook 脚本 | 触发时机 | 作用 | 读/写 |
|-----------|---------|------|:----:|
| `session-start.sh` | Session 启动 | 注入 registry 最近决策、Sprint 目标、未完成功能 | 读 |
| `session-end.sh` | Session 停止 | 强制执行 SESSION_END 协议（exit code 2 阻断） | 读 |
| `guard-dangerous.sh` | Bash 命令前 | 拦截 `rm -rf /`、禁止修改 features.json description | 读 |
| `post-write.sh` | 文件写入后 | 异步验证 features.json 格式完整性 | 只读 |
| `commit-msg` | git commit | 校验 commit message 格式 | 只读 |
