---
title: "模型厂商亲自下场做 Agent 编排"
subtitle: "从 Claude Code ultracode 和 Codex Ultra 的实际体验说起"
last_updated: 2026-07-22
---

# 模型厂商亲自下场做 Agent 编排

最近我开始用 Codex GPT-5.6-sol 的 Ultra 模式，最明显的感受就是：它特别喜欢起 subagent，而且非常主动。

任务稍微复杂一点，它就自己拆成好几个方向，叫一批 subagent 分头去查、去改、去验证，然后 root agent 再回来汇总。复杂一点的需求，轻轻松松跑几个小时，甚至跑一晚上。

这个体验和我之前用 Claude Code ultracode 很像。Claude 也是疯狂起 subagent，而且不是我手动要求它这么做，是它自己觉得该拆就拆。

这件事让我觉得有点意思。因为 Multi-Agent 并不是什么新东西，市面上早就有大量带 Planner、Researcher、Coder、Reviewer 的框架。但我以前看这些东西，总觉得花架子成分更多：架构图画得很漂亮，角色也分得很细，实际效果往往还不如直接换一个更聪明的模型，让它用单 Agent 从头做到尾。

这一次的体验明显不一样。Claude 和 Codex 的 subagent 不只是制造“很多 Agent 正在工作”的热闹，它们确实开始改善复杂任务的覆盖范围和最后的结果。

## 我之前更相信 Single-Agent

几个月前，我专门研究过 Single-Agent 和 Multi-Agent 的取舍。当时看了 Cognition 的 *Don't Build Multi-Agents*，也看了 Berkeley 那篇分析 Multi-Agent 失败模式的 MAST 论文。那时候我比较认同的结论是：能用一个 ReAct Agent 从头做到底，就不要拆成多个。

原因也很直接。单 Agent 看得到完整上下文，知道自己前面做了什么、为什么这么做。拆成几个 Agent 之后，中间就要传话。很多时候传过去的只是一段任务描述或者最终总结，真正重要的判断过程反而丢了。

Cognition 当时举过一个很典型的例子：两个 subagent 分别去做同一个游戏的背景和角色。两边单独看都完成了任务，但它们对整体风格的理解不一样，最后根本拼不到一起。很多实际任务也一样，Agent 的行动里包含了大量没有被明确写出来的判断。

而且模型本来就没有聪明到哪里去，再让一个不太聪明的模型去管理一群同样不太聪明的模型，效果通常不会更好。MAST 总结出来的那些问题——上下文丢失、Agent 之间理解不一致、不会验证、不知道什么时候结束——也都是真问题。

所以当时 Single-Agent 更好，并不只是因为架构简单。它少了一层模型之间的解释，也就少了一层信息损失和错误累积。

## 为什么现在开始有效

但现在好像过了一个坎。

首先是模型本身已经足够强了。它不只是能干活，也开始会判断什么任务适合拆、怎么拆、结果靠不靠谱。模型先成了一个不错的执行者，现在又开始能当 manager。

其次是我们给 Agent 的任务越来越大。以前可能只是改一个函数，现在会直接让它调研整个仓库、做方案、实现、补测试，再找几个角度 review。所有事情都塞给一个 Agent 串行做，上下文和时间自然会不够用。

还有一个很重要的变化，就是模型厂商开始亲自做协调层。以前的 Multi-Agent 大多是第三方框架在模型外面套一层角色和消息传递；现在 Claude 和 Codex 会把模型、工具、上下文、并发和 runtime 一起做。

我一开始想把这个变化描述成“模型能力已经快到上限了”，后来觉得不太准确。模型本身还在继续变强。真正开始碰到上限的，是单 Agent 的纵向扩展：同一个上下文不可能无限装下调研、决策、实现和验证，单线程也没法获得并行能力。

以前是协调几个 Agent 的成本，比它们并行干活的收益还大。现在模型更强了，任务也更大了，官方又把协调成本压了下来，这个平衡点可能正在变化。

## Claude 和 Codex 做了什么

| 维度 | Claude Code Fable 5 ultracode | Codex GPT-5.6-sol Ultra |
|---|---|---|
| 核心机制 | Dynamic Workflow，模型生成 plan-as-code | 原生 agent loop，模型主动调用协作工具 |
| 编排形式 | 显式 JavaScript workflow | 不生成脚本，边做边决定如何委派 |
| 决策时机 | 先生成 workflow，再交给 runtime 执行 | 根据执行结果持续拆分、跟进和汇总 |
| reasoning | `xhigh` | API 实际发送 `max` |
| Ultra 的作用 | 开启最高推理强度，并主动使用 Workflow tool | `max` reasoning 加一段主动委派的 developer prompt |
| subagent 调用 | `agent()`、`parallel()`、`pipeline()` | `spawn_agent`、follow-up、message、wait、interrupt |
| 中间状态 | workflow 变量、阶段和运行记录 | root agent 上下文与协作状态 |
| 本地 runtime | 校验并执行 workflow，管理并发和恢复 | 管理 Agent 生命周期、消息、并发和上下文继承 |
| 实现透明度 | Claude Code 闭源，只能从二进制和运行产物观察 | Codex 开源，可以直接看到 Ultra 的模式分支 |
| 共同点 | 强主 Agent 动态创建临时 subagent，不是预设角色互相群聊 | 强主 Agent 动态创建临时 subagent，不是预设角色互相群聊 |

## 为什么可能还得是模型厂商

所以我现在有个比较主观的看法：Multi-Agent 这件事，还得是模型厂商自己下场做。

第三方框架当然也能做调度、做角色、做消息传递，但它控制不了模型到底会不会拆任务，也控制不了模型能不能看懂另一个 Agent 的结果。很多框架可以把系统图画得非常漂亮，却没办法让模型真的学会协作。

模型厂商能做的事情更多一点。它可以一起调整模型的行为、reasoning effort、工具怎么描述、上下文怎么继承、subagent 怎么通信、失败之后怎么恢复。更重要的是，它可以在自己的评测里知道这些改动到底有没有提高结果，然后同时改模型和 runtime。

至少从我目前的体验看，这种方式确实比以前市面上的 Multi-Agent 框架好很多。以前更像是框架作者提前安排好几个角色，让模型按照组织图工作；现在更像是一个很强的主 Agent，手里多了一组随时可以调用的 worker。任务怎么拆，不是框架作者提前决定，而是模型看着当前情况自己决定。

当然，这也不代表 Agent 越多越好。小任务拆开肯定是浪费；几个 Agent 同时改一块代码，也还是很容易打架。以前说的上下文丢失、重复劳动和验证困难都没有消失。

只是这些问题现在不一定会把 Multi-Agent 的收益全部吃掉了。

## 还有几个问题

这还只是我最近使用和看实现之后形成的一个判断，有不少地方我也不确定：

- 这次体验变好，到底主要是因为模型变强，还是因为官方 runtime 做得好？
- Multi-Agent 真正的收益主要是并行，还是把不同工作隔离到不同上下文里？
- 这件事是不是必须由模型厂商完成，第三方框架还有多少空间？
- subagent 越起越多之后，质量提升能不能覆盖 token 和时间成本？
- Claude 的 workflow-as-code 和 Codex 的边做边调度，最后哪种会更可靠？

但至少从最近的产品变化来看，Multi-Agent 正在从框架作者设计的组织图，变成顶级模型可以主动调用的一种原生能力。

**不是一群小 Agent 开会，而是一个足够强的 Agent 在调度额外算力。**

## 相关资料

- [Cognition — Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)
- [MAST — Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657)
