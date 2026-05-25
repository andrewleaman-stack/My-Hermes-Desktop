# Hermes Desktop — Dashboard 主题同步方案

## 设计目标
让嵌入在 Hermes Desktop 中的 Dashboard iframe 的 CSS 视觉样式（背景色、文字色、边框色等）与 Desktop 当前主题（claude/apple/warp）保持完全一致。

## 方案选择：YAML 主题 + 插件桥接
**不修改 hermes-agent 核心代码**，通过以下三部分实现：

### 1. Dashboard YAML 主题文件（3 个）
路径：`~/.hermes/dashboard-themes/`

| 文件名      | 对应 Desktop 主题 | 描述                  |
|-------------|------------------|-----------------------|
| claude.yaml | claude           | 温暖纸面，#faf9f5 底色 |
| apple.yaml  | apple            | 系统白/蓝，#ffffff 底色 |
| warp.yaml   | warp             | 暖深色，#2b2622 底色   |

结构包含 `palette`（三层颜色）、`typography`（字体）、`layout`（圆角/密度）、`colorOverrides`（shadcn 兼容变量）。

### 2. Dashboard 插件（1 个）
路径：`~/.hermes/plugins/desktop-theme-sync/dashboard/`

- `manifest.json` — 插件声明
- `index.js` — 监听 Desktop 发来的 `postMessage({ type: "hermes-theme-sync" })`，调用 Dashboard API 切换主题

### 3. Desktop 侧修改

**前端：**
- `DashboardPage.tsx` — 通过 `postMessage` 发送 YAML 主题名到 iframe
- `SettingsPage.tsx` — 新增"Dashboard 主题"区块，带"安装"按钮
- `index.css` — 新增 `.settings-row` 等样式

**后端（Tauri Rust）：**
- `commands/dashboard.rs` — 新增 `install_dashboard_themes` command
- `lib.rs` — 注册新 command
- `tauri.conf.json` — 新增 `bundle.resources`，打包主题和插件

## 安装流程
1. 用户打开设置页面
2. 点击"安装 Dashboard 主题包"
3. Rust 从 `resources/` 复制到 `~/.hermes/dashboard-themes/` 和 `~/.hermes/plugins/`
4. 打开 Dashboard 页面，Dashboard 启动后自动加载插件
5. 切换 Desktop 主题时，iframe 收到 postMessage 并调用 API 切换为对应 YAML 主题

## 已创建的文件清单

```
~/sourceCode/hermes-desktop/
├── resources/
│   ├── dashboard-themes/
│   │   ├── claude.yaml
│   │   ├── apple.yaml
│   │   └── warp.yaml
│   └── dashboard-plugins/
│       └── desktop-theme-sync/dashboard/
│           ├── manifest.json
│           └── index.js
├── src/pages/DashboardPage.tsx    (修改: postMessage 发送 YAML 主题名)
├── src/pages/SettingsPage.tsx     (修改: 新增安装按钮区块)
├── src/index.css                  (修改: 新增 settings-row 样式)
└── src-tauri/
    ├── src/commands/dashboard.rs  (新增: install_dashboard_themes)
    ├── src/lib.rs                 (修改: 注册新 command)
    └── tauri.conf.json            (修改: bundle.resources)
```

## 打包发布说明
`tauri.conf.json` 的 `bundle.resources` 配置确保：
- `resources/dashboard-themes` → 安装包内 `dashboard-themes`
- `resources/dashboard-plugins` → 安装包内 `dashboard-plugins`

用户安装 Desktop 后，首次点击设置页面的"安装"按钮即可将主题和插件部署到 `~/.hermes/`。

## 测试验证清单
- [ ] 还原 ~/.hermes/ 为官方状态（删除 dashboard-themes 和 desktop-theme-sync）
- [ ] 启动 Desktop，进入设置页面点击"安装"
- [ ] 确认 `~/.hermes/dashboard-themes/` 出现 3 个 YAML 文件
- [ ] 确认 `~/.hermes/plugins/desktop-theme-sync/dashboard/` 出现 2 个文件
- [ ] 打开 Dashboard 页面，确认插件加载
- [ ] 切换 Desktop 主题（claude/apple/warp），确认 Dashboard 样式同步变化
