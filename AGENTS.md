# Hermes Desktop — Agent 工作规范

> 由 HARNESS_SETUP 生成。只包含 AI 自己推断不出来的信息。
> Session 开始/结束的行为由 Hook 系统强制执行，本文件不再重复。

---

## 产品北极星

为普通用户（不熟悉终端操作）解决 Hermes Agent 的使用门槛，目标是零配置安装、零学习曲线。
功能决策标准：苹果式直觉交互，华而不实的功能不做。

## 不可推翻的约束

- 通信模型是一次性进程：`hermes chat -q <msg> --resume <id>` → stdout → 进程退出，无持久双向通道
- 斜杠命令按此分 A/B/C 三类，C 类（/steer）当前不做
- 管理类功能（Kanban/Cron/Config/MCP 等）全部委托 `hermes dashboard` iframe，不自建
- features.json 的 passes 字段只能 false→true，禁止删条目或改描述

## 容易踩的坑

- 项目刚起步，暂无已知坑（发现后在 .harness/state/constraints.md 追加）

## 状态文件位置

| 文件 | 说明 |
|------|------|
| `.harness/SESSION_START.md` | 每次开始前必读 |
| `.harness/SESSION_END.md` | 每次结束前必做 |
| `.harness/state/current-sprint.md` | 当前阶段目标 |
| `.harness/state/features.json` | 功能完成合约，passes 只能 false→true |
| `.harness/state/constraints.md` | 已知约束，发现新的立即追加 |
| `.harness/registry/_index.md` | 决策索引，每次 Session 读最近 5 条 |
| `.harness/product/backlog.md` | 产品方向 + 需求池 + 已知约束 |
