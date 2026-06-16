---
title: 'Agent 领域的新"Loop"热潮（又是哪来的词）'
subtitle: "从 the Karpathy Loop 到 Loop Engineering：2026 年两波\"循环\"热潮的来龙去脉"
last_updated: 2026-06-16
---

# Agent 领域的新"Loop"热潮（又是哪来的词）

## 一句话结论

这个"Loop"不是单一概念，而是 2026 年涌现的**两波相互呼应、来源不同**的新热词。都**不是**经典 agentic while-loop / ReAct，而是把"循环"重新定义成**人类设计的、用来驱动 agent 的外层系统**。

| | 时间 | 名字 | 一句话 | 关键人物 |
|---|---|---|---|---|
| 第一波 | 2026-03 | **the Karpathy Loop** / "loopy era" | 让 agent 在约束下**自主跑实验、自我改进** | Andrej Karpathy |
| 第二波 | 2026-06 | **Loop Engineering** / "Loopcraft" | 人不再逐轮 prompt agent，而是**设计那个 prompt agent 的系统** | Boris Cherny、Peter Steinberger、Addy Osmani |

共享的范式转变：**人从"逐轮 prompt 的操作者"变成"loop 的设计者"。**

## 第二波：Loop Engineering（6 月刷屏的主线）

概念脉络（谁说了什么）：

1. **Peter Steinberger**（`@steipete`，OpenClaw 作者）— 导火索。2026-06-07 X 帖（约 2.2M 浏览；6-8 另一帖约 6.5M）："你不该再 prompt 你的编码 agent，而应该去设计那个 prompt 你 agent 的 loop"。
2. **Boris Cherny**（Anthropic，Claude Code 负责人/创建者）— 另一引爆点。金句（约 6-9 经 `@Av1dlive` 剪辑传播）："I don't prompt Claude anymore. I have loops that are running... My job is to write loops."（我已不 prompt Claude，是 loop 在 prompt 它、决定干什么，我的工作是写 loop）。Fortune：他已 8 个月没手写代码；2025-12 曾称不开 IDE 提交 259 个 PR。
3. **Addy Osmani**（Google）— 正式命名者。2026-06-07/08 博客把模式命名为 **"Loop Engineering"**，定义："replacing yourself as the person who prompts the agent. You design the system that does it instead."。强调 inner/outer 两层嵌套：人设计 outer loop（决定做什么），agent 跑 inner loop（按 spec 干活）。
4. **Latent Space / AINews**（2026-06-12）— 整合命名 **"Loopcraft（堆叠 loop 的艺术）"**，归功于 Steinberger + Cherny + Karpathy 三人。金句："未来一个世纪的整个游戏，就是尽可能高效地 stack loops"；区分"往下走一层 loop"（出问题时为可靠性）与"往上走一层 loop"（随模型变强为杠杆）。

精确定义：一种**编排模式（orchestration pattern）**，把编码 agent 从交互式助手变成自主、长时运行的"软件工人"，四类构件（The New Stack 凝练；Osmani 原文 5–6 项：automations/worktrees/skills/sub-agents/memory 等）：

- 定时/自动触发（scheduled execution / automations）— loop 自己发现要干的活
- 隔离工作区（isolated workspaces，常为 git worktree）— 多 run 并行不打架
- 校验 agent（verifier / sub-agent）— 第二个 agent 检查第一个的产出
- 持久化状态（写文件）— 让明天的 run 接续今天

区分：**loop ≠ cron job** —— "cron 跑固定脚本；loop 跑一个会读状态、自选下一步动作的模型"。

## 第一波：the Karpathy Loop / "loopy era"（3 月，自我改进线）

- 起点：Karpathy 2026-03 初开源 **`autoresearch`**（约 630 行脚本），让 AI agent 自主跑 ML 实验。
- 命名：分析师 **Janakiram MSV** 在 The New Stack 称之为 **"the Karpathy Loop"**；Karpathy 本人在 No Priors 播客叫 AI 的 **"loopy era"**。
- 三要素（Fortune 逐字）：① agent 可修改的**单一文件**；② **单一、可客观测量**的优化指标；③ 每次实验**固定时限**。对应 autoresearch：编辑单个 `train.py`、优化 `val_bpb`、固定 5 分钟 wall-clock。
- 标志性实证：nanochat（GPT-2 训练代码）上连续跑约 2 天、约 700 次实验，发现约 20 项真实优化，更大模型上约 11% 训练提速（2.02h → 1.80h 达 GPT-2 质量）。Karpathy 该帖约 8.6M 浏览。
- Karpathy 判断："所有前沿 LLM 实验室都会这么做……这是最终 boss 战，做它只是工程问题，而且一定会成。"

## 与经典 agentic loop 的区别

| | 经典 agentic loop / ReAct | 新"Loop" |
|---|---|---|
| 循环在哪 | agent **内部** while-loop（think→act→observe） | 人设计的**外层**系统 |
| 人的角色 | 写 prompt、给 context，全程握着工具逐轮交互 | 设计 loop，让系统自己去 poke agent |
| 谁决定下一步 | 人，每一轮 | loop：自己发现工作→分派→校验→记状态→决定下一步 |
| 类比 | 你在开车 | 你在造一条会自己跑的流水线 |

The New Stack 给出一条谱系（**该作者特有修辞，非共识**）：prompt → context → harness → loop engineering（称"不到 18 个月走完"）。另有文章给出 ReAct → AutoGPT → Ralph loop → /goal 的不同谱系。

## 实践含义与落地

- 工作流转变：从"逐轮 prompt"到"写 loop"，Cherny 是活样本（数月不手写代码、靠 loop 批量提 PR）。
- 落地构件：定时/自动化触发 + git worktree 隔离 + verifier/sub-agent 校验 + 状态持久化文件。
- 工具苗头：`cobusgreyling/loop-engineering`（loop-audit / loop-init / loop-cost 等 CLI，自述受 Osmani 和 Cherny 启发）——目前最接近"Loop 框架"的东西，落地的是新概念而非同名商业产品。
- ⚠️ 采用规模存疑：证据主要是名人工作流自述 + X 热度，缺量化采用数据，因此对"是否已成主流实践"应保持谨慎。

## 重要提醒 / 争议

1. 术语严重重载：务必分清 (a) Karpathy Loop / loopy era（3 月，自主实验/自我改进）与 (b) Loop Engineering / Loopcraft（6 月，人设计的编排外层）。共享"自主循环"直觉但非同一物，资料常混用。
2. 常见误传："you stop being the person who prompts... and start being the person who designs the system that prompts it" 常被当作 Steinberger 原话，实为 Osmani 的转述/框架措辞——论点没错，归属有出入。
3. 职称小瑕疵：Cherny 普遍称"Claude Code 负责人/创建者"，正式内部职级为 Member of Technical Staff。
4. 过度演绎要警惕：有二手站把新 Loop 定义成 "observe-plan-act-reflect 四阶段"，或直接与 "harness engineering" 划等号——这属于二手站的过度演绎，本文未采用。
5. 批评声音："Loop Engineering 不过是戴帽子的 cron job / 换皮营销"，质疑新颖性；以及长时自主 loop 的 runaway token / 成本失控风险。批评者不否认上述人物确实提出了这套框架。

## 待解问题

- 除编码 agent 外，Loop Engineering 在生产/企业的真实采用规模与成功率？目前缺量化数据。
- Karpathy Loop（3 月，自我改进）与 Loop Engineering（6 月，人设计编排）之间是作者明确建立的概念继承，还是同期独立涌现、被 Loopcraft 事后串联？
- 长时自主 loop 的预算/熔断/安全护栏有无成型最佳实践或工具？
- 是否已出现以"Loop"命名的具体产品/框架/创业公司（而非设计模式）？现有证据主要指向设计模式与话语。

## 主要信源

- 一手：[Steinberger X 原帖](https://x.com/steipete/status/2063697162748260627) · [karpathy/autoresearch (GitHub)](https://github.com/karpathy/autoresearch) · [Addy Osmani 博客](https://addyosmani.com/blog/loop-engineering/)
- 媒体/分析：[Fortune: Karpathy Loop](https://fortune.com/2026/03/17/andrej-karpathy-loop-autonomous-ai-agents-future/) · [The New Stack: Loop Engineering](https://thenewstack.io/loop-engineering/) · [Latent Space: Loopcraft](https://www.latent.space/p/ainews-loopcraft-the-art-of-stacking) · [NextBigFuture: loopy era](https://www.nextbigfuture.com/2026/03/andrej-karpathy-on-code-agents-autoresearch-and-the-self-improvement-loopy-era-of-ai.html)
- 其他：[Av1dlive X 帖（Cherny 剪辑）](https://x.com/Av1dlive/status/2064321381953675599) · [cobusgreyling/loop-engineering (GitHub)](https://github.com/cobusgreyling/loop-engineering)
