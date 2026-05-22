# 回复终端延迟显示问题复盘

日期：2026-05-22

## 问题现象

用户提交消息后，底部已经进入 Running 状态，但对话区里的 Hermes 终端回复框没有马上出现。过一段时间后，通常在 Hermes 输出了若干工具调用或正文后，终端框又会突然出现。

这个现象很容易被误判成：

- Hermes CLI 启动慢
- stdout 没有及时 flush
- Tauri invoke 阻塞了 React 渲染
- 自动滚动没有滚到底

这些方向都有一定合理性，但都不是这次的根因。

## 根因

根因是工具调用显示开关的隐藏逻辑误伤了 streaming 占位消息。

当顶部“工具调用显示”关闭时，`MessageBubble` 里有逻辑：

```ts
if (!showTools && message.blocks.every((b) => b.type === "tool")) return null;
```

新建的 Hermes streaming 回复消息一开始是：

```ts
{
  role: "assistant",
  blocks: [],
  rawOutput: "Starting Hermes...\nLaunching agent process...",
  status: "streaming"
}
```

JavaScript 里空数组调用 `every()` 会返回 `true`。所以 `blocks: []` 被误判成“纯工具消息”，整条 assistant 消息被 `return null` 隐藏，终端框也就不会出现。

## 为什么会“过一会儿又显示”

这取决于后续流式内容把消息变成了什么形态：

- 如果 Hermes 后续输出了普通正文，前端追加了 `text` block，`blocks.every(tool)` 变成 `false`，消息重新显示。
- 如果后续一直是工具调用 block，消息仍会被认为是纯工具消息，继续隐藏。
- 如果最终从磁盘重新加载历史，解析出来的消息结构发生变化，也可能让它重新出现。

所以用户看到的是“有时候快，有时候慢”，实际上是“什么时候出现第一个非 tool block”的时间不稳定。

## 排查中走偏的点

1. 过早把问题归因到 Hermes CLI 输出延迟。
   因为截图里终端框出现时已经有一批 raw output，所以很自然会把“不显示”理解为“没有 output”。但真实问题是 React 节点被条件渲染隐藏。

2. 只检查了数据写入，没有同步检查渲染分支。
   `sendToSession` 确实已经乐观插入了 assistant placeholder，但 `MessageBubble` 后面又因为 `showTools` 返回了 `null`。

3. 没有第一时间把用户设置纳入复现矩阵。
   这个 bug 只在“工具调用显示关闭”时稳定复现。默认或开启状态下表现正常，导致排查方向被 runtime/streaming 干扰。

4. 修了症状而不是先证明渲染路径。
   `rawOutput` 占位、stderr 消费、等待一次 paint、`flushSync` 都能改善一部分真实存在的体验问题，但不能解决 `return null`。

## 修复原则

工具调用显示开关只应该影响“工具详情内容”，不应该隐藏 live terminal、错误输出、空的 streaming 占位。

正确判断应满足：

- `blocks.length > 0`
- 所有 block 都是 `tool`
- 当前不是 live terminal
- 当前不是 error terminal

修复后的逻辑：

```ts
const isStreaming = isLastAssistant && message.status === "streaming";
const isLiveTerminal = !isUser && (isStreaming || message.status === "error");
const isPureToolMessage = message.blocks.length > 0 && message.blocks.every((b) => b.type === "tool");

if (!showTools && isPureToolMessage && !isLiveTerminal) return null;
```

## 以后排查同类问题的顺序

1. 先确认 state 是否存在。
   在 React DevTools 或日志中确认 `sessionMessages[sessionId]` 是否已经有 user + assistant placeholder。

2. 再确认组件是否被条件渲染隐藏。
   搜索 `return null`、`showX &&`、`display: none`、`visibility`、`opacity`、`height: 0`。

3. 再看派生状态是否一致。
   比如 `activeSessionId`、`streamingSessions`、`isLastAssistant`、`message.status` 是否在同一帧里匹配。

4. 最后再查进程、stdout、stderr、flush、IPC。
   后端流式问题会影响内容到达时间，但不应该影响本地 running 占位是否出现。

## 代码规则

- 不要用 `array.every(...)` 判断“纯某类内容”而不先判断 `array.length > 0`。
- feature toggle 只能隐藏它负责的内容层，不能隐藏承载状态反馈的外层容器。
- live/running/error 这类状态反馈优先级高于内容过滤开关。
- 对 streaming UI，先渲染本地占位，再等待远端输出；远端输出只负责更新内容，不负责决定容器是否存在。
- 排查“延迟显示”时，把用户可切换设置作为第一批复现变量。

## 相关提交

- `2e071cf fix: keep live terminal visible when tools hidden`
- `776464c fix: force optimistic terminal render`
- `7ff0026 fix: paint response terminal before invoking cli`
- `d771e8e fix: show terminal response immediately`
