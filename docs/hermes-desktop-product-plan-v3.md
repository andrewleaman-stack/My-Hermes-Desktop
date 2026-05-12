# Hermes Desktop — 产品规划文档

> 版本：v3.0
> 日期：2026-05-12
> 项目路径：`/Users/wuguirong/sourceCode/hermes-desktop`
> 本版新增：斜杠命令图形化分析与规格，基于实现可行性分级

---

## 目录

1. [架构定位](#1-架构定位)
2. [功能分工边界](#2-功能分工边界)
3. [斜杠命令图形化分析](#3-斜杠命令图形化分析)
4. [优先级规划](#4-优先级规划)
5. [分阶段路线图](#5-分阶段路线图)
6. [各功能详细规格](#6-各功能详细规格)
7. [技术架构](#7-技术架构)

---

## 1. 架构定位

### 1.1 核心定位

> **Hermes Desktop** = 专注对话体验的原生桌面客户端
>
> - **自建**：对话 UI（Think Block / Tool Call 可视化）、斜杠命令图形化、记忆编辑、原生桌面特性
> - **委托**：所有管理类功能 → 内嵌 `hermes dashboard`（localhost:9119）
> - **护城河**：dashboard 是浏览器 app 做不到系统级集成；TUI 是终端模拟器做不到富文本 + 命令图形化

### 1.2 三版演进对比

| 维度 | v1.0 全部自建 | v2.0 分工合作 | v3.0 当前版 |
|------|-------------|-------------|------------|
| 功能范围 | 29 个，全部自建 | 8 个自建 + dashboard 集成 | 同 v2 + 斜杠命令图形化 |
| 预计工期 | 4 个月+ | 6～8 周 | 8～10 周 |
| 核心差异化 | 功能覆盖面 | 对话体验深度 | 对话体验 + 命令可发现性 |

### 1.3 通信架构约束（斜杠命令的前提）

当前通信模型是**一次性进程**：

```
用户发消息 → spawn "hermes chat -q <msg> --resume <id>" → 读 stdout → 进程退出
```

这个模型决定了斜杠命令图形化的实现分类：

- **A类（直接可做）**：把命令拼进消息体发出，拿回结果渲染 → 无架构障碍
- **B类（需要额外工作）**：发送容易，但结果需要轮询或 UI 层仿真
- **C类（当前架构不可行）**：需要持久双向通道（PTY/stdin 注入），暂缓

---

## 2. 功能分工边界

```
┌──────────────────────────────────────────────────────────────┐
│                    Hermes Desktop (Tauri)                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  自建区（核心价值）                   │    │
│  │                                                     │    │
│  │  💬 对话体验                                         │    │
│  │     流式渲染 · Markdown · Think Block · Tool Call    │    │
│  │     图片拖拽输入                                     │    │
│  │                                                     │    │
│  │  ⚡ 斜杠命令图形化（本版新增）                        │    │
│  │     后台任务面板 · 目标条 · 快照时间线               │    │
│  │     模型选择器 · 人格选择器 · 上下文压缩触发器        │    │
│  │     排队发送 · 会话标题编辑 · 快捷操作按钮           │    │
│  │                                                     │    │
│  │  🧠 记忆编辑器                                       │    │
│  │     MEMORY.md / USER.md 双面板 · 字数限额进度条      │    │
│  │                                                     │    │
│  │  🖥  原生桌面特性                                    │    │
│  │     系统托盘 · 系统通知 · 全局快捷键                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            内嵌区（委托 hermes dashboard）            │    │
│  │  iframe → http://127.0.0.1:9119                     │    │
│  │  Kanban · Cron · Insights · Config · Skills         │    │
│  │  Profiles · MCP · API Keys · Gateway                │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 功能归属总表

| 功能 | 归属 | 说明 |
|------|------|------|
| 多轮对话 + 流式渲染 | 自建 ✅ | 已实现 |
| Think Block 可视化 | 自建 ✅ | 已实现 |
| Tool Call 卡片 | 自建 ✅ | 已实现 |
| 会话管理侧边栏 | 自建 ✅ | 已实现 |
| **后台任务面板** | 自建 🚧 | /background + /agents + /stop |
| **目标条** | 自建 🚧 | /goal 图形化 |
| **快照时间线** | 自建 🚧 | /snapshot + /rollback |
| **模型选择器** | 自建 🚧 | /model 图形化 |
| **人格选择器** | 自建 🚧 | /personality 图形化 |
| **上下文压缩触发器** | 自建 🚧 | /compress 图形化 |
| **排队发送** | 自建 🚧 | /queue UI 仿真 |
| **会话标题编辑** | 自建 🚧 | /title 图形化 |
| **快捷操作** | 自建 🚧 | /retry + /undo 按钮 |
| Memory 编辑器 | 自建 🚧 | |
| 图片输入 | 自建 🚧 | |
| 系统托盘 | 自建 🚧 | |
| 系统通知 | 自建 🚧 | |
| 全局快捷键 | 自建 🚧 | |
| Dashboard 集成 | 自建 🚧 | |
| Kanban / Cron / Config 等 | 委托 dashboard | 不再自建 |

---

## 3. 斜杠命令图形化分析

### 3.1 实现可行性分类

根据当前一次性进程架构，全部斜杠命令分为三类：

#### A类：直接可做（拼入消息体发出）

UI 按钮触发 → 构造 `/command [args]` 字符串 → 作为消息体发出 → 解析返回结果渲染。无任何架构障碍，每个约 0.5～2 天。

| 命令 | 图形化形态 | 估时 |
|------|-----------|------|
| `/model <provider:model>` | TopBar 模型下拉选择器 | 1天 |
| `/personality <name>` | 输入框旁人格选择器弹层 | 1天 |
| `/compress [topic]` | Context 进度条旁"压缩"按钮 | 1天 |
| `/snapshot create [label]` | 快照时间线"保存"按钮 | 1天 |
| `/snapshot list` | 快照时间线数据加载 | 含上条 |
| `/snapshot restore <id>` | 时间线"恢复"按钮 | 含上条 |
| `/rollback [N]` | 时间线文件 diff + 回滚按钮 | 1天 |
| `/goal <text>` | 目标条"设置目标"输入 | 1天 |
| `/goal status/pause/resume/clear` | 目标条状态按钮 | 含上条 |
| `/stop` | 任务面板"停止全部"红色按钮 | 0.5天 |
| `/agents` | 任务面板数据刷新 | 含后台面板 |
| `/title <name>` | 侧边栏会话标题内联编辑 | 0.5天 |
| `/retry` | 最后一条消息右上角重试按钮 | 0.5天 |
| `/undo` | 最后一轮悬停时撤销按钮 | 0.5天 |
| `/fast` | TopBar 右侧闪电开关 | 0.5天 |
| `/yolo` | 设置面板开关 + 全局橙色警告横幅 | 1天 |

#### B类：需要额外工作

**`/background <prompt>`** — 发送本身 A类难度（拼命令发出），难点在**监控**：task 在独立 session 里跑，需要轮询 `hermes sessions list --json` 找到 background 类型 session，实时展示状态。  
估时：**4～5 天**（包含后台任务面板完整实现）

**`/queue <prompt>`** — 真正的 `/queue` 需要 agent 运行中往 stdin 写，当前架构做不到。但可以做 **UI 层仿真**：agent 运行期间锁住输入框，用户输入的内容存 state，进程退出后自动发出。体验等价。  
估时：**1 天**（纯前端状态管理）

#### C类：当前架构不可行（暂缓）

**`/steer <prompt>`** — 在 agent 执行 tool call 过程中向 stdin 注入消息，不打断执行流。需要持久 PTY 双向通道（hermes dashboard 就是这样做的：WebSocket → PTY → hermes --tui）。改造成本 2～3 周，且风险高。

**结论**：暂缓。等后续有需要或 hermes 暴露更好的 API 再议。

---

### 3.2 命令 → UI 组件映射

多个相关命令合并成一个 UI 组件，避免界面碎片化：

| UI 组件 | 覆盖的命令 | 位置 |
|---------|-----------|------|
| 后台任务面板 | `/background` `/agents` `/stop` | 右侧滑出面板 |
| 目标条 | `/goal` (text/status/pause/resume/clear) | 对话区顶部常驻 |
| 快照时间线 | `/snapshot` (create/list/restore/prune) `/rollback` | 右侧滑出面板 |
| TopBar 模型选择器 | `/model` | TopBar 常驻 |
| 人格选择器 | `/personality` | 输入框旁弹层 |
| 上下文压缩触发器 | `/compress` | Context 进度条旁 |
| 排队发送 | `/queue`（UI 仿真） | 输入框状态切换 |
| 会话标题编辑 | `/title` | 侧边栏内联编辑 |
| 消息快捷操作 | `/retry` `/undo` | 消息气泡 hover |
| Fast 模式开关 | `/fast` | TopBar |
| YOLO 模式开关 | `/yolo` | 设置面板 |

---

## 4. 优先级规划

### P0 — 立即做（产品闭环）

| 功能 | 类型 | 估时 |
|------|------|------|
| Dashboard 集成 | 架构 | 3～4天 |
| Memory 编辑器 | 自建 | 2～3天 |
| 状态栏完善（Context 进度条 / 费用 / 步数） | 自建 | 1～2天 |
| 上下文压缩触发器（`/compress`） | A类命令 | 1天 |

> P0 完成后：用户在 UI 内可完成完整工作流，不需要打开终端。

### P1 — 近期做（核心差异化）

| 功能 | 类型 | 估时 |
|------|------|------|
| 后台任务面板（`/background` + `/agents` + `/stop`） | B类命令 | 4～5天 |
| 目标条（`/goal`） | A类命令 | 1天 |
| 快照时间线（`/snapshot` + `/rollback`） | A类命令 | 2天 |
| 模型选择器（`/model`） | A类命令 | 1天 |
| 人格选择器（`/personality`） | A类命令 | 1天 |
| 排队发送（`/queue` UI 仿真） | B类命令 | 1天 |
| 会话标题编辑（`/title`） | A类命令 | 0.5天 |
| 消息快捷操作（`/retry` + `/undo`） | A类命令 | 0.5天 |
| 图片输入 | 自建 | 1～2天 |

> P1 完成后：用户彻底不需要记忆任何斜杠命令，所有核心操作都有图形入口。

### P2 — 原生桌面特性

| 功能 | 类型 | 估时 |
|------|------|------|
| 系统托盘驻留 | 原生 | 2～3天 |
| 系统通知 | 原生 | 1天 |
| 全局快捷键 | 原生 | 1天 |
| Fast / YOLO 开关 | A类命令 | 1天 |
| Dashboard 主题融合 | 样式 | 2天 |

### P3 — 按兴趣推进

| 功能 | 说明 |
|------|------|
| SOUL.md 编辑器 | 直接读写 `~/.hermes/SOUL.md`，人格模板库 |
| Context 文件浏览器 | 扫描项目 AGENTS.md / CLAUDE.md，快速预览 |
| 子 Agent 监控树 | delegate_task 层次可视化 |
| 浏览器自动化截图预览 | agent 操作浏览器时的实时截图面板 |
| `/steer` 图形化 | 需要 PTY 架构改造，届时评估 |

---

## 5. 分阶段路线图

### Phase 0：产品闭环（Week 1～2）

```
Week 1 — Dashboard 集成 + Memory 编辑器
├── Dashboard 集成
│   ├── Rust: spawn hermes dashboard --no-open --port 9119
│   ├── Rust: 就绪检测（轮询 http://localhost:9119，超时 10s）
│   ├── Rust: 应用退出时 kill 子进程
│   ├── 前端: 左侧导航新增"管理"图标入口
│   ├── 前端: <iframe src="http://localhost:9119"> 全屏嵌入
│   └── 前端: 依赖缺失时引导安装 hermes-agent[web,pty]
│
└── Memory 编辑器
    ├── Rust: read_memory() 读 ~/.hermes/memories/*.md
    ├── Rust: save_memory(filename, content) 写文件
    ├── 前端: MEMORY.md / USER.md 双面板编辑器
    ├── 前端: 字数进度条（2200 / 1375 字符上限）
    └── 前端: 超限禁止保存

Week 2 — 状态栏 + 压缩触发器
├── 状态栏完善
│   ├── 解析完整 hermes status bar（model/tokens/cost/time）
│   ├── Context 窗口进度条（绿→黄→橙→红，四段配色）
│   └── 步数计数（统计 tool call 块）
│
└── 上下文压缩触发器
    ├── Context 进度条旁"压缩"按钮（>70% 时高亮显示）
    ├── 点击弹出"压缩焦点（可选）"输入框
    └── 发送 /compress [focus] 并在对话流中显示压缩结果
```

---

### Phase 1：斜杠命令图形化（Week 3～5）

```
Week 3 — 异步/并发操作面板
├── 后台任务面板（最高优先级）
│   ├── 输入框旁新增"后台运行"按钮
│   ├── 点击后弹出任务描述输入框，发送 /background <prompt>
│   ├── 右侧滑出"任务"面板，5秒轮询 hermes sessions list
│   ├── 过滤出 background 类型，展示任务卡片：
│   │   名称 / 状态灯 / 已用时 / 最新输出摘要
│   ├── 点击任务卡 → 展开完整输出
│   └── 面板顶部"停止全部"红色按钮（发送 /stop）
│
└── 排队发送
    ├── agent 运行时输入框底部出现"排队"提示
    ├── 输入内容存 state，发送按钮变为"排队 ⏎"
    └── 当前进程退出后自动发送排队内容

Week 4 — 会话状态控制
├── 目标条
│   ├── 对话区顶部可折叠栏（无目标时显示"+ 设置持久目标"）
│   ├── 设置目标：输入文本 → 发送 /goal <text>
│   ├── 目标激活时常驻显示：目标文本 / 状态灯 / 轮数计数
│   └── 操作按钮：暂停 / 恢复 / 清除（发送对应 /goal 子命令）
│
├── 快照时间线
│   ├── "快照"面板（右侧滑出，和任务面板共用滑出区域，Tab 切换）
│   ├── 加载：发送 /snapshot list 解析返回
│   ├── 保存：输入标签 → 发送 /snapshot create <label>
│   ├── 恢复：点击条目 → 确认弹层 → 发送 /snapshot restore <id>
│   └── 文件回滚：发送 /rollback [N]，解析返回的变更文件列表展示
│
└── 模型选择器
    ├── TopBar 中常驻下拉（显示当前 provider:model）
    ├── 展开显示已配置模型列表（发送 /model 解析返回）
    └── 选择后发送 /model <provider:model>

Week 5 — 输入框周边功能
├── 人格选择器
│   ├── 输入框左侧小图标触发
│   ├── 弹出人格卡片网格（内置 14 种 + 自定义）
│   ├── 选中后发送 /personality <name>
│   └── 输入框底部显示当前人格标签 + 清除按钮
│
├── 会话标题编辑
│   ├── 侧边栏条目单击标题进入内联编辑
│   └── 回车确认 → 发送 /title <name>
│
└── 消息快捷操作
    ├── 最后一条 assistant 消息右上角 hover 显示 ↻ 重试按钮
    │   → 发送 /retry
    ├── 最后一轮 hover 显示"撤销这轮"
    │   → 发送 /undo，前端移除对应消息对
    └── 图片输入（拖拽/粘贴 → base64 → 附加到消息）
```

---

### Phase 2：原生桌面特性（Week 6～7）

```
Week 6
├── 系统托盘
│   ├── tauri-plugin-tray-icon
│   ├── 状态图标：idle(暗) / running(亮+动画) / error(警告)
│   ├── 关闭主窗口 → 隐藏到托盘（不退出进程）
│   └── 右键菜单：打开 / 新对话 / 管理面板 / 退出
│
└── 系统通知 + 全局快捷键
    ├── 触发通知：长任务完成(>30s) / agent 出错 / background 任务完成
    ├── 点击通知跳转对应 session
    └── Cmd+Shift+H 全局唤起（可自定义）

Week 7
├── Fast / YOLO 开关
│   ├── TopBar 右侧 ⚡ 图标（Fast 模式）
│   └── 设置面板 YOLO 开关 + 开启时全局橙色警告横幅
│
└── Dashboard 主题融合
    └── iframe postMessage 注入 CSS，调整配色接近 Terminal Noir
```

---

### Phase 3：扩展功能（Month 2+，按兴趣推进）

```
├── SOUL.md 编辑器（直接读写文件，人格模板库）
├── Context 文件浏览器（扫描项目 AGENTS.md / CLAUDE.md）
├── 子 Agent 监控树（delegate_task 层次可视化）
├── 浏览器自动化截图预览（实时截图轮询面板）
└── /steer 图形化（需 PTY 架构改造，届时评估）
```

---

## 6. 各功能详细规格

### 6.1 后台任务面板

**整体布局**

```
┌──────────────────────────────────────────────┐
│ 任务                        [停止全部 ■]       │
├──────────────────────────────────────────────┤
│                                              │
│ ● bg_143022_a1b2c3                           │
│   分析 /var/log 中今天的错误日志               │
│   运行中 · 已用 2m14s                         │
│   > 找到 3 个 ERROR 条目，正在分析...          │
│   [展开完整输出]                               │
│                                              │
│ ✓ bg_141500_x9y8z7                           │
│   生成本周 Git commit 摘要                     │
│   已完成 · 耗时 45s · 2m ago                  │
│   [查看结果]                                  │
│                                              │
└──────────────────────────────────────────────┘
```

**实现细节**

```
发送 /background <prompt>
  → hermes 返回确认消息，包含 Task ID（bg_xxxxxx_xxxxxx）
  → 前端解析 Task ID，存入 backgroundTasks state
  → 开启 5s 轮询：hermes sessions list --json
  → 过滤 session title 含 Task ID 的条目
  → 读取该 session 最新消息作为"最新输出摘要"
  → 任务完成（session 不再活跃）时触发系统通知
```

**与输入框的联动**

```
┌────────────────────────────────────────────┐
│  [输入框]                    [发送] [后台▼] │
└────────────────────────────────────────────┘
                                    ↓ 点击
                              ┌──────────────┐
                              │ 在后台运行此任务│
                              │ 当前对话保持可用│
                              └──────────────┘
```

---

### 6.2 目标条（Goal Bar）

**三种状态**

```
── 无目标时（折叠，一行高度）──────────────────────
  [⊕ 设置持久目标...]

── 目标激活中 ────────────────────────────────────
  ● 持续运行中  [第 3 / 20 轮]
  重构认证模块，确保所有测试通过
  [暂停]  [清除]

── 目标已暂停 ────────────────────────────────────
  ○ 已暂停
  重构认证模块，确保所有测试通过
  [恢复]  [清除]
```

**命令映射**

| 用户操作 | 发送命令 |
|---------|---------|
| 输入目标文本，回车 | `/goal <text>` |
| 点击"暂停" | `/goal pause` |
| 点击"恢复" | `/goal resume` |
| 点击"清除" | `/goal clear` |
| 查看状态（轮询） | `/goal status` 每 10s 发一次，解析返回 |

---

### 6.3 快照时间线面板

**布局（与后台任务面板共用右侧区域，Tab 切换）**

```
┌────────────────────── Tab: [任务] [快照] ───┐
│                                            │
│  [标签（可选）____________] [保存快照]        │
│  ─────────────────────────────────────    │
│  📸 auth-refactor          今天 15:32      │
│     [查看变更文件]          [恢复到此] [删]  │
│                                            │
│  📸 before-npm-install     今天 12:11      │
│     [查看变更文件]          [恢复到此] [删]  │
│                                            │
│  📸 initial                昨天 18:44      │
│     [查看变更文件]          [恢复到此] [删]  │
│                                            │
│             [清理旧快照（保留最近10条）]      │
└────────────────────────────────────────────┘
```

**"查看变更文件"展开**

```
📸 auth-refactor
  ├── src/auth/jwt.rs      +42 -8   [diff]
  ├── src/auth/session.rs  +15 -3   [diff]
  └── Cargo.lock           +2  -2   [diff]
```

diff 内容通过解析 `/snapshot restore` 的 dry-run 输出或直接读 `~/.hermes/checkpoints/` 目录实现。

---

### 6.4 模型选择器

**TopBar 常驻下拉**

```
TopBar: ⚡ Hermes Desktop  [anthropic · claude-sonnet-4 ▼]  ...
                                        ↓ 点击
                          ┌─────────────────────────────┐
                          │ 搜索模型...                   │
                          │ ─────────────────────────   │
                          │ anthropic                    │
                          │   ● claude-sonnet-4（当前）  │
                          │     claude-opus-4            │
                          │     claude-haiku-4-5         │
                          │ openrouter                   │
                          │     deepseek/deepseek-r1     │
                          │     google/gemini-2.5-pro    │
                          └─────────────────────────────┘
```

**数据加载**：发送 `/model`（无参数）解析返回的模型列表，解析格式 `provider · model` 分组展示。选择后发送 `/model <provider:model>`。

---

### 6.5 人格选择器

**输入框旁弹层**

```
输入框左侧图标 → 点击弹出：

┌────────────────────────────────────────────┐
│  🎭 选择人格                                │
│  ──────────────────────────────────────   │
│  [helpful]    [concise]   [technical]      │
│  友好助手      简洁精准    技术专家           │
│                                            │
│  [creative]   [teacher]   [pirate]         │
│  创意伙伴      耐心老师    海盗船长           │
│                                            │
│  [noir]       [kawaii]    [philosopher]    │
│  黑色电影      可爱风      哲学家            │
│  ──────────────────────────────────────   │
│  自定义: [________________]  [确定]         │
└────────────────────────────────────────────┘
```

选中后输入框底部显示：`🎭 pirate ×`（点击 × 发送 `/personality helpful` 重置默认）。

---

### 6.6 上下文压缩触发器

**Context 进度条（TopBar 内）**

```
Context: [████████████░░░░] 72%  [压缩 ⚡]
           绿色 → 黄色 → 橙色 → 红色
```

颜色阈值：`0-70% 绿` / `70-85% 黄` / `85-95% 橙` / `>95% 红+闪烁`

**点击"压缩"**

```
弹出小 Popover：
  压缩焦点（可选，留空则全量压缩）
  [____________________________]
  [取消]              [立即压缩]
```

确认后发送 `/compress [focus]`，在对话流中插入一条系统消息"✓ 上下文已压缩"。

---

### 6.7 排队发送（/queue UI 仿真）

**正常状态** → 普通发送

**Agent 运行中** → 输入框状态切换：

```
┌───────────────────────────────────────────┐
│  [输入下一条消息，agent 完成后自动发送]       │
│                                           │
│                    [排队发送 ⏸]            │
└───────────────────────────────────────────┘
```

底部提示区：`⏸ 已排队：「分析完成后帮我生成报告」  [取消]`

Agent 进程退出后，自动把排队内容作为下一条消息发送。

---

### 6.8 Dashboard 集成

**进程管理（Rust）**

```rust
// src-tauri/src/dashboard.rs
pub struct DashboardProcess { child: Option<Child>, port: u16 }

impl DashboardProcess {
    pub fn start(&mut self) -> Result<(), String> {
        let child = Command::new("hermes")
            .args(["dashboard", "--no-open", "--port", &self.port.to_string()])
            .spawn()
            .map_err(|e| format!("dashboard 启动失败: {}", e))?;
        self.child = Some(child);
        Ok(())
    }
    // 轮询就绪：每 200ms 请求 localhost:9119，最多等 10s
    pub async fn wait_ready(&self) -> Result<(), String> { ... }
    pub fn stop(&mut self) { self.child.take().map(|mut c| c.kill()); }
}
```

**依赖缺失引导**

```
检测到 hermes dashboard 启动失败，stderr 含 "pip install"
↓
弹出引导卡片：
  ┌──────────────────────────────────────────┐
  │  需要安装 dashboard 依赖                  │
  │                                          │
  │  pip install 'hermes-agent[web,pty]'     │
  │                                          │
  │  [复制命令]        [在终端中打开]          │
  └──────────────────────────────────────────┘
```

---

### 6.9 Memory 编辑器

**界面布局**

```
┌──────────────────────────────────────────────────────┐
│  🧠 Agent Memory                          [保存] [↺]  │
├────────────────────────┬─────────────────────────────┤
│  MEMORY.md             │  USER.md                    │
│  Agent 自身知识笔记     │  用户偏好 & 习惯             │
│                        │                             │
│  [Markdown 编辑区]     │  [Markdown 编辑区]           │
│                        │                             │
│  ████████████░░ 1840   │  ████░░░░░░░░░░ 620         │
│  /2200 chars           │  /1375 chars                │
└────────────────────────┴─────────────────────────────┘
```

字数进度条：`0-70% 绿` / `70-90% 橙` / `>90% 红` / `>100% 红+禁止保存`

---

### 6.10 系统托盘

| 状态 | 图标 | 触发条件 |
|------|------|---------|
| 空闲 | ⚡（暗） | 无活跃任务 |
| 运行中 | ⚡（亮，脉冲动画） | 有对话或后台任务在跑 |
| 有排队任务 | ⚡ + 数字角标 | /queue 有待发消息 |
| 出错 | ⚠️ | 最近任务报错 |

**生命周期**：关闭主窗口 → 隐藏到托盘（进程和 dashboard 子进程继续运行）。托盘"退出" → kill 所有子进程 → 退出应用。

---

## 7. 技术架构

### 7.1 目录结构

```
src-tauri/src/
├── main.rs
├── lib.rs                  # 注册所有 Tauri 命令
├── dashboard.rs            # hermes dashboard 进程管理
├── stream.rs               # stdout 解析状态机（chat 流）
├── poller.rs               # 后台任务轮询（background sessions）
└── commands/
    ├── chat.rs             # 对话 + 斜杠命令发送
    ├── sessions.rs         # 会话管理
    ├── memory.rs           # MEMORY.md / USER.md 读写
    ├── slash.rs            # 斜杠命令统一入口（NEW）
    ├── tray.rs             # 系统托盘
    └── notify.rs           # 系统通知

src/
├── App.tsx
├── pages/
│   ├── ChatPage.tsx        # 对话主界面
│   ├── MemoryPage.tsx      # 记忆编辑器
│   └── DashboardPage.tsx   # iframe 嵌入
├── components/
│   ├── chat/
│   │   ├── MessageBubble.tsx
│   │   ├── ThinkBlock.tsx
│   │   ├── ToolCallCard.tsx
│   │   ├── GoalBar.tsx         # 目标条（NEW）
│   │   └── InputArea.tsx       # 含排队发送状态
│   ├── panels/
│   │   ├── TaskPanel.tsx       # 后台任务面板（NEW）
│   │   └── SnapshotPanel.tsx   # 快照时间线（NEW）
│   └── topbar/
│       ├── TopBar.tsx
│       ├── ModelPicker.tsx     # 模型选择器（NEW）
│       ├── ContextBar.tsx      # Context 进度条 + 压缩（NEW）
│       └── PersonalityPicker.tsx # 人格选择器（NEW）
└── store/
    ├── chatStore.ts
    ├── taskStore.ts            # 后台任务状态（NEW）
    └── sessionStore.ts
```

### 7.2 新增 Rust 依赖

```toml
reqwest          = { version = "0.12", features = ["json"] }  # dashboard 就绪检测 + sessions 轮询
tauri-plugin-notification   = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-tray-icon       = "2"
```

### 7.3 斜杠命令统一发送接口

所有图形化按钮最终都走同一个 Rust 命令：

```rust
// commands/slash.rs
#[tauri::command]
pub async fn send_slash(
    app: AppHandle,
    session_id: Option<String>,
    command: String,   // 例如 "/goal pause" 或 "/model anthropic:claude-sonnet-4"
) -> Result<String, String> {
    // 复用 chat.rs 的 send_message 逻辑
    // command 直接作为消息体发出
    send_message(app, session_id, command).await
}
```

前端统一调用：

```typescript
// 例：点击"暂停目标"按钮
await invoke('send_slash', {
  sessionId: activeSessionId,
  command: '/goal pause'
});
```

### 7.4 后台任务轮询（poller.rs）

```rust
// 后台任务状态轮询，独立 tokio task
pub async fn poll_background_tasks(app: AppHandle, task_ids: Vec<String>) {
    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;
        let sessions = invoke_list_sessions().await;
        for session in sessions {
            for task_id in &task_ids {
                if session.title.contains(task_id) {
                    app.emit("task:update", TaskUpdate {
                        task_id: task_id.clone(),
                        status: session.status.clone(),
                        last_output: session.last_message.clone(),
                    }).ok();
                }
            }
        }
    }
}
```

### 7.5 路由结构

```tsx
<Router>
  <NavBar />         {/* 左侧图标导航：对话 / 记忆 / 管理 */}
  <RightPanels />    {/* 右侧：任务面板 / 快照面板（滑出层）*/}
  <Routes>
    <Route path="/"          element={<ChatPage />} />
    <Route path="/memory"    element={<MemoryPage />} />
    <Route path="/dashboard" element={<DashboardPage />} />
  </Routes>
</Router>
```

`RightPanels` 是常驻组件，不随路由变化卸载，保持轮询状态和已展开的任务列表。

---

## 附录：命令实现速查表

| 命令 | 可行性 | UI 组件 | 发送方式 | 估时 |
|------|-------|---------|---------|------|
| `/background` | B类 | 后台任务面板 | send_slash | 4～5天（含面板） |
| `/agents` | A类 | 后台任务面板 | send_slash | 含上条 |
| `/stop` | A类 | 后台任务面板 | send_slash | 0.5天 |
| `/queue` | B类 | 输入框排队状态 | 前端仿真 | 1天 |
| `/goal` | A类 | 目标条 | send_slash | 1天 |
| `/snapshot` | A类 | 快照时间线 | send_slash | 2天（含面板） |
| `/rollback` | A类 | 快照时间线 | send_slash | 含上条 |
| `/model` | A类 | TopBar 模型选择器 | send_slash | 1天 |
| `/personality` | A类 | 人格选择器弹层 | send_slash | 1天 |
| `/compress` | A类 | Context 进度条旁 | send_slash | 1天 |
| `/title` | A类 | 侧边栏内联编辑 | send_slash | 0.5天 |
| `/retry` | A类 | 消息气泡按钮 | send_slash | 0.5天 |
| `/undo` | A类 | 消息气泡按钮 | send_slash | 0.5天 |
| `/fast` | A类 | TopBar 开关 | send_slash | 0.5天 |
| `/yolo` | A类 | 设置面板开关 | send_slash | 1天 |
| `/steer` | ❌ C类 | 暂缓 | 需PTY架构 | 暂不做 |

---

*文档版本：v3.0 | 相比 v2.0 新增：斜杠命令图形化完整分析（实现可行性分类、命令→UI组件映射、8个新组件详细规格、统一 send_slash 接口设计）*
