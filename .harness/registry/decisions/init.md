# 初始化记录

**日期**：2026-05-12
**执行**：Harness 初始化 Agent

---

## 项目概况

**项目**：hermes-desktop v0.1.0

**技术栈**：
- 前端：React 18 + TypeScript 5.5 + Vite 5，react-markdown + remark-gfm，xterm.js（PTY 终端）
- 后端：Rust 2021 Edition，Tauri 2，tokio（async），portable-pty，serde/serde_json
- 构建：`npm run tauri dev`（开发）/ `npm run tauri build`（发布）

**当前已实现**（从代码读取）：
- 多轮对话 + 流式渲染（send_message → hermes:chunk 事件）
- Think Block / Tool Call 可视化（MessageBubble）
- 会话管理侧边栏（list_sessions / delete_session）
- 状态栏基础信息（model/tokens/cost/duration）
- PTY 终端面板（pty_open/write/resize/close）

**目录结构**：
```
src-tauri/src/lib.rs     — 所有 Rust 命令（单文件，尚未拆分）
src/App.tsx              — 状态管理 + 事件监听
src/components/          — ChatView / MessageBubble / Sidebar / TopBar / TerminalPanel
src/types.ts             — TypeScript 类型
```

---

## 确认的架构约束

- 通信模型为一次性进程：`hermes chat -q <msg> --resume <id>` → stdout → 进程退出
- 无持久双向通道（C 类斜杠命令 /steer 暂缓）
- 管理类功能全部委托 hermes dashboard（localhost:9119）
- 用户确认参考设计文档：docs/hermes-desktop-product-plan-v3.md

---

## 已知风险和坑

- 项目刚起步，暂无已知坑

---

## 第一阶段范围（Phase 0，Week 1～2）

| ID | 功能 | 估时 | 验收标准 |
|----|------|------|---------|
| feat-001 | Dashboard 集成 | 3～4天 | 点击"管理"打开 iframe；进程随 app 启动/退出；依赖缺失显示引导 |
| feat-002 | Memory 编辑器 | 2～3天 | 双面板读写 MEMORY.md/USER.md；字数进度条；超限禁止保存 |
| feat-003 | 状态栏完善 | 1～2天 | 四色 Context 进度条；费用；Tool Call 步数 |
| feat-004 | 上下文压缩触发器 | 1天 | Context >70% 高亮按钮；弹出焦点输入；发送 /compress |

依赖顺序：feat-004 依赖 feat-003（进度条），其余三者无依赖关系，可并行开发。
