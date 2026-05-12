# Hermes Desktop — 战略方向与执行路线图

> 最后更新：2026-05-12

---

## 一、核心战略

### 定位

**macOS 上最轻、最优雅的 Hermes Agent 桌面伴侣。**

不是 fathah/hermes-desktop 的克隆，而是差异化竞争——在 Electron 霸占的桌面 AI 客户端市场，用 Tauri 打一场"轻量 vs 重量"的仗。

### 北极星（不变）

为不熟悉终端操作的普通用户解决 Hermes Agent 的使用门槛。
**零配置安装、零学习曲线、苹果式直觉交互。**

### 战略原则

| 原则 | 含义 |
|------|------|
| **轻量** | Tauri 原生优势，安装包 < 20MB，启动 < 1s |
| **设计优先** | 每个 UI 细节都值得打磨，华而不实的功能不做 |
| **终端为王** | PTY 内嵌终端是核心差异化，要升格为一级交互 |
| **委托管理** | Kanban/Cron/Config/MCP 等管理功能全部交给 `hermes dashboard` iframe |
| **macOS 优先** | 先做 macOS 95 分，再做其他平台 80 分 |

---

## 二、差异化分析（你的项目 vs fathah/hermes-desktop）

| 维度 | 你的项目（Tauri） | fathah（Electron） | 胜负 |
|------|------------------|-------------------|------|
| 安装包大小 | ~15 MB | ~200 MB | ✅ 你 |
| 启动速度 | 瞬时 | 1-3s | ✅ 你 |
| 内存占用 | 低（Webview） | 高（Chromium） | ✅ 你 |
| macOS 原生感 | 菜单栏、毛玻璃、通知、traffic-light | 跨平台统一 UI | ✅ 你 |
| 内嵌终端（PTY） | 已有（portable-pty + xterm.js） | 无 | ✅ 你 |
| 功能广度 | 聚焦对话+终端 | 16 网关/22 命令/配置管理 | ✅ fathah |
| 跨平台打包 | 待完善 | dmg/AppImage/deb/rpm/exe/winget | ✅ fathah |
| 自动更新 | 待做 | 已有（electron-updater） | ✅ fathah |
| 社区规模 | 内部项目 | 3.5k stars / 418 forks | ✅ fathah |
| 测试覆盖 | 无 | Vitest 套件 | ✅ fathah |
| 开源许可 | 无 | MIT | ✅ fathah |

**结论**：不跟 fathah 比功能多，只比 macOS 上用着舒服。在 macOS 原生感和终端集成两个方向上，你可以打出碾压级差异。

---

## 三、产品路线图（5 个 Phase）

### Phase 1 — 斜杠命令图形化（当前进行中）

> 目标：features.json 中 feat-101～110 全部完成

| Sprint | 功能 | 说明 |
|--------|------|------|
| **Sprint 1** | 101 模型选择器 | TopBar 下拉，provider 分组搜索 |
| | 102 会话标题编辑 | 侧边栏内联编辑 |
| | 103 消息快捷操作 | 重试/撤销悬停按钮 |
| | 104 排队发送 | agent 运行时输入可排队 |
| | 110 首次引导 | 三步安装/配置/开始引导 |
| **Sprint 2** | 105 目标条 | goal 全状态图形化 |
| | 106 快照时间线 | snapshot + rollback 面板 |
| | 107 人格选择器 | 人格卡片弹层 |
| | 108 后台任务面板 | 后台任务轮询面板 |
| | 109 图片/附件 | 拖拽/粘贴输入 |

**完成标志**：用户不需要记任何斜杠命令。

---

### Phase 2 — macOS 原生感（Phase 1 后启动）

> 目标是让用户觉得"这是个真正的 Mac 应用"

#### 2.1 菜单栏集成
- 系统菜单栏图标 + 点击展开快速对话（类似 MacGPT、BoltAI）
- 全局快捷键 `Opt+Space` 从任何位置唤出
- 菜单栏图标颜色指示 Hermes 状态（idle/thinking/error）

#### 2.2 macOS 原生通知
- 任务完成推送原生通知
- 通知含操作按钮（切换到会话 / 重试）
- 利用 Tauri 通知插件

#### 2.3 Apple 主题深度打磨
- 自适应 `prefers-color-scheme`（系统的深色/浅色模式）
- 跟随系统 accent color
- 侧边栏/TopBar 毛玻璃（`backdrop-filter: blur()`）
- traffic-light 区域自适应间距

#### 2.4 键盘导航
- 快捷键面板（Cmd+/ 调出，类似 Linear）
- `Cmd+N` 新会话 / `Cmd+W` 关闭面板 / `Cmd+,` 偏好 / `Esc` 取消
- 全 Tab 导航：输入框 ↔ 发送 ↔ 侧边栏循环

---

### Phase 3 — PTY 终端升格（核心差异化）

> 当前终端是"弹层面板"——要变成"一级交互模式"

#### 3.1 Split 分栏布局

```
┌──────────────────────────────────────────────┐
│  TopBar                                       │
├──────────┬──────────────────────┬─────────────┤
│          │                      │  ┌────────┐ │
│  侧边栏   │    对话区域          │  │ Terminal│ │
│          │                      │  │ (可拖拽) │ │
│          │  [用户消息]          │  │         │ │
│          │  [Hermes 回复]       │  │ $ hermes│ │
│          │  [Tool Call...]      │  │ chat -q │ │
│          │                      │  └────────┘ │
│          │  ┌──────────────┐   │             │
│          │  │ 输入框 [发送] │   │             │
│          └──────────────────────┴─────────────┤
├──────────────────────────────────────────────┤
│  底部状态条                                    │
└──────────────────────────────────────────────┘
       ↑                ↑              ↑
    当前布局       主体保持不变       新增分栏
                                   默认折叠，快捷键展开
```

- 默认终端折叠，显示标签 `>_ Terminal`
- 快捷键 `` Ctrl+` `` 或点击标签展开
- 可拖拽分界调整宽度（min 200px / max 50%）

#### 3.2 会话感知终端

当前问题：终端打开是独立的 Hermes 会话，跟当前对话没关联。

| 场景 | 当前行为 | 会话感知后 |
|------|---------|-----------|
| 在会话 A 对话 | 终端打开新会话 B | 终端自动 `--resume 会话A` |
| 切换到会话 B | 终端不变/关掉重开 | 终端自动跟随切换 |
| 终端里跑了 `ls` | 输出只在终端里 | 可选 "Pin 到对话" 作为上下文 |
| Hermes 执行 tool call | 看不见实时执行过程 | 可在终端面板同步显示输出 |

#### 3.3 设计细节
- 三套终端主题色（Claude Noir / Apple / Warp），与界面主题联动
- xterm.js search addon 终端内搜索
- 终端输出历史归档（写入 SQLite，可回溯搜索）

#### 3.4 典型用况

**开发者调试**：
对话里 Hermes 分析 bug，右侧终端里同时手动跑测试验证，两边对照。

**半 CLI 用户**：
让 Hermes 在对话里写命令，它在终端里自动执行，用户在旁边看输出——不用复制粘贴。

**深度用户**：
终端始终展开，对话区只做回顾和搜索，两边并行不干扰。

---

### Phase 4 — 对话体验极致化

> 比 ChatGPT 桌面版更好用的聊天体验

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 会话搜索 | SQLite FTS5 全文索引，Cmd+F 模糊搜索所有历史 | ★★★ |
| 代码高亮 | react-syntax-highlighter / shiki 对代码块染色 | ★★★ |
| 消息收藏 | 星标收藏独立于 Hermes session 存储 | ★★ |
| 输入历史 | ↑↓ 键翻历史输入 | ★★ |
| 草稿缓存 | 意外关闭不丢失输入框内容 | ★★ |
| 离线浏览 | 无网络/无 Hermes CLI 时仍可浏览历史 | ★★ |
| 消息复制菜单 | hover → 复制正文/代码块/消息链接 | ★ |

---

### Phase 5 — 发布与跨平台

| 项目 | 说明 |
|------|------|
| CI/CD | GitHub Actions 自动构建 macOS dmg |
| 代码签名 | Apple Developer ID + notarization |
| 自动更新 | Tauri updater 集成 |
| License | MIT（现在就做） |
| 测试覆盖 | Rust: stream.rs 单元测试 / 前端: ChatPage 状态机测试 |
| Linux | AppImage（优先级次之） |
| Windows | 保持简单（优先级最后） |

---

## 四、完整路线图一览

```
Phase 1 (当前)      Phase 2            Phase 3              Phase 4           Phase 5
斜杠命令图形化       macOS 原生感       PTY 终端杀手特性      对话极致化          发布 & 跨平台
                                                                             
┌──────────┐      ┌───────────┐     ┌──────────┐        ┌──────────┐      ┌──────────┐
│ 模型选择器 │      │ 菜单栏集成   │     │ Split 布局 │        │ 会话搜索   │      │ CI/CD     │
│ 标题编辑   │      │ 全局快捷键   │     │ 会话感知   │        │ 代码高亮   │      │ 代码签名   │
│ 重试/撤销  │      │ 原生通知    │     │ Pin到对话  │        │ 消息收藏   │      │ 自动更新   │
│ 排队发送   │ ──▶  │ Apple主题   │ ──▶ │ 终端搜索   │ ──▶  │ 输入历史   │ ──▶  │ License    │
│ 首次引导   │      │ 毛玻璃效果   │     │ 历史归档   │        │ 离线缓存   │      │ 测试覆盖   │
│ 目标条     │      │ 快捷键面板   │     │ 三套主题色  │        │ 草稿缓存   │      │ Linux/Win  │
│ 快照时间线  │      │            │     │           │        │           │      │           │
│ 人格选择器  │      │            │     │           │        │           │      │           │
│ 后台任务   │      │            │     │           │        │           │      │           │
│ 图片附件   │      │            │     │           │        │           │      │           │
└──────────┘      └───────────┘     └──────────┘        └──────────┘      └──────────┘
```

---

## 五、建议立即执行的事项（不等 Phase 1 做完）

| # | 事项 | 耗时 | 理由 |
|---|------|------|------|
| 1 | **加 MIT License** | 5 分钟 | 别人不敢用不敢贡献 |
| 2 | **stream.rs 加测试** | ~2 小时 | 两个函数（strip_ansi + is_decorative），改了 3 次都没测 |
| 3 | **README 写清差异点** | ~30 分钟 | 第一段说明"这不是 fathah 克隆，是 macOS 原生伴侣" |
| 4 | **追加 constraints.md** | ~10 分钟 | 当前为空，把已知架构约束写进去 |
| 5 | **更新 Backlog 产品方向** | ~15 分钟 | 补充方向 A 定位，让 AI Agent 下次 Session 自动遵循 |

---

## 六、跟 fathah 的正面 vs 错位竞争对照

```
你赢的战场（fathah 做不到）          你暂时输的战场（让 fathah 赢）
─────────────────────────────        ─────────────────────────────
✅ Tauri 原生轻量（15MB vs 200MB）     ❌ 功能广泛度（16 网关 vs 无）
✅ macOS 菜单栏集成                    ❌ 跨平台成熟度
✅ 内嵌 PTY 终端                       ❌ 自动更新
✅ 设计品位（三套主题系统）              ❌ 社区规模（3.5k stars）
✅ 启动速度（瞬时 vs 几秒）              ❌ 测试覆盖
✅  macOS 原生通知和毛玻璃               ❌ CI/CD 成熟度

策略：不追对方的短板，把长板打到极致。
用户选择你的理由不是"你功能多"，而是"在 Mac 上用着舒服"。
```

---

## 七、Split + 会话感知终端详细设计（附录）

> 给开发参考

### 7.1 当前架构

```
用户发送消息
    ↓
Rust: Command::new("hermes") → stdout reader
    ↓ 逐行解析
Rust: emit("hermes:chunk", ...) → 前端
    ↓
React: ChatPage 状态机 → MessageBubble 渲染
```

### 7.2 Split 布局架构变更

```
新增组件结构：

ChatPage
  ├── TopBar
  ├── Sidebar
  ├── content-area (flex row)
  │   ├── main-area (对话区域，flex:1)
  │   │   ├── ChatView
  │   │   └── InputArea
  │   └── TerminalPanel (新增，默认折叠)
  │       ├── TerminalToolbar (标签 + 搜索 + Pin按钮)
  │       ├── xterm.js 实例
  │       └── ResizeHandle (拖拽分界)
  └── BottomBar (状态)
```

### 7.3 会话感知逻辑

```
用户切换 session
    ↓
ChatPage 通知 TerminalPanel
    ↓
TerminalPanel 检查当前 PTY session_id
    ↓
不同？→ 关闭旧 PTY → pty_open(session_id=new_id)
相同？→ 不做任何事

Pin 到对话:
  终端选中文本 → 右键 "Pin to Chat"
    → 触发 Rust: pin_to_chat(text, session_id)
    → Rust 发起新的 hermes chat -q "用户 pin 的上下文" --resume session_id
    → 以系统消息或 user 消息注入对话流
```

### 7.4 依赖项

- 前端 Split 布局：纯 CSS Grid，无需额外库
- 拖拽分界：原生 `onMouseDown` 事件，或 5KB 内的轻量库
- xterm.js 搜索：已依赖（`@xterm/addon-search`）
- 终端主题色：需为 xterm.js 定义三套 Terminal.theme 配置

---

*本文件由 Hermes Agent 在 2026-05-12 与用户讨论后整理生成。路线图应在每个 Phase 完成时更新。*
