# 当前阶段目标

**阶段**：Phase 2 — macOS 原生感
**目标**：让用户觉得「这是个真正的 Mac 应用」；同时为跨平台（Linux/Windows）兼容打好基础
**完成标准**：features.json 中 feat-201 ～ feat-206 全部 passes = true
**默认 Session 阶段**：BUILD
**当前版本**：（发布后填入）

---

## 跨平台设计原则（本阶段新增约束）

- Tauri 官方插件优先（tray/global-shortcut/notification 均三平台支持）
- 窗口级原生效果（vibrancy/acrylic）用 `#[cfg(target_os)]` 条件编译，Linux 退化为纯色
- 前端平台判断统一用 `@tauri-apps/plugin-os`，不猜 userAgent
- 路径处理统一用 Rust `dirs` crate，不写 hardcode `~/`

---

## Sprint 拆分

### Sprint 1 — 系统集成（预计 4～5 天）

| ID | 功能 | 估时 |
|----|------|------|
| feat-201 | 菜单栏托盘集成 | 2～3天 |
| feat-202 | 全局快捷键唤起 | 1天 |
| feat-203 | 原生通知推送 | 1天 |

### Sprint 2 — 界面打磨（预计 4～5 天）

| ID | 功能 | 估时 |
|----|------|------|
| feat-204 | 毛玻璃 + 主题深度打磨 | 1～2天 |
| feat-205 | 快捷键面板 | 1天 |
| feat-206 | 配置引导卡片 | 2天 |

---

## 阶段历史

| 阶段 | 完成时间 | 主要产出 |
|------|----------|----------|
| Phase 0 — 产品闭环 | 2026-05-12 | Dashboard 集成、Memory 编辑器、状态栏完善、上下文压缩触发器 |
