---
title: "从模型调用到生产级 Agent：Vibe Coding 之外的工程实践"
subtitle: "从一次模型调用出发，讨论控制流、运行时、生产服务、可观测、评测与 AI 友好的开发体系"
last_updated: 2026-07-27
---

# 从模型调用到生产级 Agent：Vibe Coding 之外的工程实践

现在做一个 Agent Demo 已经很容易了。

准备一个 API Key，让编码 Agent 写几十行代码，模型就能对话、调用 Tool，甚至自己规划下一步。继续通过 Vibe Coding 追加需求，很快还能得到多步骤流程、状态保存、流式输出和一个看起来不错的界面。

真正困难的部分通常在 Demo 之后：执行中断了能否恢复，多个实例如何协调，线上问题能否还原，新版本是不是真的更好，以及半年后 AI 和人还能不能安全地维护这套系统。

过去一段时间，我参与开发过两种形态不同的 Agent：一个是基于 Python 和 LangGraph 的有状态长任务服务，另一个是基于 Go 和 Eino Compose 的短 Workflow。它们让我越来越确定一件事：

> 写出一个 Agent，可能只需要几十行代码；让它安全、稳定地运行几个月，需要的是完整的软件工程。

这篇文章不讨论如何训练模型，也不试图罗列所有 Agent 概念。它沿着一个 Agent 从 Idea 到生产系统的真实演进过程，讨论什么时候该使用框架、框架解决什么、框架之外还缺什么，以及 Vibe Coding 最容易替我们悄悄造出哪些不完整的轮子。


## 第一章：Agent 从一个函数开始

### 1.1 用 Python 完成一次模型调用

先不引入 Agent 框架。下面这段 Python 代码通过 OpenAI SDK 调用一个 OpenAI-compatible 模型服务，发送一条消息并返回模型生成的文本。服务可以直接来自模型厂商，也可以经过 LiteLLM 等统一网关。运行前配置 `OPENAI_BASE_URL`、`OPENAI_API_KEY` 和 `OPENAI_MODEL`；密钥只保存在环境变量或密钥系统中。

```python
import os

from openai import OpenAI


client = OpenAI(
    base_url=os.environ["OPENAI_BASE_URL"],
    api_key=os.environ["OPENAI_API_KEY"],
)


def ask_ai(prompt: str) -> str:
    response = client.chat.completions.create(
        model=os.environ["OPENAI_MODEL"],
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content or ""


print(ask_ai("用一句话解释什么是 Agent。"))
```

OpenAI SDK 负责发起请求，网关根据 `model` 将请求路由到实际的模型服务。调用链路很简单：

```text
Python 函数 → OpenAI SDK → 模型网关 → 模型
```

文本进去，模型生成的文本出来，这就是一次完整的 AI 调用。从程序结构上看，`ask_ai` 仍然只是一个普通函数，模型是函数内部的远程依赖。

OpenAI SDK 也支持图像生成。改用图像生成接口并选择对应的图像模型，就可以用类似的方式生成图片。

### 1.2 当一个函数逐渐不够用

单次调用适合分类、摘要、改写和一次性生成。业务复杂后，一个函数往往会开始承担更多职责：

- 按照多个步骤理解、生成和校验。
- 根据中间结果选择不同分支。
- 调用搜索、数据库和其他外部服务。
- 保留中间状态，支持多轮交互。
- 在某个步骤失败后重试或恢复。

这些逻辑仍然可以继续写在普通函数里，但控制流、状态和错误边界会越来越难以管理。当一个函数演变成多步骤、有状态的程序时，就需要 Workflow 和 Agent 框架来显式组织它。

参考资料：[OpenAI API Quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)、[LiteLLM Getting Started](https://docs.litellm.ai/)。


## 第二章：图执行与控制流选择

> **不要造轮子**
>
> 完成一次模型调用后，如果在 Vibe Coding 中继续追加“再加一步”、“再加一个分支”、“保存状态”和“失败后恢复”，AI 很容易沿着当前函数继续堆代码，最后无意中重新实现一套不完整的 Workflow / Agent Runtime。当问题开始涉及多步骤、分支、状态和恢复时，应先识别它已经进入框架的能力边界，优先使用成熟框架。Python 项目可以考虑 LangGraph，Go 项目可以考虑 Eino；具体选择还要看团队技术栈、状态模型和运行时需求。

### 2.1 从多步骤函数到 Graph

业务变复杂后，一次模型调用会演变成多个步骤。例如，先生成文本，再判断是否需要图片：

```python
def generate_content(user_input):
    text = generate_text(user_input)
    image = generate_image(text) if need_image(text) else None
    return {"text": text, "image": image}
```

函数本身没有问题。但步骤、分支、循环和中间状态继续增加后，执行结构就会隐藏在嵌套的函数和条件语句中。

将同一段逻辑表示成图，控制流会更直接：

```text
START → 生成文本 → 是否需要图片？
                         ├─ 是 → 生成图片 → END
                         └─ 否 → END
```

图将程序拆成 Node，用 Edge 和 Branch 表达转移，并由 Runtime 推进执行。Node 仍然可以是普通函数，也可以调用模型或外部服务。

LangGraph 和 Eino Compose 都提供了这类图编排能力：

```text
LangGraph     StateGraph → add_node  → add_edge / add_conditional_edges → compile
Eino Compose  NewGraph   → Add*Node  → AddEdge / AddBranch             → Compile
```

我在一个内容生成服务中使用的就是这种形态：用 Eino Compose 组织“生成文本 → 按需生图”的短 Workflow。

### 2.2 Workflow 与 ReAct

Graph 描述程序如何执行，但没有规定“下一步由谁决定”。Workflow 和 ReAct 可以看作控制权的两端，中间还有程序与模型共同控制的 Hybrid Agent：

| 模式 | 下一步由谁决定 | 适合场景 | 框架入口 |
| --- | --- | --- | --- |
| Workflow | 程序和预定义边 | 流程明确、结果可约束的业务 | LangGraph `StateGraph` / Eino Compose `Graph` |
| Hybrid Agent | 程序固定边界，模型在局部规划、路由或选择 Tool | 路径部分明确，但仍需要动态决策的任务 | LangGraph / Eino Compose 自定义 Graph |
| ReAct | 模型根据当前消息和 Tool 结果 | 路径难以预先枚举的开放任务 | LangChain `create_agent` / Eino ADK `ChatModelAgent` |

ReAct 的核心是一个模型与 Tool 之间的循环：

```text
Model → 是否调用 Tool？
          ├─ 是 → Tool → 结果返回 Model
          └─ 否 → END
```

LangChain `create_agent` 和 Eino ADK `ChatModelAgent` 封装了这个循环。开发者主要提供 Model、Tool 和运行选项，不需要自己编写每一条循环边。

ReAct 将大量控制权交给模型，因此也最容易超出业务预期。模型不仅可能偏离当前目标；连接文件系统、Shell 和网络等 Tool 后，意外决策还可能变成真实操作。

ReAct 的循环轮数和 Tool 调用路径也更难预估，因此 Token、延迟和成本的波动通常比固定 Workflow 更大。

Hybrid Agent 本质上仍是一类 Workflow，但没有唯一的结构。程序定义执行骨架和能力边界，模型在局部完成规划、路由或决策。Plan-and-Execute 是常见实现，也可以组合模型路由、结果评审和重试等模式。它比固定 Workflow 更灵活，又比 ReAct 更受约束，执行过程也更容易观测、测试和控制。

Workflow、Hybrid Agent 和 ReAct 不是从低到高的成熟度阶段，而是不同的控制流选择。主要区别是业务路径能否提前定义，以及模型可以决定多少执行过程。

下面两个案例展示了这种不可预期性：客服 Agent 偏离当前订单场景，主动延续了历史 RAG 话题；通用 Agent 则借助文件系统和执行工具，自主搭建了游戏服务器与内网穿透。它们既体现了 ReAct 的通用性，也说明需要限制 Tool 权限、工作目录、执行预算和人工确认边界。

### 2.3 LangGraph 与 Eino 的框架分层

以 LangGraph 为底层的 Python 生态和 Eino 都覆盖了图编排与高层 Agent 模式，但分层方式不完全相同。可以先建立一个近似映射：

| 抽象层 | Python 主线 | Go 主线 |
| --- | --- | --- |
| 自定义 Graph / Workflow | LangGraph | Eino Compose |
| 高层 ReAct Agent | LangChain `create_agent` | Eino ADK `ChatModelAgent` |

LangGraph 是 State-first 的图运行时，重点是共享 State、状态转移和可持久执行。LangChain `create_agent` 在它之上预制了模型与 Tool 的循环。

Eino Compose 更强调 Go 类型化 Input / Output 和组件数据流；Eino ADK 则提供 `ChatModelAgent`、Runner 和常见 Agent 协作模式。Compose 与 ADK 可以组合，但不是同一套图 API 的上下层封装。

本文后续会继续对照两种实现：LangGraph 的有状态 Graph 与自建 Run Service，以及 Eino Compose 的类型化短 Workflow。

参考资料：[LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)、[LangChain Agents](https://docs.langchain.com/oss/python/langchain/agents)、[Eino Overview](https://www.cloudwego.io/docs/eino/overview/)、[Eino: Agent or Graph?](https://www.cloudwego.io/docs/eino/overview/graph_or_agent/)。


## 第三章：Agent 代码设计

### 3.1 控制流：Node、Edge、Branch 与 Loop

框架首先解决的是“哪一步在什么时候执行”。

| 概念 | 解决的问题 | LangGraph | Eino Compose |
| --- | --- | --- | --- |
| Node | 将复杂任务拆成可独立执行的步骤 | 普通 Python 函数 + `add_node` | Component / Lambda + `Add*Node` |
| Edge | 表达确定的执行顺序 | `add_edge` | `AddEdge` |
| Branch | 在运行时选择下一步 | `add_conditional_edges` / `Command` | `AddBranch` |
| Loop | 重复执行，直到满足退出条件 | 条件边返回前序 Node | Branch 返回前序 Node，形成有向环 |

下面这段经过简化的 Eino Compose 代码直接对应了这些概念：

```go
func BuildGraph(ctx context.Context) (compose.Runnable[*GenerateInput, *GenerateOutput], error) {
	g := compose.NewGraph[*GenerateInput, *GenerateOutput]()
	textNode := NewTextNode()
	imageNode := NewImageNode()

	if err := g.AddLambdaNode("text", compose.InvokableLambda(textNode.Invoke)); err != nil {
		return nil, err
	}
	if err := g.AddLambdaNode("image", compose.InvokableLambda(imageNode.Invoke)); err != nil {
		return nil, err
	}
	if err := g.AddEdge(compose.START, "text"); err != nil {
		return nil, err
	}
	if err := g.AddBranch("text", newImageBranch()); err != nil {
		return nil, err
	}
	if err := g.AddEdge("image", compose.END); err != nil {
		return nil, err
	}

	return g.Compile(ctx, compose.WithGraphName("content_generation"))
}
```

`AddLambdaNode` 注册文本和图片两个 Node，`AddEdge` 定义固定顺序，`AddBranch` 根据文本结果决定进入生图节点还是直接结束，最后 `Compile` 将图变成可执行的 `Runnable`。

Node 不需要对应每个小函数。适合成为 Node 的通常是一个有明确输入输出，并且需要独立观测、测试、重试或路由的业务步骤。

分支应当尽量只负责路由，不要在路由函数里同时完成大量业务逻辑。循环则必须有明确的退出条件和步数上限，避免模型决策导致无限执行。

在另一个长任务 Agent 中，我把 Planner、Coordinator、Capability 和等待人工输入等步骤显式建模为 LangGraph Node。Graph 变复杂了，但每一步的责任和实际执行路径反而更清楚。

### 3.2 数据流：State、Input / Output 与 Message

控制流决定“执行哪一步”，数据流决定“这一步能看到什么”。

| 框架 | 核心数据模型 | Node 执行 | Fan-in |
| --- | --- | --- | --- |
| LangGraph | 共享 State | 读取 State，返回 Partial State Update | 并行 Node 的 Update 由 Reducer 聚合到 State，下游再读取聚合后的 State |
| Eino Compose | 类型化 Input / Output | 上游 Output 沿 Edge 传给下游 Input，Compile 时检查类型对齐 | 多个 Output 通过 Map Merge 或 Field Mapping 组成下游 Input |

LangGraph 虽然可以定义 Graph 的 Input / Output Schema，但它们只是对外调用边界：Input 初始化 State，Output 从最终 State 中筛选字段。Graph 内部仍然通过 State Update 传递数据，Edge 不传递独立的 Node Output。

Eino 的 Fan-in 需要同时解决“何时执行”和“如何合并”。确定性 DAG 可使用 `AllPredecessor`，等待所有前驱完成；上游通过 `WithOutputKey` 生成不同 Map Key，由框架合并后传给下游。使用 Eino Workflow 时，还可以把多个上游字段显式映射到下游 Struct。

Message 表达模型对话、Tool Call 和 Tool Result。LangGraph 常用 `MessagesState` 和 Message Reducer 管理，Eino 使用 `schema.Message` 或 ADK `[]*schema.Message`。调用模型前，只应从当前数据中选择必要信息组装成 Message，不要把全部 State 直接放进 Prompt。

参考资料：[LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)、[Eino 编排设计理念](https://www.cloudwego.io/docs/eino/core_modules/chain_and_graph_orchestration/orchestration_design_principles/)。

### 3.3 运行时设施：Checkpoint、Interrupt、Stream 与 Callback

Graph Runtime 除了推进 Node，还需要处理执行快照、暂停恢复、过程输出和扩展钩子。

| 概念 | 解决的问题 | LangGraph | Eino |
| --- | --- | --- | --- |
| Checkpoint | 保存可恢复的执行快照 | Checkpointer 按 Thread 和 Super-step 保存 State | Compose / ADK 提供 `CheckPointStore` 接口，存储由业务实现 |
| Interrupt | 暂停执行，等待确认或补充输入 | `interrupt()` + `Command(resume=...)` | Compose `Interrupt` / ADK Interrupt + Resume |
| Stream | 在最终结果之前持续输出文本片段、State 和业务事件 | `stream` / `astream`，支持 values、updates、messages 和 custom | Compose Stream；ADK AgentEvent |
| Callback | 统一注入日志、Trace、Metric 和用量统计 | Runnable Callback / LangSmith Tracing | `callbacks.Handler`，支持 Start、End、Error 和 Stream Hook |

Checkpoint 不是 Memory。它保存的是执行快照，而不是经过挑选、适合未来检索的长期信息。

Checkpoint 也不能自动保证副作用只执行一次。Interrupt 或失败恢复时，当前 Node 可能被重新执行，所以外部写操作仍然需要幂等保护。

这些能力解决的仍是 Graph / Agent 一次执行内的问题。Run 元数据、后台任务、队列、Worker 和多实例控制属于更外层的 Agent Service，是下一章的主题。

### 3.4 为什么要使用框架

LangGraph 和 Eino 的核心图运行时并不只能编排 AI。Node 可以调用模型，也可以执行普通程序；框架负责的是节点调度、状态推进和暂停恢复等通用 Workflow 能力。

框架的价值不只是把函数组织成图，而是让控制流、数据流、Tool、Checkpoint、Interrupt、Stream 和 Callback 运行在同一套 Runtime 中。这些设施共享执行语义和扩展点，组合起来也更稳定。

控制流显式化后，也更容易生成 Graph 可视化、查看实际执行路径，并围绕 Node 做局部调试。

完成第一章的最小函数后，如果继续通过 Vibe Coding 逐项增加循环、状态、事件、暂停恢复和流式输出，AI 通常会沿着现有代码直接补实现。功能可能暂时可用，但很容易无意中重新实现一套不完整的 Agent Runtime。

| 层级 | 主要实现内容 |
| --- | --- |
| Framework Runtime | Graph 调度、状态推进、Tool 执行、Stream、Callback、Checkpoint 和 Interrupt / Resume |
| Agent 业务代码 | Input / State Schema、Node、Tool、路由规则和业务策略 |
| Agent Service | Run 生命周期、API、权限、Queue / Worker 和集群运行 |

尽量使用框架已有的能力。准备自己实现一项设施前，先了解框架是否已经提供，以及如何使用和扩展；确认不能满足需求后，再决定是否自行实现。

参考资料：[LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)、[LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)、[LangGraph Streaming](https://docs.langchain.com/oss/python/langgraph/streaming)、[Eino Orchestration Design Principles](https://www.cloudwego.io/docs/eino/core_modules/chain_and_graph_orchestration/orchestration_design_principles/)、[Eino Stream Programming Essentials](https://www.cloudwego.io/docs/eino/core_modules/chain_and_graph_orchestration/stream_programming_essentials/)、[Eino Callback User Manual](https://www.cloudwego.io/docs/eino/core_modules/chain_and_graph_orchestration/callback_manual/)、[Eino Interrupt & CheckPoint](https://www.cloudwego.io/docs/eino/core_modules/chain_and_graph_orchestration/checkpoint_interrupt/)。


## 第四章：从 Agent 程序到生产服务

### 4.1 Thread、Run 与暂停恢复

一个 Graph 能在本地运行，不等于已经是生产 Agent 服务。这里先使用两个概念：

| 概念 | 含义 |
| --- | --- |
| Thread | 跨多个 Run 保存历史和状态的持久容器 |
| Run | 从 Input 或 Resume 开始，到 Completed、Failed、Cancelled 或 Interrupted 的有限执行 |

```text
Thread
  ├─ Run 1 → Completed
  ├─ Run 2 → Completed
  └─ Run 3 → Interrupted
             └─ Resume → Run 4 → Completed
```

普通多轮对话通常由一个 Thread 串联多个 Run。每次用户输入启动一个 Run，Run 结束后释放 Worker，历史和状态由 Thread 保留。

Checkpoint 保存执行快照，Interrupt 暂停执行，Resume 从快照继续：

```text
Run 执行
  → Interrupt
  → 保存 Checkpoint，释放 Worker
  → 等待用户确认或补充输入
  → Resume
  → 从 Checkpoint 继续
```

LangGraph 使用 `thread_id` 和 Checkpointer 保存状态。Eino 支持 Checkpoint 和 Interrupt，但 `CheckPointStore`、对话历史和 Thread 需要业务持久化。普通对话不需要用 Interrupt 表示每轮结束，它主要用于审批、缺失参数和人工决策。

```text
读取 Thread 历史与状态
  → 组装本轮 Context / Messages
  → 执行一次 Runner / Graph
  → 保存消息和结果
  → 结束本轮 Run
```

### 4.2 Run Service：状态与操作

在一个基于 LangGraph OSS 的长任务 Agent 中，我在 Graph Runtime 之外实现了一层 Run Service：

```text
API → RunService → Background Task → LangGraph Runtime
```

| 职责 | 一种实现方式 |
| --- | --- |
| Run 元数据 | PostgreSQL `RunRecord` 保存状态、Metadata 和更新时间 |
| 生命周期 | 状态机管理 Running、Interrupted、Completed、Failed、Cancelled |
| Graph 状态 | PostgreSQL Checkpointer 保存 LangGraph 执行快照 |
| 服务操作 | Start、Resume、Cancel、Recover、Rollback、Fork 和 Timeline |

Run Service 不执行具体 Node，而是管理一次执行的生命周期，再将任务交给 LangGraph Runtime。

### 4.3 Queue、Worker 与集群控制

这个服务当前通过 Pod 内的 `asyncio.Task` 执行 Run。集群中的 Cancel 请求不一定落到持有 Task 的 Pod，因此使用 Redis Pub/Sub 广播控制信号，再由目标 Pod 取消本地任务：

```text
Cancel API → Redis Pub/Sub → 目标 Pod → Local Task
```

PostgreSQL CAS 防止多个实例同时 Resume，Checkpoint 支持故障恢复；Redis Stream 推送实时事件，PostgreSQL Event 保存历史记录。Checkpoint 外部化后，Run 可以在一个 Pod 执行，再由另一个 Pod 恢复；Worker 可以持有执行期间的临时状态，但不应持有无法恢复的唯一状态。

状态外部化不等于把每个 Node 拆成独立微服务。Agent 的 Graph 会随业务频繁调整，过度拆分会增加接口和部署成本，也会降低 Workflow 的迭代灵活性。

完整的异步执行服务通常会进一步拆分：

```text
Client
  → API Server / Run Service
  → Run Record / Durable Queue
  → Worker
  → Eino / LangGraph Runtime
  → Event / Checkpoint / Result
```

| 层级 | 主要职责 |
| --- | --- |
| Framework Runtime | Node 调度、State 推进、Tool 执行、Stream、Checkpoint、Interrupt / Resume |
| Run Service | Run 元数据和状态机、API、Cancel、Recover、查询与 Timeline |
| Queue / Worker | 后台执行、并发上限、优先级、租约、心跳、故障接管和积压治理 |

这套实现已经支持跨实例控制，但还没有 Durable Queue；Redis Stream 在这里承载过程事件，不是 Run Queue。任务规模继续增长后，可以再引入 MQ 和独立 Worker。LangGraph Agent Server 已经提供类似设施；只使用 LangGraph OSS 或 Eino 时，则需要在框架之外建设。

另一个同步、短生命周期的 Eino Workflow 则不需要这套外层设施。生产能力也应该按真实复杂度增加，不必让每个 Agent 从第一天就拥有同一套架构。

参考资料：[LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[LangGraph Agent Server](https://docs.langchain.com/langsmith/agent-server)、[Agent Server Runs](https://docs.langchain.com/langsmith/runs)、[Agent Server Threads](https://docs.langchain.com/langsmith/use-threads)、[Eino Memory and Session](https://www.cloudwego.io/docs/eino/quick_start/chapter_03_memory_and_session/)。


## 第五章：可观测与故障排查

### 5.1 Log、Metric 与 Trace

Agent 的一次运行可能包含多个 Node、Model 和 Tool 调用。只记录最终输出，无法说明中间发生了什么。

| 信号 | 简单理解 | 主要用途 |
| --- | --- | --- |
| Log | 每一次具体操作留下的明细记录 | 查看某次 Run 的参数、返回值、状态和错误 |
| Metric | 按时间聚合的数值 | 观察成功率、延迟、Token、成本和队列积压 |
| Trace | 由多个 Span 组成的一次请求调用树 | 查看父子调用、耗时和失败位置 |

结构化 Log 可以使用稳定的 `event_type` 表达关键生命周期，例如 `step_failed` 和 `model_completed`。这类 Log 适合重建 Run Timeline；调试文本、连接池信息和错误栈则是普通 Log。

**小提示：结构化日志。** 字段应作为键值参数传入，不要先拼成一整句文本，这样 SLS 才能直接按 `run_id`、`model` 等字段查询。

```go
logger.InfoContext(ctx, "model_completed",
	slog.String("run_id", runID),
	slog.String("model", model),
	slog.Int64("duration_ms", elapsed.Milliseconds()),
)
```

```python
logger = structlog.get_logger()
structlog.contextvars.bind_contextvars(run_id=run_id)
logger.info("model_completed", model=model, duration_ms=elapsed_ms)
```

Go 可以通过 `context.Context` 传递链路信息，并由结构化日志组件统一补充公共字段；Python 可以在请求或 Run 入口绑定 `contextvars`，让后续 Log 自动携带相同上下文。

以一次模型调用完成为例，同一件事可以同时产生三类信号：

```text
Log     → 写入 model_completed，记录 run_id、model、Token、耗时和返回摘要
Metric  → 调用次数 +1，并更新耗时和 Token 统计
Trace   → 结束 Model Span，并与上层 Node Span 关联
```

在 LLM 领域，最值得优先落地的是两份具体记录：

| 领域记录 | 归类 | 主要价值 |
| --- | --- | --- |
| Run Trace | Trace：以 Run 为根 Span，下面挂载 Node、Model 和 Tool Span | 输入 `run_id` 即可还原执行过程，快速定位问题 |
| LLM Call Record | 结构化 Log；在 Trace 中同时对应一个 Model Span | 分析 Token 和成本，支持 Replay、评测和数据沉淀 |

LLM Call Record 在可观测语境中可以算作 Log，但它比普通调试日志更稳定，更像一份调用明细或审计记录。它包含模型、参数、Message、Tool Call、返回值、Token、耗时和请求 ID。

Log 描述的是逐条明细记录，不代表数据只能保存到日志平台。LLM Call 元数据可以进入 Trace 和 SLS 用于在线排查；如果要长期用于 Replay、评测或训练，则可以用 `llm_call` 表保存索引和元数据，用对象存储或数据湖保存完整 Message 和返回值。这些数据不应依赖 Log 或 Trace 的采样和保留周期；经过授权、脱敏、质量筛选和去重后，可以沉淀为评测集或训练样本。

我在一个生产内容服务中将模型调用明细先写入数据库，再定期同步到数据仓库。这样不仅能排查单个失败 Case，也能分析线上结果分布。例如，更换模型后固定 Benchmark 可能全部通过，但线上文本却整体变短；保留 Prompt、返回值、Token、耗时和业务结果后，才能发现这种分布漂移。

结构化 Log 也可以作为数据收集入口，由 Consumer 将不同类型的记录分别写入 SLS、Metric 系统或独立存储。

Eino 可以通过 `callbacks.Handler` 在组件的 Start、End、Error 和 Stream 阶段统一采集信号，例如统计具名 Lambda Node 的调用量和耗时。LangGraph / LangChain 也可以通过 LangSmith 或 OpenTelemetry 记录 Trace。

Prompt、Message、Tool 参数和返回值可能包含隐私数据。默认应当记录元数据，对原文做脱敏、采样和权限控制。

### 5.2 Run Timeline 与全链路 ID

结构化 Log 和 Trace 需要共用关联 ID，才能还原一次完整执行。Metric 则使用服务、Workflow、Node 和模型等公共维度对齐整体趋势。

```text
thread_id
└─ run_id
   ├─ step_id
   │  └─ attempt_id
   ├─ model_call_id → provider_request_id
   └─ tool_call_id

run_id       ↔ trace_id
step / call  ↔ span_id
```

`run_id` 是业务排查的主入口，`trace_id` 是可观测系统生成的技术链路。两者需要互相记录，但不需要合并成同一个概念。

一条最小可用的 Run Timeline 至少覆盖以下结构化日志：

```text
run_started
step_started / step_completed / step_failed
model_started / model_completed
tool_started / tool_completed
run_interrupted / run_resumed
run_completed / run_failed / run_cancelled
```

每条日志记录时间、类型、状态、关联 ID 和必要摘要。排查时先按时间重建 Timeline，定位第一个异常记录，避免把后续的连锁失败当成根因。

### 5.3 SLS 自动查询、Replay 与根因定位

故障排查应当从 Run 记录开始，SLS 用于查找详细证据，不用日志反推业务状态。

```text
输入 run_id
  → 查询 Run 状态
  → 重建 Timeline
  → 定位第一个异常 Step
  → 根据 step_id / call_id 查询 SLS
  → Replay
  → 输出根因和证据
```

SLS 查询可以做成可复用的排查工具：根据服务、环境、Run 时间范围和关联 ID 生成字段查询，再逐层下钻到 Step、Model 或 Tool。查询模板应当限定时间范围和返回数量，不让模型无约束地搜索整个 Logstore。

Replay 依赖前面保留的 LLM Call Record，用来回答“相同输入在另一个环境中会发生什么”：

| 方式 | 做法 | 用途 |
| --- | --- | --- |
| 结果回放 | 使用已记录的 Model / Tool 返回值继续执行 | 隔离排查解析、Node 和 Workflow 问题 |
| 请求重放 | 使用原始 Message、Tool Schema、模型和参数重新请求 | 比较模型、Prompt、代码或服务商的差异 |

Checkpoint 还可以固定上游状态，只重跑目标 Node，避免每次都从 Graph 起点执行。对于概率性问题，可以对同一输入重复请求重放：如果经常失败，应当作为稳定问题处理；如果极难复现，则需要权衡是否值得为低频边界 Case 增加 Prompt 和流程复杂度。

请求重放不保证结果完全一致。有外部副作用的 Tool 应当使用 Mock、沙箱或幂等键，避免重复写入真实系统。

一份有用的根因结果只需要说清四件事：第一个失败点、相关证据、影响范围和修复建议。如果证据不足，应当保留未知项，不由模型补全根因。

### 5.4 Go 与 Python 的可观测技术栈

Log、Trace 和 Metric 不需要强制使用同一套 SDK。需要统一的是字段语义和关联 ID，例如 `run_id`、`step_id`、`model_call_id` 和 `trace_id`。

| 能力 | Go | Python |
| --- | --- | --- |
| Log | `log/slog` 或 Zap | `structlog` + 标准 `logging` |
| Trace | OpenTelemetry、`otelgin`、`otelhttp`、`otelgorm`；Eino Callback 补充 Agent Span | OpenTelemetry SDK 及 FastAPI / HTTPX Instrumentation；LangSmith 可选 |
| Metric | `prometheus/client_golang` | `prometheus-client` |

在实际项目中，这几套系统很容易分别接入，却没有形成统一语义。更完整的做法是以 Framework Callback 为 Agent 采集入口，将结构化 Log、OpenTelemetry Span 和 Prometheus Metric 与同一组链路 ID 关联起来。

```text
Framework Callback
  ├─ Structured Log → SLS / 独立存储
  ├─ OpenTelemetry Trace → ARMS
  └─ Prometheus Metric → 监控与告警
```

可观测解决“这次 Run 发生了什么”，不直接回答“Agent 是否真的变好了”。后者需要将 Run 产物进入测试和评测闭环。

参考资料：[LangSmith Observability](https://docs.langchain.com/oss/python/langchain/observability)、[LangSmith Observability Concepts](https://docs.langchain.com/langsmith/observability-concepts)、[Eino Callback & Trace](https://www.cloudwego.io/docs/eino/quick_start/chapter_06_callback_and_trace/)、[OpenTelemetry Go](https://opentelemetry.io/docs/languages/go/)、[OpenTelemetry Python](https://opentelemetry.io/docs/languages/python/)、[OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)、[Go slog](https://pkg.go.dev/log/slog)、[structlog](https://www.structlog.org/)、[Prometheus Go Client](https://prometheus.io/docs/guides/go-application/)、[Prometheus Python Client](https://prometheus.github.io/client_python/)、[SLS 查询语法](https://help.aliyun.com/zh/sls/query-syntax/)。


## 第六章：如何判断 Agent 真的变好了

### 6.1 Test：Agent 程序是否正确

Test 检查程序是否满足明确约束。测试失败时，代码不应发布。

Agent 的自然语言输出存在不确定性，测试不应断言它必须生成某句固定文本，而应断言稳定的程序事实：

- 输入输出是否符合 Schema。
- 是否进入正确的 Branch，选择正确的 Tool。
- Tool 参数、State Update 和错误类型是否正确。
- Loop 是否在步数上限内结束。
- Interrupt / Resume、Retry 和 Checkpoint 是否符合预期。

| 层级 | 测试对象 | 常见做法 |
| --- | --- | --- |
| Node Test | 单个 Node、路由函数、Parser 或 Tool | 直接调用，使用 Fake Model / Tool，断言契约和不变量 |
| Graph Test | 多个 Node 的路径、State 和恢复语义 | 使用内存 Checkpointer 和固定模型返回，调用编译后的 Graph |
| Scenario Test | 一个完整用户场景 | 从用户输入运行到最终状态，检查结果、关键路径和副作用 |

Scenario Test 和 Eval 可以使用相同的案例。前者检查必须通过的硬性条件，后者对质量进行评分和对比。

Frozen Response Replay 可以将历史 Model / Tool 返回值注入测试，让 Node 和 Graph Test 可以稳定重复，同时不产生真实调用成本。只有需要验证模型、凭证、Schema 和网络集成时，才使用真实模型运行 Integration Test。

LangGraph 编译后的 Graph 可以整体调用，也可以单独调用 `graph.nodes` 中的 Node。Eino 中底层 Component / Lambda 直接用 `go test` 测试，编译后的 `Runnable` 用于 Graph Test。

### 6.2 Eval：Agent 结果是否足够好

Test 通过只能说明 Agent 没有违反明确约束。Eval 需要先定义“好”的标准，再在一批固定案例上测量质量。

不要让测试 Case 和质量标准只存在于产品或开发人员的脑中。至少将 Input 固化为文件或 Dataset，将期望的结果写成 Reference、Rule 或 Rubric，AI 才能自动批量执行并比较结果。

Dataset 是评测的基础。它可以先从少量人工案例、真实用户场景和历史失败开始：

| 字段 | 内容 |
| --- | --- |
| Input | 用户输入、必要 Context 和运行环境 |
| Reference | 参考结果、必须满足的条件或预期路径，可以为空 |
| Metadata | 场景、难度、用户群、语言和失败类型等分组标签 |

Agent 不只需要评价最终文本：

| 维度 | 回答的问题 | 示例 |
| --- | --- | --- |
| Outcome | 最终任务是否成功 | 输出是否完整，外部系统是否真的产生了目标结果 |
| Process | 执行过程是否合理 | Tool 选择、参数、调用顺序、Retry 和停止时机 |
| Performance | 付出的代价是否可接受 | 延迟、Token、调用次数和成本 |

一个 Case 可以同时使用多种 Evaluator：

| 方法 | 适合的问题 | 特点 |
| --- | --- | --- |
| Code / Rule | Schema、必填字段、Tool 路径、禁止词、延迟和成本阈值 | 便宜、稳定，应当优先使用 |
| LLM Judge | 正确性、完整性、指令遵循、风格和路径合理性 | 能处理语义问题，但结果也存在偏差和波动 |
| Human | 主观质量、高风险结果和 Judge 难以决定的案例 | 最接近业务判断，但成本高，适合抽样和校准 |

LLM Judge 需要明确 Rubric，固定 Judge Model 和版本，并输出分数与理由。比较两个 Release 时，可以隐去版本信息做 Pairwise 判断，再定期用人评检查 Judge 是否仍与业务标准一致。

同一 Case 的结果可能每次不同。重要场景需要重复运行，同时看平均质量和成功的稳定性，不用单次得分代表整个 Agent。

### 6.3 Release：新版本是否真正更好

只记录代码 Commit 不足以复现 Agent 行为。一个 Agent Release 至少需要确定 Graph / Agent 代码、Prompt、Model 与参数、Tool Schema、Policy 和运行配置。

将某个 Release 在一个 Dataset 上完整运行一遍，得到一次 Experiment。新旧版本应当使用相同 Dataset、运行条件和 Evaluator：

```text
Dataset
  ├─ Baseline Release  → Experiment A
  └─ Candidate Release → Experiment B
                             ↓
                  逐 Case 对比质量、成本和延迟
```

每条评测结果至少关联 `case_id`、`release_id`、`run_id` 和 `evaluator_version`，这样一个分数才能追溯到具体输入、Agent 行为和评分标准。

发布门禁不应只看总平均分，还要检查：

- Test 全部通过，关键场景没有回归。
- 新版本在目标质量上更好，或者至少不更差。
- Token、成本和延迟没有超出可接受范围。
- 失败 Case 已经按场景和根因分类，而不是被平均分掩盖。

实际发布可以分成三层验证：固定 Case 的离线评测检查已知能力，线上流量的影子回放检查模型、Prompt 或代码是否明显劣化，灰度或 A/B 再判断真实业务指标是否改善。

离线 Eval 通过后，仍需要通过灰度或 A/B 观察真实用户的任务成功、反馈、延迟和成本。线上失败、差评和新出现的边界场景再进入 Dataset，成为下一版的 Regression Set：

```text
线上 Run / 用户反馈
  → 筛选典型成功与失败 Case
  → 加入 Dataset
  → 修复并产生 Candidate Release
  → 离线 Experiment
  → 灰度 / A/B
  → 继续收集线上信号
```

参考资料：[LangGraph Test](https://docs.langchain.com/oss/python/langgraph/test)、[LangChain Agent Test](https://docs.langchain.com/oss/python/langchain/test)、[LangSmith Evaluation Concepts](https://docs.langchain.com/langsmith/evaluation-concepts)、[LangSmith: Evaluate a Complex Agent](https://docs.langchain.com/langsmith/evaluate-complex-agent)、[OpenAI: Working with Evals](https://developers.openai.com/api/docs/guides/evals)、[Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)、[Eino Overview](https://www.cloudwego.io/docs/eino/overview/)。


## 第七章：Agent 开发指南

### 7.1 构建一个 AI 友好的仓库

AI 友好的仓库不只让 AI 能读懂代码，还要让它能找到正确流程、执行常用操作，并验证执行结果。原则上，仓库内的开发、测试、排查和运维操作都应该能由 AI 完成，人只需要描述目标、查看结果并做必要决策。

| 内容 | 作用 |
| --- | --- |
| `AGENTS.md` / `CLAUDE.md` | 说明仓库结构、开发规则、权限边界和验证命令 |
| `ARCHITECTURE.md` | 作为经过人工确认的系统设计入口，说明核心边界、数据流和关键决策 |
| Skills | 将启动、开发、测试、排障和 Replay 等任务固化为可重复工作流 |
| API / CLI / Script | 将手动点击和临时命令变成稳定的可执行入口 |
| Test / Log / Timeline / Metric | 让 AI 根据证据判断操作是否成功 |

一个 Skill 至少说清何时使用、需要哪些前置条件、执行什么命令、如何验证，以及失败后如何排查。复杂命令尽量封装成脚本，Skill 负责选择和组织流程。对于结果难以用代码直接断言的任务，可以由脚本负责执行、Skill 提供验收规则，再由 AI 判断结果。

文档需要有明确索引和可信入口。核心架构文档应由人确认准确性；面向具体操作的详细文档可以主要服务于 AI，但代码和流程变化后必须同步更新。仓库外还可以提供 Bootstrap 指引，先完成 Git、运行环境、权限和 Clone，再由仓库内的 Skills 接管后续操作。

我在自己的 Agent 仓库里建立了这类体系：开发 Skill 覆盖环境启动、API、测试、Benchmark、故障注入、Metric 和排障；Replay Skill 负责模型调用重放；诊断 Skill 将真实 Case 排查收敛成固定步骤。

配套的 Dashboard 是面向人的结果查看入口：可以按 `run_id` 搜索 Run，查看状态、实时 Event、Timeline、Checkpoint 和 Fork Tree，也可以触发 Cancel、Recover 和 Rollback。这些能力同时通过 Agent API 暴露，Dashboard 只是可视化客户端；AI 可以调用同一套 API 完成操作，人负责查看过程和结果。

```text
用户提出任务
  → AI 选择 Skill
  → 调用 API / CLI / Script
  → 获取 run_id 和运行结果
  → 查询 Timeline / Log / Metric
  → 返回结论与证据
```

Skills 也是仓库的一部分。API、脚本和开发流程变化时，对应 Skill 需要同步更新和验证。

### 7.2 从一个 Idea 开始

Agent 开发通常从一个 Idea 开始。先确定想解决的问题和最小验证方式，不在第一天建设完整的 Agent 平台。

选择一个模型服务或 OpenAI-compatible 网关，配置 `OPENAI_BASE_URL`、`OPENAI_API_KEY` 和 `OPENAI_MODEL`，先使用第一章的 OpenAI SDK 代码跑通最小 Demo。Key 只保存在本地环境或密钥系统，不写入代码和文档。

Demo 的复杂度真实增长后，再按照本文的章节逐步补充能力：

| 出现的需求 | 对应章节 |
| --- | --- |
| 验证 Idea，完成第一次模型调用 | 第一章：一个普通函数 |
| 出现多步骤、分支、Tool 和状态 | 第二、三章：使用 Eino 或 LangGraph 组织代码 |
| 出现多轮、异步长任务、恢复或集群运行 | 第四章：建设 Agent Service |
| 线上问题难以定位 | 第五章：补充 Log、Metric、Trace 和排查工具 |
| 无法证明新版本真的更好 | 第六章：建立 Test、Eval 和 Release 闭环 |
| 希望 AI 参与后续开发和维护 | 第七章：补充仓库规则、Skills 和可执行接口 |

```text
Idea
  → Model API Key
  → 最小 Demo
  → Eino / LangGraph
  → 生产服务
  → 可观测与排查
  → 评测与持续改进
  → AI 可操作的开发体系
```

原则是先验证 Idea，再为真实出现的复杂度补充工程能力；不为了做 Demo 提前建设所有设施，也不在已经进入框架能力边界后继续造轮子。

## 结语

Vibe Coding 大幅降低了写代码的成本，但没有消除系统设计。相反，当 AI 可以快速添加循环、状态、Tool 和后台任务时，我们更容易在没有意识到的情况下造出一套新的 Runtime。

我的做法是从最小模型调用开始，只在复杂度真实出现时增加下一层能力：先选择控制流，再依托成熟框架组织执行；需要长期运行时建设 Run Service；上线前补齐可观测和评测；最后把开发、测试和排查也做成 AI 可执行的工作流。

一个生产级 Agent 不一定需要本文列出的全部设施，但应该能够回答几个基本问题：

- 谁决定下一步，模型的控制边界在哪里？
- 执行中断后，状态是否可以恢复？
- 输入一个 `run_id`，能否还原它真正做过什么？
- 更换模型、Prompt 或 Graph 后，如何证明结果更好了？
- AI 能否自己完成开发、验证和排查，并把证据交给人？

Agent 最特殊的部分当然是模型。但真正决定它能否进入生产的，仍然是这些朴素的软件工程问题。
