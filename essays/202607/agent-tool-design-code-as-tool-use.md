---
title: "主流 Agent 的 Tool 设计"
subtitle: "Code 正在进入 Agent 的更多环节"
last_updated: 2026-07-31
---

# 主流 Agent 的 Tool 设计

这篇研究的起点，其实是我在比较 Claude Code 和 Codex 的 Tool Set。

两者都是 Coding Agent，也都需要读文件、改代码和执行命令，但暴露给模型的工具并不完全一样。Claude Code 主要直接提供 Read、Edit、Write 和 Bash 等 Tool；Codex 过去给我的印象也差不多，只是文件修改使用了不同的 Patch 接口。

继续看 GPT-5.6 之后的 Codex 实现，我发现了一套仍在开发中的 Code Mode。在我看到的 5.6 系列配置中，模型顶层主要使用一个叫 `exec` 的工具。模型先生成一段 JavaScript，再在这段代码里调用 `exec_command`、`apply_patch` 等原有工具。

```text
以前：
模型 → exec_command / apply_patch → 执行工具

现在：
模型 → exec(JavaScript) → tools.exec_command / tools.apply_patch → 执行工具
```

这不是 Codex 开始生成更多用户代码，而是 Code 进入了 Codex 自己的工具系统。以前模型直接生成一个或一组 Tool Call，现在它也可以先写一段临时程序，在程序里表达循环、条件、并发和多个工具之间的依赖。

顺着这个变化继续找，我看到了 Hugging Face `smolagents` 里的 `CodeAgent`。我原来会把 `CodeAgent` 理解成“写代码的 Agent”，但它指的是另一件事：Agent 用代码来表达 Action。

这两种 Agent 都会写代码，但代码在系统里的位置不同。

```text
Coding Agent：
Agent 使用 Tool → 修改用户的代码

Code-as-Tool-Use：
Agent 生成临时代码 → 代码调用 Tool → 完成任务
```

前一种代码是任务的对象，也是最后留下来的产物。后一种代码是 Agent 完成当前任务的中间手段。任务本身不一定与软件开发有关，也可以是搜索网页、查询数据库或处理表格；任务完成后，这段临时程序可能就没有保留的必要了。

以前是 Agent 用工具写代码，现在也开始出现 Agent 写代码来使用工具。

## 四个 Agent 的 Tool Set

下面只看 Claude Code、Codex、Pi 和 `smolagents`。这不是完整的 Agent 产品比较，我关心的只是模型如何使用 Tool。

| 系统 | 常规 Tool 面 | Code 在工具系统中的位置 |
|---|---|---|
| Claude Code | `Read`、`Edit`、`Write`、`Glob`、`Grep`、`Bash`，以及 Agent 等控制型工具 | 普通模式以结构化 Tool Call 为主；Dynamic Workflows 让模型生成 JavaScript，编排大量子 Agent |
| Codex | 在部分 5.6 Code Mode 配置中，模型顶层主要看到 `exec`，原有工具作为 `tools.*` 暴露给运行时 | JavaScript 直接组织底层 Tool，表达循环、条件、依赖和并发 |
| Pi | 内置 `read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`，并允许 Extension 注册或覆盖工具 | 内置路径仍以直接 Tool Call 为主，代码主要通过 Bash 或 Extension 进入系统 |
| smolagents | `CodeAgent` 将注册的 Tool 注入 Python Executor；另有使用结构化调用的 `ToolCallingAgent` | Python 本身就是每轮 Action 的表达格式 |

Tool Set 也不是一张固定的函数列表。Claude Code 的内置 Tool 由产品提供，外部 Tool 主要通过 MCP 接入；MCP Tool 较多时，[`ToolSearch`](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search) 可以先只暴露名称，等模型搜索后再加载完整 Schema。Skill 也不是各自注入一个新 Tool，而是通过已有的 `Skill` Tool 运行。

Codex 的 [`ToolExecutor`](https://github.com/openai/codex/blob/main/codex-rs/tools/src/tool_executor.rs) 将 Tool 分成 `Direct`、`Deferred`、`DirectModelOnly` 和 `Hidden`，由运行时决定它是否直接展示给模型、等待搜索，或者进入 Code Mode。Pi 则只保留七个内置 Tool，Extension 可以通过 `registerTool()` 动态增加或覆盖它们；`smolagents` 更直接，创建 Agent 时传入的 `tools` 决定了当前 Tool Set。

四者还没有收敛成同一种设计：Codex 的 JavaScript 和 `smolagents` 的 Python 直接调用底层 Tool；Claude Code 的 Dynamic Workflows 用 JavaScript 编排子 Agent；Pi 仍保留较小的直接 Tool Set。

## 复杂的 Tool Calling

结构化 Tool Calling 并不等于一轮只能调用一个工具。Claude Code、Codex、Pi 和 `smolagents` 都允许模型在一条响应里给出多个 Tool Call，只是运行时的处理方式不同。

| 系统 | 多个调用如何表示 | 运行时如何执行 |
|---|---|---|
| Claude Code | 一条 Assistant Message 可以包含多个 `tool_use` | `Read`、`Glob`、`Grep` 等只读工具可以并发；`Edit`、`Write`、`Bash` 等修改状态的工具顺序执行 |
| Codex | Code Mode 之前已经支持在一轮中返回多个 Tool Call；旧 Prompt 也使用过 `multi_tool_use.parallel` | 允许并发的 Tool 同时执行，不适合并发的 Tool 由运行时串行化 |
| Pi | `AssistantMessage.content` 可以包含多个 `toolCall` | 当前默认并发执行；Tool 可以声明 `executionMode: "sequential"`，让整批调用顺序执行 |
| smolagents | `ToolCallingAgent` 读取一条消息里的全部 `tool_calls` | 多个调用通过 `ThreadPoolExecutor` 并行执行 |

这里描述的是批量和并发，还不是调用之间的数据依赖。同一批 Tool Call 的参数是在执行前一起生成的：即使运行时按顺序执行，后一个调用也不能使用前一个调用刚返回的结果。

传统 Agent Loop 通过新的模型轮次处理这种依赖：

```text
模型 → Tool A / Tool B → 返回结果
模型读取结果 → 生成 Tool C → 返回结果
```

依赖也可以直接写进计划格式。[LLMCompiler](https://proceedings.mlr.press/v235/kim24y.html)（ICML 2024）先生成带依赖的函数调用计划，再由调度器执行已经就绪的任务。这类 Plan / Graph DSL 可以表示静态依赖和并发，不需要先引入通用代码。

所以在不引入 Code Action 的情况下，复杂 Tool Calling 已经有两条常见路径：独立调用用一组 Tool Call 并发执行；有依赖的调用交回 Agent Loop，或者交给计划与调度器。

## Code 进入 Tool Calling

Code 并不是第一次让 Agent 能够一次调用多个 Tool。它的变化是把一部分控制流和数据流放进一段可执行的 Action：程序可以拿到 Tool 的返回值，再决定下一步调用什么。

### Codex 的 `exec`

回到 Codex。Code Mode 之前，它已经可以在一轮中生成多个 Tool Call。Code Mode 增加的不是并行本身，而是让同一个 Action 中的后续调用能够依赖运行时结果。

旧的并行调用适合一次发出一组参数已经确定的请求。`exec` 中的后续调用则可以依赖前面的返回值，也可以使用变量、条件、循环、异常处理和 `Promise.all`。区别不在调用数量，而在这些调用开始具有程序里的控制关系。

我在本地的一次 Codex Session 里找到过这样的调用：先查询失败事件，从返回的 JSON 中提取并去重 `request_id`；如果存在，再用这些 ID 查询关联日志。删去具体业务查询后，控制逻辑是：

```javascript
const first = await tools.exec_command({ cmd: failureQuery });
const rows = JSON.parse(first.output);
const ids = [...new Set(
  rows.map(row => row.request_id).filter(Boolean)
)];

if (ids.length === 0) exit();

const second = await tools.exec_command({
  cmd: buildRelatedQuery(ids)
});
text(second.output);
```

第二次调用是否发生、参数是什么，都要等第一次调用返回后才能确定。传统 Agent Loop 可以用新的模型轮次完成同一件事；这里的 JavaScript 把这段依赖留在了同一个 Action 中。

### smolagents 的 `CodeAgent`

`smolagents` 同时实现了 `ToolCallingAgent` 和 `CodeAgent`，两者都继承自同一个多步骤 Agent，主要区别在 Action 如何表达和执行。

`ToolCallingAgent` 使用模型原生的结构化 Tool Calling 接口；`CodeAgent` 则要求模型生成 Python。框架从模型输出中取出代码，交给 Python Executor，注册给 Agent 的 Tool 会成为其中可以调用的函数。

```python
results = search("Code as Action")

selected = []
for item in results:
    if item["year"] >= 2023:
        selected.append(item)

final_answer(selected)
```

`CodeAgent` 仍然只能使用明确注册的 Tool。本地 Python Executor 会限制可用的 import 和内置函数，并设置执行超时。项目也明确提醒，本地 Executor 不是安全沙箱，执行不可信代码时仍然需要隔离的远程 Executor。

### Code 作为 DSL

Code 适合处理组合逻辑会随运行结果变化的部分，例如：

- 根据第一次查询的结果，决定下一步调用哪个工具；
- 持续翻页或重试，直到满足某个运行时条件；
- 过滤和聚合中间结果，再生成后续参数；
- 按错误类型选择不同的恢复方式。

这些逻辑可以继续放在 Agent Loop 里，也可以继续扩展计划 DSL。只是步骤一多，每次决策都可能增加一次模型往返；而 DSL 要覆盖循环、分支、变量传递和错误处理，也需要继续增加语法与执行规则。

我更倾向于把代码看作一种已经成熟的 DSL。只要需要表达的核心是逻辑关系，很多时候代码就是最直接的载体，不必再设计一套新的 JSON DSL 或图结构。专用 DSL 更容易校验、审计和调度，适合边界明确、约束优先的任务；但在表达通用逻辑这件事上，代码往往更自然。

如果每一步都需要模型重新理解语义，或者每次操作都需要用户确认，逐步 Tool Calling 仍然更合适。Code 更适合那些可以在明确边界内连续执行、处理和组合的部分。

## 这不是突然出现的想法

回头看论文，让模型生成程序再交给 Runtime 执行，并不是最近才出现的做法。过去几年，不同方向反复采用了相似的结构。

| 方向 | 论文 | Code 在其中的作用 |
|---|---|---|
| 数值与符号推理 | [Program of Thoughts](https://mlanthology.org/tmlr/2023/chen2023tmlr-program/)（TMLR 2023）、[PAL](https://proceedings.mlr.press/v202/gao23f.html)（ICML 2023） | 把计算交给程序解释器 |
| 视觉任务 | [VisProg](https://openaccess.thecvf.com/content/CVPR2023/html/Gupta_Visual_Programming_Compositional_Visual_Reasoning_Without_Training_CVPR_2023_paper.html)（CVPR 2023）、[ViperGPT](https://openaccess.thecvf.com/content/ICCV2023/html/Suris_ViperGPT_Visual_Inference_via_Python_Execution_for_Reasoning_ICCV_2023_paper.html)（ICCV 2023） | 用程序组合视觉模型和 Python 函数 |
| 机器人与环境控制 | [Code as Policies](https://doi.org/10.1109/ICRA48891.2023.10160591)（ICRA 2023）、[Voyager](https://arxiv.org/abs/2305.16291)（TMLR 2024） | 生成控制策略或可复用技能 |
| 通用 Agent Action | [CodeAct](https://proceedings.mlr.press/v235/wang24h.html)（ICML 2024） | 把可执行 Python 作为 Agent 的 Action Space |

这些工作不是一条严格的演进路线。它们研究的任务不同，Code 承担的职责也不完全相同。PAL 更关心计算，ViperGPT 更关心视觉模块组合，Code as Policies 面向机器人控制。

这些工作的共同点是：模型生成程序，Runtime 执行程序，程序再调用已有的函数、模型或外部能力。

CodeAct 与这里讨论的 Code-as-Tool-Use 最接近。它直接比较了文本、JSON 和可执行 Python 这几种 Action，并尝试用 Code 统一 Agent 与不同环境的交互。`smolagents` 的 `CodeAgent` 采用了相近的设计。

## Tool 并没有消失

如果只看模型输出，很容易把变化理解为“Code 代替了 Tool Calling”。从实现看并不是这样。

在 `smolagents` 中，开发者仍然需要把 Tool 注册给 Agent。Tool 仍然有自己的名称、输入和输出，也仍然是 Agent 接触外部系统的能力边界。`CodeAgent` 的变化，是让模型除了提交结构化调用之外，还可以通过 Python 组合这些 Tool。

```text
Tool：提供原子能力
Code：组合这些能力
Runtime：执行代码并限制边界
```

MCP 也可以放在同样的位置理解。它可以负责发现和接入外部 Tool，而 Code 负责在一次任务中组织这些 Tool。二者解决的不是同一个问题。

因此，更准确的说法不是“Code 取代了 JSON Schema”，而是 Code 开始出现在 Tool 之上，承担控制流和数据处理。

## 从论文走进 Agent 系统

### 公开实现中的变化

最近，这种方式开始进入更通用的 Agent Framework 和模型 API。

除了 `smolagents`，OpenAI 和 Anthropic 都提供了 Programmatic Tool Calling，Cloudflare 将类似能力称为 Code Mode。不同实现选择的语言和 Runtime 并不一样：有的使用 Python，有的使用 JavaScript；有的在模型服务内执行，有的依赖独立沙箱。

这里还不足以得出“所有 Agent 都会改用 Code”的结论。结构化 Tool Calling 仍然是更简单、成熟的接口，特别适合单次调用、独立的批量调用和需要明确审批的操作。运行模型生成的代码还会引入沙箱、权限、超时、费用和可观测性等新问题。

但从这些论文和实现放在一起看，Code 的使用范围确实扩大了。

### 我的看法

1. Tool Interface 一定会成为模型训练的一部分。我日常使用 Codex 时，换用其他模型通常不如配套模型稳定。模型厂商提供的配套 Agent 也会越来越主流。

2. Code-as-Tool-Use 很可能成为复杂 Agent 的主流实现。Python 还是 JavaScript 不是重点。变化在于，Agent 的 Action 除了一组函数调用，也可以是一段短小、临时、受到约束的程序。

## 相关资料

- [Codex 模型配置](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json)
- [Codex Tool Exposure](https://github.com/openai/codex/blob/main/codex-rs/tools/src/tool_executor.rs)
- [Codex Code Mode](https://github.com/openai/codex/tree/main/codex-rs/core/src/tools/code_mode)
- [Codex Parallel Tool Calls](https://github.com/openai/codex/commit/dc3c6bf62ad84ab1fcb90a1907fabbae018fcdf7)
- [Claude Code Tool Reference](https://code.claude.com/docs/en/tools-reference)
- [Claude Code Agent Loop](https://code.claude.com/docs/en/agent-sdk/agent-loop)
- [Claude Code Dynamic Workflows](https://code.claude.com/docs/en/workflows)
- [Pi 内置工具与使用方式](https://pi.dev/docs/latest/usage)
- [Pi Extension](https://pi.dev/docs/latest/extensions)
- [Pi Agent Loop](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts)
- [smolagents 发布介绍](https://huggingface.co/blog/smolagents)
- [smolagents `agents.py`](https://github.com/huggingface/smolagents/blob/main/src/smolagents/agents.py)
- [smolagents `local_python_executor.py`](https://github.com/huggingface/smolagents/blob/main/src/smolagents/local_python_executor.py)
- [Anthropic Parallel Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)
- [LLMCompiler](https://proceedings.mlr.press/v235/kim24y.html)（ICML 2024）
- [CodeAct 论文实现](https://github.com/xingyaoww/code-act)
- [OpenAI Programmatic Tool Calling](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)
- [Anthropic Programmatic Tool Calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)
- [Cloudflare Code Mode](https://developers.cloudflare.com/agents/tools/codemode/)
