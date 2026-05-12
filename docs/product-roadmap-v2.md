# Hermes Desktop — 产品路线图 v2

> 定位：macOS 上最轻、最优雅的 Hermes Agent 桌面伴侣
> 北极星：零配置安装、零学习曲线、苹果式直觉交互
> 核心理念：管理类功能交给 `hermes dashboard` iframe，我们把剩下的做到极致

---

## 战略总览

```
               ┌─────────────────────────────────┐
               │       Hermes Desktop v1          │
               │                                   │
               │   对话体验极致化   +   macOS 原生感  │
               │                                   │
               │   轻量（Tauri）   +   内嵌终端      │
               └─────────────────────────────────┘
                        vs
        fathah: 大而全的 Electron 管理中心
```

**不做的事（始终委托 dashboard iframe）**：Kanban / Cron / Config / Skills / Profiles / MCP / API Keys / 消息网关

**作者注**：当前 Phase 1 的 10 个功能是"斜杠命令图形化"——跟方向 A 完全一致。下面在 Phase 1 基础上往后延伸。

---

## Phase 1 — 斜杠命令图形化（进行中）

> Sprint 1 + Sprint 2，目标 features.json 中 feat-101～110 全部 passes = true

| Sprint | 功能 | 说明 |
|--------|------|------|
| **1** | feat-101 模型选择器 | TopBar `/model` 下拉，provider 分组，可搜索 |
| | feat-102 会话标题编辑 | 侧边栏内联编辑 `/title` |
| | feat-103 消息快捷操作 | `/retry` + `/undo` 悬停按钮 |
| | feat-104 排队发送 UI | agent 运行时输入可排队 |
| | feat-110 首次使用引导 | 三步引导（安装→配置→开始） |
| **2** | feat-105 目标条 | `/goal` 全状态图形化 |
| | feat-106 快照时间线 | `/snapshot` + `/rollback` 面板 |
| | feat-107 人格选择器 | `/personality` 弹层网格 |
| | feat-108 后台任务面板 | `/background` + 轮询面板 |
| | feat-109 图片/附件输入 | 拖拽/粘贴 → base64 |

**做完后**：用户不需要记任何斜杠命令，所有常用操作都有图形入口。

---

## Phase 2 — macOS 原生感（6~8 周）

> 让这个应用在 macOS 上"感觉就是原生 Mac 应用"

### 2.1 菜单栏集成

- **Menu bar extra** — 从系统菜单栏展开 Hermes 快速对话（类似 MacGPT / BoltAI）
  - 点击展开输入框，键入后一键发送
  - 显示当前 session 摘要和状态
  - 全局快捷键（如 `Opt+Space`）唤出
- **全局快捷键注册** — 用 Tauri 的 global shortcut 插件
- **菜单栏图标** — 显示 Hermes 运行状态（idle / thinking / error 颜色指示）

**为什么做这个**：macOS 用户习惯菜单栏工具（Bartender、MacGPT、Raycast），这是让 Hermes 融入用户日常操作流的入口。fathah 没有这个。

### 2.2 macOS 原生通知

- Hermes 任务完成时发送 macOS 原生通知
- 通知含操作按钮（"切换到会话"、"重试"）
- 使用 Tauri 通知插件，不走 Electron 那套

### 2.3 Apple 主题深度打磨

- 当前已有 Apple 主题基础色，继续深化：
  - 自适应系统深浅模式（`prefers-color-scheme`）
  - 跟随系统 accent color（accentColor CSS 变量）
  - 毛玻璃效果（`backdrop-filter: blur()` 在侧边栏、TopBar）
  - 原生滚动条样式匹配
  - 窗口 `traffic-light` 区域留白正确（macOS 窗口控制按钮区域）

### 2.4 触控板/键盘导航

- 双指滑动切换页面（侧边栏手势）
- 键盘快捷键面板（Cmd+/ 显示，类似 Linear）
  - `Cmd+N` 新会话
  - `Cmd+W` 关闭/返回
  - `Cmd+,` 偏好设置
  - `Esc` 关闭面板 / 取消
- 全键盘导航（Tab 在输入框/发送按钮/侧边栏间循环）

---

## Phase 3 — PTY 终端成为杀手特性（4~6 周）

> 当前 PTY 终端已经跑通了，但被"边缘化"了——它应该成为核心交互模式

### 3.1 终端整合进主布局

- **Split 布局**：对话区 + 终端面板水平或垂直分栏（类似 VS Code 的终端面板）
  - 默认隐藏，`Ctrl+`` 或者按钮切换
  - 可拖拽调整分栏比例
- **会话感知终端**：PTY 自动 attach 到当前 session，打开时自动 `hermes chat --resume <id>`
- **终端主题**：跟随当前界面主题（Claude Noir / Apple / Warp 三套 xterm.js 主题配色）

### 3.2 终端增强

- 终端输出搜索（xterm.js 的 search addon）
- 终端选中文本快速发送到对话区（右键 → "Send as context"）
- 终端历史记录归档（写入 SQLite，可回溯）

### 3.3 终端→对话桥接

- 在终端里看到有趣的结果，一键"Pin 到当前对话"作为 assistant 消息
- 终端里的命令输出可以直接成为 tool call 的输入上下文

**为什么做这个**：fathah 没有内嵌终端。对于"半 CLI 用户"（愿意用终端但不想记命令），在 GUI 里嵌一个漂亮的终端是巨大差异点。

---

## Phase 4 — 对话体验极致化（4~6 周）

> 把"聊天"这件事做到让用户觉得"比 ChatGPT 桌面版还好用"

### 4.1 会话搜索

- 本地 SQLite FTS5 全文索引
- Cmd+F 唤出搜索面板，模糊搜索所有历史消息
- 结果按会话分组，点击跳转到对应上下文
- 比 fathah 更快（他们是 Electron IPC 到 SQLite，我们是 native Rust 到 SQLite）

### 4.2 消息增强

- 代码块语法高亮（react-syntax-highlighter 或 shiki）
- 消息内 tab 切换（多块并行渲染，比如同时显示 text + tool call 结果）
- 消息复制菜单（hover → "复制正文" / "复制代码块" / "复制消息链接"）
- 消息收藏（⭐ 保存到本地收藏夹，独立于 Hermes session 存储）

### 4.3 输入框增强

- 输入历史（↑↓ 键翻历史）
- 多行输入自动展开（已有，继续优化动画）
- 输入草稿缓存（意外关闭窗口不丢失输入内容）
- 粘贴文件智能识别（图片→base64 / 文本→直接粘贴 / 代码→自动识别语言）

### 4.4 离线体验

- 所有历史消息本地缓存 SQLite
- 无网络时显示"离线模式"指示，仍可浏览历史
- Hermes CLI 不可用时显示优雅的降级提示（非崩溃）

---

## Phase 5 — 跨平台与发布（4~6 周）

### 5.1 CI/CD

- GitHub Actions 自动构建 macOS (dmg)
- 代码签名（macOS Developer ID）
- notarization 自动化

### 5.2 自动更新

- Tauri updater 集成
- 静默后台检查更新
- 增量更新（如果实现得当）

### 5.3 Linux / Windows

- 利用 Tauri 的跨平台能力
- Linux: AppImage 首发（flatpak 后续）
- Windows: 保持简单，不跟 fathah 拼 winget / NSIS
- **但始终优先保证 macOS 体验**—不做"一次开发所有平台都 80 分"，而是"macOS 95 分，其他平台 80 分"

### 5.4 测试覆盖

- Rust 端: 对 stream.rs（ANSI strip / decorative line 检测）写单元测试
- 前端: 对 ChatPage 的消息流状态机（think/tool/status 各状态转换）写 vitest 测试
- E2E: 可选，用 Tauri 的 e2e 框架或 Playwright

---

## 完整阶段路线图一览

```
Phase 1（当前）  →  Phase 2        →  Phase 3       →  Phase 4       →  Phase 5
                                                                          
斜杠命令图形化      macOS 原生感       PTY 终端杀手特性   对话体验极致化     跨平台 & 发布
                                                                          
┌─────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│101 模型  │     │菜单栏快捷    │     │Split 布局  │     │会话搜索    │     │CI/CD     │
│选择器    │     │全局快捷键    │     │会话感知    │     │代码高亮    │     │代码签名   │
│102 标题  │     │原生通知     │     │主题终端    │     │消息收藏    │     │自动更新   │
│编辑      │     │深色模式     │     │搜索输出    │     │输入历史    │     │Linux     │
│103 重试  │     │毛玻璃效果   │     │Pin到对话   │     │离线缓存    │     │Windows   │
│撤销      │     │键盘导航     │     │历史归档    │     │草稿缓存    │     │测试覆盖   │
│104 排队   │     │快捷键面板   │     │            │     │           │     │          │
│105 目标条  │     │           │     │            │     │           │     │          │
│106 快照   │     │           │     │            │     │           │     │          │
│107 人格   │     │           │     │            │     │           │     │          │
│108 后台   │     │           │     │            │     │           │     │          │
│109 图片   │     │           │     │            │     │           │     │          │
│110 引导   │     │           │     │            │     │           │     │          │
└─────────┘     └───────────┘     └──────────┘     └──────────┘     └──────────┘
```

---

## 跟 fathah 的差异化对照

| 维度 | 你的项目 | fathah | 谁赢 |
|------|---------|--------|------|
| 安装包大小 | ~15MB（Tauri） | ~200MB（Electron） | ✅ 你 |
| 启动速度 | 瞬时 | 1-3s | ✅ 你 |
| macOS 原生感 | 菜单栏、毛玻璃、通知 | 纯跨平台 UI | ✅ 你 |
| 内嵌终端 | PTY + xterm.js | 无 | ✅ 你 |
| 功能广度 | 精（对话+终端） | 全（16 网关+22 命令+配置） | ✅ fathah |
| 首次引导 | 三步安装引导 | 有但简单 | ✅ 持平 |
| 自动更新 | 待做 | 已有 | ✅ fathah |
| CI/CD 跨平台 | 待做 | 成熟 | ✅ fathah |
| 测试覆盖 | 无 | Vitest 套件 | ✅ fathah |
| 社区/Stars | 内部 | 3.5k stars | ✅ fathah |

**结论**：不跟 fathah 比"谁的功能多"，而是比"谁在 mac 上用得舒服"。你在 macOS 原生感和终端集成上可以打出碾压级差异。

---

## 优先级建议

```
现在就做（本周）     →   做完 Phase 1
                       + 加 License（MIT）
                       + 加 stream.rs 基础测试（2 小时）

忙完 Phase 1 后     →   Phase 2 菜单栏集成（最大回报）
                       用户第一次能 Opt+Space 唤出 Hermes 时，
                       会觉得"这是个原生 Mac app"

然后                →   Phase 3 PTY 终端
                       这是你 vs fathah 的核武器

最后                →   Phase 4 + 5
                       打磨 + 发布
```
