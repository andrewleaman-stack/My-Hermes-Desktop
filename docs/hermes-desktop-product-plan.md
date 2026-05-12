# Hermes Desktop — 产品规划文档

> 版本：v1.0  
> 日期：2026-05-12  
> 项目路径：`/Users/wuguirong/sourceCode/hermes-desktop`  
> 基础版本：Tauri 2 + React，已实现多轮对话 / Think Block / Tool Call / 会话管理

---

## 目录

1. [项目背景与定位](#1-项目背景与定位)
2. [功能全景分析](#2-功能全景分析)
   - 2.1 核心能力
   - 2.2 自动化
   - 2.3 媒体与 Web
   - 2.4 管理
   - 2.5 集成
3. [优先级矩阵](#3-优先级矩阵)
4. [分阶段路线图](#4-分阶段路线图)
5. [各功能详细规格](#5-各功能详细规格)
6. [技术架构约定](#6-技术架构约定)
7. [竞品参照](#7-竞品参照)

---

## 1. 项目背景与定位

### 1.1 为什么做

Hermes Agent 是 Nous Research 出品的自进化智能体框架（GitHub 105K+ stars，2026 年增速最快的 AI agent 项目），核心能力包括：跨 session 持久记忆、自主技能创建与进化、多 Agent 协作看板、定时任务调度。

然而 Hermes 目前的交互界面仅有 CLI 和一个功能有限的 TUI，配置门槛高：

- 定时任务需要手写 cron 表达式
- 配置文件是裸 YAML，无验证
- 记忆内容（MEMORY.md / USER.md）不可视
- Kanban 任务板只能通过命令行操作
- 子 Agent 运行状态无法实时监控

**Hermes Desktop 的定位**：为 Hermes Agent 提供一个原生桌面 UI，让所有高价值功能都能在图形界面完成，大幅降低配置成本、提升使用体验，成为 Hermes 生态里最优质的桌面客户端。

### 1.2 目标用户

- **主力用户**：已在使用 Hermes Agent 的开发者/技术用户，希望摆脱纯 CLI 操作
- **潜在用户**：对 Hermes 感兴趣但被 CLI 门槛劝退的非技术用户
- **自身**：作为 AIAgentDSL 项目的参考实现，用于验证 agent UI 设计模式

### 1.3 与官方 Dashboard 的差异

Hermes 自带 `hermes dashboard`（浏览器版），但：

| 维度 | 官方 Dashboard | Hermes Desktop |
|------|---------------|----------------|
| 运行方式 | 浏览器 web app | 原生桌面应用 |
| 离线支持 | 需要 hermes gateway 服务 | 直接读写本地文件 |
| 定制空间 | 受官方迭代节奏限制 | 完全自主 |
| 深度集成 | 通用功能为主 | 可针对特定工作流深度优化 |
| Think Block 可视化 | 无 | 核心特性 |

---

## 2. 功能全景分析

以下对 Hermes Agent 全部主要功能逐一评估其 **UI 化价值**（用户从图形界面操作相比 CLI 的体验提升程度）和**实现成本**，并给出底层接口。

### 2.1 核心能力（Core）

#### 多轮对话 + 流式输出
- **UI 价值**：★★★★★
- **实现成本**：中（已完成）
- **UI 形态**：聊天气泡、Markdown 渲染、代码高亮、流式光标
- **底层接口**：`hermes chat -q "<msg>" --resume <id>`，解析 stdout
- **当前状态**：✅ 已实现基础版

#### Think Block 可视化
- **UI 价值**：★★★★★
- **实现成本**：低（已完成）
- **UI 形态**：可折叠紫色面板，显示字数，默认折叠
- **底层接口**：解析 stdout 中的 `<think>...</think>` 标记
- **当前状态**：✅ 已实现

#### Tool Call 可视化
- **UI 价值**：★★★★★
- **实现成本**：低（已完成）
- **UI 形态**：工具名 + 输入/输出折叠展示，执行状态指示灯
- **底层接口**：解析 stdout 中的工具调用块（`◆ toolname` 前缀）
- **当前状态**：✅ 已实现

#### 会话管理
- **UI 价值**：★★★★☆
- **实现成本**：低（已完成）
- **UI 形态**：左侧 session 列表，标题/时间/费用，支持删除/重命名
- **底层接口**：`hermes sessions list --json`，或直接扫描 `~/.hermes/sessions/`
- **当前状态**：✅ 已实现基础版

#### 记忆查看与编辑
- **UI 价值**：★★★★★（严重被低估的功能）
- **实现成本**：低
- **UI 形态**：MEMORY.md / USER.md 双面板 Markdown 编辑器，字数限额进度条（2200 / 1375 字符）
- **底层接口**：直接读写 `~/.hermes/memories/MEMORY.md` 和 `USER.md`
- **当前状态**：❌ 未做
- **说明**：Hermes "记忆自进化"是最核心的卖点，但用户在 CLI 下几乎不去主动查看/编辑记忆内容。做成可视化编辑器后，用户能直观感知 agent 学到了什么、删除无用记忆、手动补充背景知识。这是 Hermes Desktop 最直接的差异化价值。

#### 技能库管理（Skills）
- **UI 价值**：★★★★☆
- **实现成本**：中
- **UI 形态**：卡片式技能列表，搜索/安装/启用/禁用，Markdown 预览
- **底层接口**：`hermes skills list --json`、`hermes skills install <name>`
- **当前状态**：❌ 未做

#### 技能自进化 Curator
- **UI 价值**：★★★☆☆
- **实现成本**：中
- **UI 形态**：Curator 运行状态，技能进化历史时间线，pin/unpin 版本
- **底层接口**：`hermes curator status --json`
- **当前状态**：❌ 未做

#### 人格 / SOUL.md 编辑器
- **UI 价值**：★★★☆☆
- **实现成本**：低
- **UI 形态**：Markdown 编辑器，内置人格模板，实时字数统计
- **底层接口**：直接读写 `~/.hermes/SOUL.md`
- **当前状态**：❌ 未做

#### Context 文件管理
- **UI 价值**：★★★☆☆
- **实现成本**：低
- **UI 形态**：项目目录扫描，AGENTS.md / CLAUDE.md / .hermes.md 列表，内容预览，快速打开
- **底层接口**：文件系统扫描
- **当前状态**：❌ 未做

---

### 2.2 自动化（Automation）

#### 定时任务管理（Cron）
- **UI 价值**：★★★★★（CLI 最痛的点之一）
- **实现成本**：中
- **UI 形态**：
  - 任务列表：名称 / schedule / 下次执行时间 / 状态灯（运行中/暂停/失败）
  - 可视化 cron 表达式编辑器（参考 crontab.guru 风格）
  - 支持自然语言输入（"每天早上 9 点"）
  - 任务历史 + 最近输出日志
  - 暂停 / 恢复 / 立即触发 / 删除
  - 技能关联选择器
- **底层接口**：`hermes cron list --json`、`hermes cron create/pause/resume/delete/trigger`
- **当前状态**：❌ 未做
- **说明**：这是与竞品最大的差异化功能。hermes 自带 Dashboard 的 cron 管理很基础，在这里可以做得更好。

#### Kanban 多 Agent 看板
- **UI 价值**：★★★★★
- **实现成本**：高
- **UI 形态**：
  - 拖拽看板：待办 / 进行中 / 已完成 / 阻塞 四列
  - 任务卡片：标题 / 描述 / 负责 Agent / 创建时间 / heartbeat 状态
  - 任务详情面板：评论流、关联任务、执行日志
  - Agent 状态监控：各 Profile 活跃状态、最后 heartbeat 时间
- **底层接口**：直接读写 `~/.hermes/kanban.db`（SQLite），`hermes kanban` 命令
- **当前状态**：❌ 未做
- **说明**：kanban.db 是 SQLite，可在 Rust 侧用 `rusqlite` 直接读写，无需走 CLI。这是 Hermes 多 Agent 协作的核心基础设施，做好了体验远超 CLI。

#### 子 Agent 委派监控
- **UI 价值**：★★★★☆
- **实现成本**：高
- **UI 形态**：树状 Agent 层次图，子 Agent 输出实时流，完成状态聚合
- **底层接口**：`delegate_task` 事件解析，子进程 stdout 汇聚
- **当前状态**：❌ 未做

#### 持久目标（Goals）
- **UI 价值**：★★★☆☆
- **实现成本**：低
- **UI 形态**：目标卡片列表，进度状态，关联 session 链接
- **底层接口**：直接读写 `~/.hermes/goals.md`
- **当前状态**：❌ 未做

#### 事件钩子管理（Hooks）
- **UI 价值**：★★★☆☆
- **实现成本**：中
- **UI 形态**：钩子列表，触发条件/脚本路径，启用/禁用开关，最近执行日志
- **底层接口**：`hermes hooks list --json`
- **当前状态**：❌ 未做

#### 批量处理（Batch Processing）
- **UI 价值**：★★☆☆☆
- **实现成本**：高
- **UI 形态**：CSV/JSONL 上传，进度条，结果预览，下载
- **底层接口**：`hermes batch`
- **当前状态**：❌ 未做（P3，使用频率低）

---

### 2.3 媒体与 Web

#### 图片输入（Vision）
- **UI 价值**：★★★★☆
- **实现成本**：低
- **UI 形态**：输入框拖拽/粘贴上传，缩略图预览，base64 编码后随消息发送
- **底层接口**：Tauri 原生剪贴板 API + `hermes chat` 的多模态输入
- **当前状态**：❌ 未做

#### 浏览器自动化监控
- **UI 价值**：★★★★☆
- **实现成本**：高
- **UI 形态**：实时截图预览（轮询），操作日志流，暂停/继续按钮
- **底层接口**：Browser tool 事件，CDP screenshots
- **当前状态**：❌ 未做

#### 语音模式
- **UI 价值**：★★★☆☆
- **实现成本**：高（系统权限复杂）
- **UI 形态**：麦克风按钮，实时波形可视化，TTS 回放控制
- **底层接口**：Tauri 音频插件 + `hermes voice`
- **当前状态**：❌ 未做

#### 图像生成
- **UI 价值**：★★☆☆☆
- **实现成本**：中
- **UI 形态**：prompt 输入，模型选择（9 个 FAL.ai 模型），生成结果展示
- **底层接口**：`image_generation` tool 事件
- **当前状态**：❌ 未做

---

### 2.4 管理

#### 状态 Dashboard（扩展现有 TopBar）
- **UI 价值**：★★★★★
- **实现成本**：中
- **UI 形态**：
  - 实时：Token 用量进度条（配色同 hermes 状态栏），费用计数器，当前步数
  - 历史：本日/本周费用折线图，按模型分组
  - 告警：上下文窗口超过 80% 时高亮警告
- **底层接口**：解析 hermes status bar 输出 + `hermes insights --json`
- **当前状态**：⚡ 部分实现（TopBar 只显示当前值）

#### 用量分析（Insights）
- **UI 价值**：★★★★☆
- **实现成本**：中
- **UI 形态**：Token / 费用 / 会话数趋势图（日/周/月），按模型、按 Profile 分组
- **底层接口**：`hermes insights --json`
- **当前状态**：❌ 未做

#### 配置编辑器
- **UI 价值**：★★★★★（降低入门门槛的关键）
- **实现成本**：中
- **UI 形态**：
  - `~/.hermes/config.yaml` 解析为结构化表单
  - 分组：模型提供商 / 工具开关 / 消息平台 / 内存 / 安全
  - 字段级别校验，保存前 dry-run
  - 支持多 Profile 分别编辑
- **底层接口**：直接读写 `~/.hermes/config.yaml`
- **当前状态**：❌ 未做
- **说明**：YAML 手编是用户最大的使用门槛，这个做完对新用户的价值立竿见影。

#### 多 Profile 管理
- **UI 价值**：★★★★☆
- **实现成本**：中
- **UI 形态**：Profile 切换器（顶部下拉），新建/删除，配置差异对比视图
- **底层接口**：`hermes profile list --json`、`hermes profile use <name>`
- **当前状态**：❌ 未做

#### Checkpoint / 回滚时间线
- **UI 价值**：★★★★☆
- **实现成本**：中
- **UI 形态**：快照时间线，文件变更 diff 视图（highlight 增删行），一键回滚确认
- **底层接口**：`hermes checkpoints list --json`、`hermes checkpoints restore <id>`，读取 `~/.hermes/checkpoints/`
- **当前状态**：❌ 未做

#### 日志查看器
- **UI 价值**：★★★☆☆
- **实现成本**：低
- **UI 形态**：实时日志流，过滤（级别/时间/关键词），级别颜色编码
- **底层接口**：`hermes logs tail`，读取 `~/.hermes/logs/`
- **当前状态**：❌ 未做

---

### 2.5 集成

#### MCP 服务器管理
- **UI 价值**：★★★★☆
- **实现成本**：中
- **UI 形态**：已配置 MCP 服务器列表，连接状态（绿/红），可用工具浏览，添加/删除/编辑
- **底层接口**：`hermes mcp list --json`、读写 `~/.hermes/mcp.json`
- **当前状态**：❌ 未做

#### 模型提供商路由
- **UI 价值**：★★★★☆
- **实现成本**：中
- **UI 形态**：提供商优先级拖拽排序，fallback 链可视化，费用/速度估算对比
- **底层接口**：`hermes model list --json`，读写 config.yaml providers 节
- **当前状态**：❌ 未做

#### API Key 管理
- **UI 价值**：★★★☆☆
- **实现成本**：低
- **UI 形态**：Key 列表（遮码显示），连通性测试按钮，Credential Pool 配置
- **底层接口**：`hermes auth list`
- **当前状态**：❌ 未做

#### 消息平台 Gateway
- **UI 价值**：★★★☆☆
- **实现成本**：高（各平台 OAuth 各不相同）
- **UI 形态**：平台卡片（Telegram/Discord/Slack/WeCom 等），连接状态，消息流预览
- **底层接口**：`hermes gateway status --json`
- **当前状态**：❌ 未做

---

## 3. 优先级矩阵

### 评分维度

| 维度 | 说明 |
|------|------|
| UI 价值 | 图形界面相比 CLI 带来的体验提升幅度 |
| 实现成本 | 开发工作量（低/中/高） |
| 差异化 | 相比 hermes 官方 dashboard 的独特性 |
| 依赖关系 | 是否被其他功能依赖 |

### 完整优先级表

| 功能 | 模块 | UI价值 | 实现成本 | 优先级 | 当前状态 |
|------|------|--------|----------|--------|---------|
| 多轮对话 + 流式输出 | 核心 | ★★★★★ | 中 | P0 | ✅ 已实现 |
| Think Block 可视化 | 核心 | ★★★★★ | 低 | P0 | ✅ 已实现 |
| Tool Call 可视化 | 核心 | ★★★★★ | 低 | P0 | ✅ 已实现 |
| 会话管理 | 核心 | ★★★★☆ | 低 | P0 | ✅ 已实现 |
| 记忆查看与编辑 | 核心 | ★★★★★ | 低 | **P0** | ❌ 未做 |
| 状态 Dashboard | 管理 | ★★★★★ | 中 | **P0** | ⚡ 部分 |
| 定时任务管理（Cron） | 自动化 | ★★★★★ | 中 | **P1** | ❌ 未做 |
| 技能库管理 | 核心 | ★★★★☆ | 中 | **P1** | ❌ 未做 |
| 配置编辑器 | 管理 | ★★★★★ | 中 | **P1** | ❌ 未做 |
| 多 Profile 管理 | 管理 | ★★★★☆ | 中 | **P1** | ❌ 未做 |
| 用量分析（Insights） | 管理 | ★★★★☆ | 中 | **P1** | ❌ 未做 |
| Checkpoint / 回滚 | 管理 | ★★★★☆ | 中 | **P1** | ❌ 未做 |
| 持久目标（Goals） | 自动化 | ★★★☆☆ | 低 | **P1** | ❌ 未做 |
| MCP 服务器管理 | 集成 | ★★★★☆ | 中 | **P1** | ❌ 未做 |
| 模型提供商路由 | 集成 | ★★★★☆ | 中 | **P1** | ❌ 未做 |
| 图片输入（Vision） | 媒体 | ★★★★☆ | 低 | **P1** | ❌ 未做 |
| Kanban 多 Agent 看板 | 自动化 | ★★★★★ | 高 | **P2** | ❌ 未做 |
| 子 Agent 委派监控 | 自动化 | ★★★★☆ | 高 | **P2** | ❌ 未做 |
| 技能自进化 Curator | 核心 | ★★★☆☆ | 中 | **P2** | ❌ 未做 |
| 人格 / SOUL.md 编辑器 | 核心 | ★★★☆☆ | 低 | **P2** | ❌ 未做 |
| Context 文件管理 | 核心 | ★★★☆☆ | 低 | **P2** | ❌ 未做 |
| 事件钩子管理（Hooks） | 自动化 | ★★★☆☆ | 中 | **P2** | ❌ 未做 |
| 浏览器自动化监控 | 媒体 | ★★★★☆ | 高 | **P2** | ❌ 未做 |
| API Key 管理 | 集成 | ★★★☆☆ | 低 | **P2** | ❌ 未做 |
| 消息平台 Gateway | 集成 | ★★★☆☆ | 高 | **P2** | ❌ 未做 |
| 日志查看器 | 管理 | ★★★☆☆ | 低 | **P2** | ❌ 未做 |
| 语音模式 | 媒体 | ★★★☆☆ | 高 | **P3** | ❌ 未做 |
| 图像生成 | 媒体 | ★★☆☆☆ | 中 | **P3** | ❌ 未做 |
| 批量处理 | 自动化 | ★★☆☆☆ | 高 | **P3** | ❌ 未做 |

---

## 4. 分阶段路线图

### Phase 0：补全基础闭环（当前 → 第 2 周）

**目标**：让 P0 功能全部就位，产品形成完整的最小可用闭环。

```
Sprint 1（Week 1-2）
├── 记忆编辑器
│   ├── 读取 ~/.hermes/memories/MEMORY.md 和 USER.md
│   ├── 双面板 Markdown 编辑器（CodeMirror 或 textarea）
│   ├── 字数限额进度条（MEMORY: 2200字符，USER: 1375字符）
│   └── 保存/放弃 / 差异对比
│
└── Dashboard 扩展
    ├── TopBar 解析完整 hermes status bar 格式
    ├── Context 窗口用量进度条（颜色编码：绿/黄/橙/红）
    ├── 当前 session 费用计数
    └── 步数计数（从 tool call 块计算）
```

**交付标准**：用户能在 UI 内完整完成一次有意义的工作——对话、查看 agent 推理过程、确认 agent 学到了什么、了解花了多少钱。

---

### Phase 1：构建产品护城河（第 3 → 第 8 周）

**目标**：实现 8 个 P1 功能，建立相比 CLI 和官方 Dashboard 的核心差异化优势。

```
Sprint 2（Week 3-4）：配置 & 分析
├── 配置编辑器
│   ├── 解析 ~/.hermes/config.yaml 为 JSON Schema
│   ├── 分组 GUI 表单（提供商/工具/内存/安全）
│   └── 保存前校验 + 重载提示
│
└── 用量分析（Insights）
    ├── hermes insights --json 解析
    ├── Token/费用趋势折线图（Chart.js/recharts）
    └── 按模型分组对比

Sprint 3（Week 5-6）：Cron 定时任务（核心差异化）
├── 任务列表（名称/schedule/状态灯/下次执行倒计时）
├── 新建任务向导
│   ├── 自然语言 schedule 输入（"每天早 9 点"）
│   ├── cron 表达式可视化编辑（显示每个字段含义）
│   ├── 技能关联多选
│   └── 工作目录选择器
├── 任务操作：暂停/恢复/立即触发/删除
└── 任务历史：最近 N 次执行时间 + 输出摘要

Sprint 4（Week 7-8）：技能 & Checkpoint & 其余 P1
├── 技能库管理
│   ├── hermes skills list 展示（安装状态/来源/描述）
│   ├── 搜索 agentskills.io
│   └── 安装/卸载/启用/禁用
│
├── Checkpoint 回滚时间线
│   ├── 快照列表（时间/触发操作/变更文件数）
│   ├── 文件 diff 视图（增删行高亮）
│   └── 回滚确认弹层
│
├── 多 Profile 管理
│   ├── Profile 下拉切换（顶部常驻）
│   └── 新建/删除/配置查看
│
├── 图片输入
│   ├── 输入框拖拽/粘贴检测
│   └── 缩略图预览 + 随消息发送
│
└── MCP + 提供商路由（如有余量）
```

**交付标准**：用户可以全程在 UI 内完成：设置定时任务、管理技能库、查看历史费用、在出错后回滚文件变更。

---

### Phase 2：进阶功能（第 9 → 第 16 周）

**目标**：实现高复杂度但高价值的功能，形成竞品难以复制的产品壁垒。

```
Sprint 5-6（Month 3）：多 Agent 协作可视化
├── Kanban 多 Agent 看板
│   ├── SQLite 直连 ~/.hermes/kanban.db（rusqlite）
│   ├── 拖拽看板（react-dnd 或 dnd-kit）
│   ├── 任务卡片 CRUD
│   ├── Agent heartbeat 状态监控
│   └── 任务评论流
│
└── 子 Agent 委派监控
    ├── Agent 树状层次图（主 agent → 子 agents）
    ├── 各子 agent 输出流实时展示
    └── 完成状态汇总

Sprint 7-8（Month 4）：其余 P2 功能
├── Curator 可视化（技能进化历史）
├── SOUL.md / Context 文件编辑器
├── 事件钩子管理
├── API Key 管理
├── 浏览器自动化监控（截图轮询）
├── 消息平台 Gateway 状态
└── 日志查看器
```

---

### Phase 3：长尾与生态（第 17 周+）

```
├── 语音模式（麦克风 + TTS 播放）
├── 图像生成画廊
├── 批量处理
├── 插件市场集成（agentskills.io）
└── 移动端（Tauri Mobile，iOS/Android）
```

---

## 5. 各功能详细规格

### 5.1 记忆编辑器

**页面结构**

```
┌─────────────────────────────────────────────┐
│ 🧠 Agent Memory                       [保存] │
├──────────────────────┬──────────────────────┤
│ MEMORY.md            │ USER.md              │
│ agent 自身知识笔记    │ 用户偏好 & 习惯       │
│                      │                      │
│ [Markdown 编辑器]    │ [Markdown 编辑器]    │
│                      │                      │
│ ████████░░ 1840/2200 │ ███░░░░░░░ 620/1375  │
└──────────────────────┴──────────────────────┘
```

**技术实现**

- Rust 命令：`read_memory_files()` → 读 `~/.hermes/memories/*.md`
- Rust 命令：`save_memory_file(filename, content)` → 写文件
- 前端：`<textarea>` 或轻量 Markdown 编辑器（不引入重量级编辑器）
- 字数计数实时更新，超限时红色警告禁止保存

---

### 5.2 Cron 定时任务管理

**任务列表 UI**

```
┌────────────────────────────────────────────────────────────┐
│  定时任务                                        [+ 新建]  │
├──────────────────┬───────────┬──────────┬─────────────────┤
│ 任务名称          │ 调度时间   │ 状态     │ 下次执行         │
├──────────────────┼───────────┼──────────┼─────────────────┤
│ 早报汇总          │ 0 9 * * * │ ● 运行中  │ 明天 09:00      │
│ 服务器状态检查    │ every 2h  │ ○ 暂停   │ —               │
│ GitHub PR 巡检   │ 0 18 * * 1│ ● 运行中  │ 周一 18:00      │
└──────────────────┴───────────┴──────────┴─────────────────┘
```

**新建任务向导（3步）**

1. **描述任务**：名称 + 自然语言任务描述
2. **设置时间**：自然语言输入 OR cron 表达式（实时显示"每天/每周几/..."的中文解读）
3. **高级选项**：关联技能多选、工作目录、输出投递平台

**底层接口**

```bash
hermes cron list --json           # 获取任务列表
hermes cron create "<schedule>" "<prompt>" [--skill <name>] [--name <name>]
hermes cron pause <id>
hermes cron resume <id>
hermes cron trigger <id>
hermes cron delete <id>
```

---

### 5.3 Kanban 多 Agent 看板

**技术方案**：直连 `~/.hermes/kanban.db`（SQLite），Rust 侧用 `rusqlite` crate，无需走 hermes CLI。

**数据结构**（根据 hermes kanban spec 推断）

```sql
-- 任务表
tasks(id, title, description, status, assignee_profile, created_at, updated_at)
-- 评论表
comments(id, task_id, author, body, created_at)
-- Agent 心跳表
heartbeats(profile, last_seen, current_task_id)
```

**UI 布局**

```
┌─────────┬──────────┬──────────┬────────┐
│  待办    │  进行中  │  已完成  │  阻塞  │
├─────────┼──────────┼──────────┼────────┤
│ [任务卡] │ [任务卡] │ [任务卡] │[任务卡]│
│  标题    │  标题    │  标题    │ 标题   │
│  Agent:  │  Agent:  │  ✓       │ 🚫    │
│  inbox   │  ops     │          │       │
└─────────┴──────────┴──────────┴────────┘
```

**实现要点**

- `dnd-kit` 处理拖拽（轻量，支持键盘无障碍）
- 5 秒轮询刷新 heartbeat 状态（显示 Agent 是否存活）
- 任务详情面板：右侧滑出，显示描述、评论流、执行日志链接

---

### 5.4 配置编辑器

**分组结构**

```
配置编辑器
├── 模型提供商
│   ├── 主 Provider（下拉选择）
│   ├── 主 Model（基于 provider 动态刷新）
│   └── Fallback 链（可排序列表）
├── 工具开关
│   └── 各 toolset 开关（web/terminal/files/memory/delegation...）
├── 内存设置
│   ├── 内存提供商（built-in/Honcho/Mem0...）
│   └── 相关 API Key
├── 消息平台
│   └── 各平台 Token 配置（Telegram Bot Token 等）
└── 安全
    ├── dangerous-command 审批模式（always/never/ask）
    └── 工作目录白名单
```

**实现要点**

- 解析 `~/.hermes/config.yaml` → 强类型 Rust 结构体 → JSON 传前端
- 保存时先写临时文件，`hermes doctor` 校验通过后再替换
- 敏感字段（API Key）显示遮码，点击展开

---

### 5.5 Checkpoint / 回滚时间线

**UI 布局**

```
┌─────────────────────────────────────────────┐
│ Checkpoints                                  │
├──────────────────────────────────────────────┤
│ ● 今天 14:32  修改了 src/main.rs (+42 -8)   │
│   [查看 diff]                    [回滚到此]  │
│                                              │
│ ● 今天 12:11  执行了 npm install             │
│   [查看 diff]                    [回滚到此]  │
│                                              │
│ ● 昨天 18:44  创建了 config.yaml            │
└──────────────────────────────────────────────┘
```

**diff 视图**：内嵌轻量 diff 渲染（红色删除行 / 绿色新增行），不依赖外部 diff 工具。

---

## 6. 技术架构约定

### 6.1 Rust 命令分层

```rust
// 约定：所有 hermes CLI 调用统一封装，不在命令函数里直接 spawn
// src-tauri/src/
//   main.rs          — 入口
//   lib.rs           — 注册所有命令
//   hermes_cli.rs    — hermes CLI 调用封装（spawn + JSON 解析）
//   file_store.rs    — 直接读写 ~/.hermes/ 文件（sessions/memories/kanban.db）
//   stream.rs        — stdout 解析状态机（think/tool/text）
//   commands/
//     chat.rs        — 对话相关
//     sessions.rs    — 会话管理
//     cron.rs        — 定时任务
//     memory.rs      — 记忆读写
//     config.rs      — 配置编辑
//     kanban.rs      — 看板（SQLite）
//     skills.rs      — 技能库
//     insights.rs    — 用量分析
//     checkpoints.rs — 快照回滚
```

### 6.2 前端状态管理

功能增加后 `App.tsx` 会膨胀，在 Phase 1 开始前引入轻量状态管理：

- **推荐**：`zustand`（轻量，无 boilerplate，Tauri 项目常用）
- 每个功能模块一个 store slice（`useChatStore`、`useSessionStore`、`useCronStore`...）

### 6.3 路由结构（Phase 1 后引入）

```tsx
// 引入 react-router-dom，主页面改为路由架构
/             → 对话（当前主界面）
/memory       → 记忆编辑器
/skills       → 技能库
/cron         → 定时任务
/kanban       → Kanban 看板
/insights     → 用量分析
/config       → 配置编辑器
/checkpoints  → 快照时间线
/profiles     → Profile 管理
/mcp          → MCP 管理
```

左侧 sidebar 增加导航图标栏（icon-only，hover 显示 label），会话列表保留在 `/` 路由的二级侧边栏。

### 6.4 新增 Rust 依赖（按需引入）

| 功能 | Crate |
|------|-------|
| Kanban SQLite | `rusqlite` + `rusqlite-bundled` feature |
| YAML 配置解析 | `serde_yaml` |
| 文件 diff | `similar`（pure Rust diff 库） |
| 图片处理 | `image`（仅在 vision 功能需要时） |

### 6.5 hermes 命令 JSON 输出约定

所有 hermes 子命令均加 `--json` 标志获取结构化输出。若某命令不支持 `--json`，则直接读写 `~/.hermes/` 对应文件作为 fallback：

| 功能 | 优先方案 | Fallback |
|------|---------|---------|
| 会话列表 | `hermes sessions list --json` | 扫描 `~/.hermes/sessions/` |
| 记忆 | 直接读写文件 | — |
| Cron 列表 | `hermes cron list --json` | 读 `~/.hermes/cron.json` |
| Kanban | 直接读 SQLite | `hermes kanban show --json` |
| Insights | `hermes insights --json` | 读 `~/.hermes/logs/` 聚合 |

---

## 7. 竞品参照

| 功能 | Hermes Desktop | hermes dashboard | hermes --tui | Claude Code | OpenClaw |
|------|:--------------:|:----------------:|:------------:|:-----------:|:--------:|
| 多轮对话 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Think Block 可视化 | ✅ | ❌ | ❌ | ✅ | ❌ |
| 记忆编辑器 | 🚧 P0 | 基础 | ❌ | ❌ | ❌ |
| Cron 管理 | 🚧 P1 | 基础 | ❌ | ❌ | ❌ |
| Kanban | 🚧 P2 | 有 | ❌ | ❌ | ❌ |
| 配置 GUI | 🚧 P1 | 部分 | ❌ | ❌ | ❌ |
| Checkpoint 时间线 | 🚧 P1 | ❌ | ❌ | ❌ | ❌ |
| 子 Agent 监控 | 🚧 P2 | ❌ | ❌ | ❌ | ❌ |
| 原生桌面 | ✅ Tauri | ❌ 浏览器 | ✅ 终端 | ✅ | ✅ |
| 离线文件访问 | ✅ | ❌ | ✅ | ✅ | ✅ |

**核心差异化机会**：Think Block 可视化 + Checkpoint 时间线 + 子 Agent 监控树 是目前所有竞品都没做好的三个点，集中精力做好这三个，产品就有了清晰的记忆点。

---

*文档版本：v1.0 | 下次更新：Phase 0 完成后（预计 Week 2 末）*
