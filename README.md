# Hermes Desktop

一个为 [Hermes Agent](https://hermes-agent.nousresearch.com) 打造的桌面 UI，基于 Tauri 2 + React。

## 功能

- **多轮对话** — 完整对话历史，自动滚动，Markdown 渲染
- **Think Block 可视化** — 折叠式思考过程展示（紫色区块）
- **Tool Call 可视化** — 工具调用输入/输出折叠展示（青色区块）
- **会话管理** — 侧边栏会话列表，切换/删除会话，自动加载 `~/.hermes/sessions/`
- **状态监控** — 顶栏实时显示模型、Token 用量、费用、运行时长
- **Terminal Noir 主题** — 深色琥珀金配色，JetBrains Mono 字体

## 前置条件

1. **安装 Hermes Agent**

   ```bash
   curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
   ```

2. **安装 Rust**（Tauri 需要）

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

3. **安装 Node.js**（>=18）

   通过 nvm、brew 或官网安装即可。

4. **安装 Tauri CLI**

   ```bash
   npm install -g @tauri-apps/cli@next
   ```

## 安装依赖

```bash
cd hermes-desktop
npm install
```

## 开发模式

```bash
npm run tauri dev
```

Vite dev server 会在 1420 端口启动，Tauri 窗口会自动打开。

## 打包发布

```bash
npm run tauri build
```

产出物在 `src-tauri/target/release/bundle/` 中。

## 架构说明

```
hermes-desktop/
├── src-tauri/          # Rust 后端
│   └── src/
│       ├── main.rs     # 程序入口
│       └── lib.rs      # 所有 Tauri 命令（spawn hermes、解析输出流）
├── src/                # React 前端
│   ├── App.tsx         # 状态管理、事件监听
│   ├── types.ts        # TypeScript 类型
│   ├── index.css       # Terminal Noir 主题样式
│   └── components/
│       ├── TopBar.tsx      # 顶部状态栏
│       ├── Sidebar.tsx     # 会话侧边栏
│       ├── ChatView.tsx    # 聊天主区域 + 输入框
│       └── MessageBubble.tsx  # 消息气泡（含 think/tool 可视化）
```

## 通信机制

每次发送消息时，Rust 层会：

1. 执行 `hermes chat -q "<message>" [--resume <session_id>]`
2. 逐行读取 stdout，剥离 ANSI 转义码
3. 状态机解析：普通文本 / think block / tool call
4. 通过 Tauri 事件 `hermes:chunk` 推送到前端
5. 前端实时更新 React 状态，渲染流式内容

## 自定义配置

在 `src-tauri/src/lib.rs` 中可以调整：

- `banner_lines`：跳过 hermes 欢迎 banner 的行数（默认 6）
- Tool call 检测的 Unicode 头字符（`◆` `▶` 等）
- Think block 的标记格式

## 常见问题

**Q: 提示 "Failed to start hermes"**
A: 确保 `hermes` 命令在 PATH 中，运行 `which hermes` 验证。

**Q: 会话列表为空**
A: 先用 `hermes chat` 跑一次，生成 `~/.hermes/sessions/` 目录。

**Q: Think block 没有正确折叠**
A: Hermes 的 think block 标记格式可能因版本不同，在 `lib.rs` 的 `send_message` 函数中调整检测字符串。
