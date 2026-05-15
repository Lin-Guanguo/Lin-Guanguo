---
title: "AI 工作记录系统：开始记录后，我才知道 AI 提效多少"
subtitle: "用 Git、Claude Code 和 Codex CLI 让 AI 协作产出可见"
last_updated: 2026-02-25
---

# AI 工作记录系统：开始记录后，我才知道 AI 提效多少

一套 Git + Claude Code + Codex CLI 的自动化记录系统，让 AI 辅助编程的真实产出可见可量化。

## 背景

我用 Claude Code 和 Codex CLI 写代码已经有一段时间了。体感上知道"效率提升了不少"，但到底提升了多少？说不清。直到我为了写日志搭了一套自动统计系统——然后被自己的数据吓到了。

---

## 先看数据

下面是两周的对比。W07 是年前最忙的一周（春节假期前赶进度），W08 是春节假期周。两组数据放在一起更能说明问题。

**W07（年前冲刺）：**
- Git Commits：93
- 涉及项目：11 个
- Agent Sessions：100
- AI 交互时长*：~7,031 min（~117h）
- 消息总数：22,272
- 我发送的消息：1,838
- CC Tokens：194k in / 672k out (1.2B cache read)
- Codex Tokens：459.8M in / 1.8M out (443.5M cached)

**W08（春节假期）：**
- Git Commits：19
- 涉及项目：5 个
- Agent Sessions：6
- AI 交互时长*：~1,319 min（~22h）
- 消息总数：2,560

*关于时长：117 小时不是说我工作了 117 小时。我同时开着多个 session 并行工作——一个在跑测试，另一个在改另一个项目的代码——时长是所有 session 的 active duration 之和（已排除超过 60 分钟的空闲间隔）。我实际坐在电脑前的时间还是正常的工作时长，但 AI 帮我把一份时间拆成了多份。*

W07 是极端值——年前赶工，后端系统架构重构、前端工具链搭建、个人工具、AI 创作工具……11 个项目同时推进。这不是常态，但正因为是极端值，才更能暴露出 AI 协作的天花板在哪里。

而 W08 春节假期，仅仅是"顺手修了点东西"，也有 19 个 commit、5 个项目、1,319 分钟的 AI 交互。假期的"顺手"都能产出这么多，这才是让我重新审视效率的契机。

**不管是冲刺还是休闲，数据都远超没有 AI 时的产出。** 如果没有统计系统，我自己都不会意识到。

---

## 统计系统长什么样

### 三个数据源

```
scripts/
├── fetch-today-work.sh        # Layer 1: Git 改动
├── fetch-cc-sessions.py       # Layer 2: Claude Code 对话
├── fetch-codex-sessions.py    # Layer 3: Codex CLI 对话
└── claude_insights.py         # 共享库：解析、树构建、聚合
```

每个脚本产出统一的 `.work-cache/` 结构：

```
.work-cache/
├── {repo}/              # git patches + README
├── cc-sessions/         # Claude Code session 摘要 + 原始 JSONL
└── codex-sessions/      # Codex session 摘要 + 原始 JSONL
```

### Layer 1: Git 改动 — fetch-today-work.sh

最简单的一层。扫描所有 git 仓库（`~/dev/` + `~/live/`），按作者和日期过滤 commit，导出 `.patch` 文件。这是可见的"冰山水面"部分。

```bash
# 用法
./scripts/fetch-today-work.sh -d 0224     # 单天
./scripts/fetch-today-work.sh -w 9        # 整周
```

产出每个仓库的 commit 列表、统计（files/insertions/deletions）、和完整 patch 文件。

### Layer 2: Claude Code Sessions — fetch-cc-sessions.py

这是**冰山水下**的部分。大量工作只存在于 AI 对话中——技术调研、架构讨论、方案对比、bug 排查——没有 git commit，但消耗了大量时间和认知。

CC session 存储在 `~/.claude/projects/*/` 下，每个 session 是一个 JSONL 文件，消息之间通过 `parentUuid` 构成树结构（用户编辑消息会产生分支）。

提取流程：
1. **发现**：用 `mmap` 字节搜索在所有 JSONL 中快速定位含目标日期的文件
2. **解析**：构建消息树，选取最新叶节点路径（latest leaf path）
3. **分析**：从 raw 消息提取统计（tokens、tools、files、git commits）；从树路径提取 topic 和对话内容
4. **输出**：三层结构（L1 README 概览 → L2 单 session 精简 markdown → L3 原始 JSONL）

```python
# 用法
python3 scripts/fetch-cc-sessions.py -d 0224
python3 scripts/fetch-cc-sessions.py -w 9
```

### Layer 3: Codex Sessions — fetch-codex-sessions.py

与 CC 对称，但 Codex CLI 的存储结构完全不同：

- **存储**：Claude Code 在 `~/.claude/projects/*/`，Codex 在 `~/.codex/sessions/YYYY/MM/DD/`
- **消息结构**：Claude Code 是 UUID 树（有分支），Codex 是线性序列
- **工具调用**：Claude Code 内联 `tool_use` 块，Codex 独立 `function_call` 条目
- **Token 统计**：Claude Code 每条消息增量 `usage`，Codex 是累计值（取最后一条）
- **上下文压缩**：Claude Code 明文 summary，Codex 加密 JWT（不可读）

需要分别逆向两个 CLI 的存储格式，才能提取出统一的数据。

### 汇聚：日志与周报

这三个数据源汇入我的个人知识库的日志/周报系统：

**dailylog 流程：**
1. `fetch-today-work.sh` → git patches
2. `fetch-cc-sessions.py` → CC session 摘要
3. `fetch-codex-sessions.py` → Codex session 摘要
4. AI 读取摘要 → 生成结构化日志
5. 人工 review + 补充

**weeklog 流程：**
1. 聚合本周所有 daily logs
2. 重跑 `-w` 模式获取周维度统计
3. AI 生成周报 + TODO 管理

---

## 为什么数据令人震惊

### 1. AI 的工作量远超你的感知

W07 的 22,272 条消息中，我只发了 1,838 条。**AI 处理的消息量是我的 12 倍**。这些是什么？读文件、搜索代码、执行命令、写代码、跑测试——全是 AI 在自主完成。即使是假期的 W08，2,560 条消息也意味着 AI 在持续自主工作。

而且这个数字还不包括 agent session 中的 subagent（AI 自己启动的子 agent 完成独立任务）。

### 2. 不留 Git 痕迹的工作占了大头

W08 的统计显示，6 个 CC session 中只有 19 个 git commits。大量工作——VPN 协议调研、个人数据分析策略讨论、多模型对比分析——都只存在于对话中。

如果只看 git，你会以为那周几乎没干活。实际上 AI 交互了 1,319 分钟、2,560 条消息。

### 3. 并行项目数突破人类极限

一周同时推进 11 个项目——涵盖后端服务、前端工具、基础设施运维、AI 创作工具、个人工具、自动化脚本、知识库管理等——这在没有 AI 的情况下是不可想象的。每个项目的上下文切换成本接近零，因为 AI 持有完整的对话历史。

### 4. Token 消耗揭示了真实的信息处理量

W07 CC 的 1.2B（12 亿）cache read tokens 说明了什么？AI 在反复读取和理解项目代码库。459.8M Codex input tokens 也是同理。这是人类不可能达到的代码阅读量。

---

## 踩过的坑

搭建这套统计系统的过程本身也很有意思——都是在用 AI 逆向 AI 的存储格式。

### CC Session 的消息树断链

Claude Code 的消息通过 `parentUuid` 构成树，但 system/progress 消息也在链上。最初只把 user/assistant 放入索引，导致父链断裂。一个 847 条消息的 session 只解析出 4 条。

**修复**：全类型消息构建树，返回时再过滤为 user/assistant。

### mtime 骗了我

最初用文件 mtime 发现 session，但跨天 session 的 mtime 是最后修改日。2/23 的大 session 因为 2/24 继续使用了，mtime 变成 2/24，查询 2/23 时完全遗漏。

**修复**：改用 `mmap` 字节搜索日期字符串，考虑 UTC+8 时差。

### Codex 的格式进化

Codex CLI 不同版本之间的 JSONL 格式不一致——token_count 从 payload 顶层移到了 `payload.info.total_token_usage`，工具名从 `shell_command` 变成了 `exec_command`，参数键从 `command` 变成了 `cmd`。

**处理**：兼容式读取，`args.get("cmd", args.get("command", ""))`。

---

## 感想

搭建这套系统之前，我对"AI 提效"的理解是模糊的——"写代码快了"、"不用查文档了"。搭建之后，数据告诉我的是一个完全不同的故事：

**AI 不是在帮你写代码，AI 是你的 10x 团队。**

冲刺周 100 个 session、22,000 条消息、93 个 commit、11 个项目；假期周"随便搞搞"也有 6 个 session、2,560 条消息、19 个 commit。这不是"辅助"，这是一个人同时操控多个 AI agent 并行推进大量工作。人类的角色从"执行者"变成了"指挥官"——决定做什么、判断结果对不对、处理 AI 搞不定的问题。

而且这个统计系统本身也是用 AI 写的——包括逆向两个 CLI 的存储格式、解析消息树、处理时区问题、设计三层输出结构。两天时间，从零到可用。

如果你也在用 AI 编程但还没开始记录，强烈建议搭一套统计系统。不是为了炫耀数字，而是为了：
1. **理解自己的工作模式** — 哪些项目投入最多？哪些只是对话没有产出？
2. **发现被遗忘的工作** — 没有 git 痕迹的探索性工作往往被低估
3. **被数据震撼** — 当你第一次看到周报里的数字，你会重新理解"AI 提效"这四个字

当然，最后吐槽一句：**干活是快了，但活也多了。** 以前一周推一个项目觉得很充实，现在一周推 11 个项目觉得"还行吧"。效率提升的尽头不是轻松，是更多的活。

---

## 参考

- 源码：`fetch-cc-sessions.py`, `fetch-codex-sessions.py`, `fetch-today-work.sh`
- 共享库：`claude_insights.py`（JSONL 解析、消息树构建、聚合统计）
