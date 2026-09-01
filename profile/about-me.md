Last Updated: 2026-09-01

# 林观果

Agent Runtime / AI 系统工程师<br>
上海 · [lin.guanguo2000@gmail.com](mailto:lin.guanguo2000@gmail.com) · [GitHub](https://github.com/Lin-Guanguo) · [个人主页](../)

我是一名从大规模用户画像平台后端走向生产级 Agent Runtime 的工程师。现在在一家 AI 初创公司负责 C 端多模态创作产品的 Agent 系统建设，先后从 0 到 1 建设并上线 Plan-and-Execute 与 ReAct 两套 Agent Runtime。

我长期关注模型能力如何在真实产品中稳定兑现。相比展示一次成功的模型调用，我更关心系统能否在长任务、多轮编辑、Tool 副作用和外部 Provider 波动下持续运行；其中涉及运行边界、反馈闭环、可观测、对账与故障恢复，也是我希望长期积累的核心能力。

此前在字节跳动从事用户画像平台后端研发，后期核心负责数千万至近亿级 QPS 的在线查询服务，也建设过权限系统、开放平台与跨区域数据链路。领域从高并发后端转向 Agent Runtime，但处理稳定接口、清晰状态、延迟、成本和失败恢复的工程主线没有改变。

除了 Agent 系统，我也长期关注计算机系统与编程语言，包括操作系统、编译原理、类型化状态、effect、资源生命周期和错误语义。我倾向于从这些基础问题出发，理解复杂系统为什么失控，以及如何让边界重新变得清晰。

## 工作经历

### AI 初创公司｜Agent 研发工程师｜2025.11 至今

- 从 0 到 1 建设并上线 Plan-and-Execute 与 ReAct 两套面向 C 端多模态创作业务的 Agent Runtime。
- 设计并全量上线 Agent Memory，提升 Planner 对 LLM KV Cache 的利用率，并搭建 Trace、Replay、Metrics 与自动排障工具链。

### 字节跳动｜用户画像平台后端工程师｜2022–2025

- 从后端实习转为正式员工，后期核心负责数千万至近亿级 QPS 在线查询服务的容量、缓存、稳定性与可观测性治理。
- 建设 CDP 权限体系、开放平台与跨区域数据链路，支持多租户授权、多语言 SDK 接入及亚太、北美和欧洲的多区域数据同步。

## 核心项目

### 1. Plan-and-Execute Agent Runtime｜2026.03–2026.07

面向原有工作流在状态表达、故障恢复和扩展性上的缺口，建设并全量上线完整执行底座：

- 统一 LLM Planner、Plan Validator、类型化 Capability I/O 与执行图，支持异步 Run、多轮 replanning、并行汇聚和增量编辑。
- 建设 PostgreSQL checkpoint、soft / hard cancel、跨集群 signal channel、CAS 与轮次级 rollback / resume，通过故障注入和恢复门禁验证业务状态能否安全恢复。
- 建设事件总线、Prometheus Metrics 与结构化运行上下文；完成两轮 100 / 150-case 批量验证、生产 A/B 与全量发布，承载生成中的打断、修改、回退与断点恢复。
- 通过稳定 Planner Prompt 前缀提升 LLM Provider KV Cache 利用率；两周生产窗口内 hit rate 从 11.37% 提升至 54.79%，独立模型估算 planning LLM 成本占比下降约 31.2%。

### 2. ReAct Runtime + Versioned Artifact System｜2026.08 至今

面向不适合固化为固定 Workflow 的开放创作任务，建设并上线独立 ReAct Agent 服务：

- 基于前置架构调研选择 Pi AgentHarness、single-controller ReAct 与 Skill：模型负责语义判断，Runtime 负责身份、状态、权限、副作用与恢复事实。
- 设计 grammar-constrained Code Mode，使模型通过单一执行入口编排类型化工具；阶段内支持有界并发，阶段间重新读取事实并决策。
- 建设版本化 Artifact 系统，以稳定身份、不可变版本、当前选择、归属和 lineage 管理多轮产物的来源、演进与最终集合。
- 构建 capability-scoped Code Mode 与 Project-scoped 虚拟命令 Worker，通过受限命令、VFS、只读 Skill mount 与 staged write 控制路径、资源和副作用边界。
- 围绕长任务与多实例执行建设单写语义、lease、heartbeat、drain、失败收敛和 query-before-retry，使系统能对运行归属与外部副作用进行判断。

### 3. 用户画像在线高速查询服务｜字节跳动｜2022–2025

- 后期核心负责多租户用户画像在线查询服务，覆盖容量、缓存、监控、Oncall 与稳定性治理，生产规模达到数千万至近亿级 QPS。
- 一组 2025 年生产峰值快照中，单条主路径达到约 6,583 万 QPS，P99 约 4.9–8.8 ms，并与其他区域和集群共同承载多区域查询流量。
- 开发分群增量导入链路，移除版本号依赖并降低存储与写入压力；上线后，凌晨导入高峰期的查询耗时波动基本消失。

### 4. 用户画像 CDP 平台建设｜字节跳动｜2023–2025

围绕多租户用户画像平台的权限、开放接入和多区域数据在线化，建设关键平台能力：

- 建设权限体系，完成权限物化、项目中心重构与资源类型扩展；补齐初始化检测与存量权限治理，满足复杂授权和审计要求。
- 搭建 OpenAPI 注册系统与上下游 Adapter，开发维护 Java、Python、Go SDK，使分群和元数据接口演进对调用方保持兼容。
- 设计并落地覆盖亚太、北美和欧洲的在线数据与元数据同步链路，推进 CDP 核心能力整合与多区域部署。
- 作为平台治理补充，建设四种计费模式、账单与成本分摊体系；通过容量校准推动在线商品收入提升 48.63%，存储容量治理使日均成本下降约 77.8%。

## 技术关注

- **Agent Runtime Reliability**：Agent Loop、状态与副作用边界、长任务执行、checkpoint、cancel / rollback / resume、并发控制、恢复与评测。
- **Tool Interface 与执行环境**：面向 Agent 的工具契约、Code Mode、Skill、受限执行环境、资源生命周期和可审计副作用。
- **后端与数据系统**：高并发低延迟服务、多租户权限、跨区域同步、缓存、消息系统、数据在线化与可观测性。
- **编程模型与系统基础**：类型化状态、effect、错误语义、编译器、操作系统，以及这些抽象如何帮助复杂系统维持清晰边界。
- **工程工具化**：倾向于把高频查询、调试、实验复现和工作记录沉淀为工具、文档或 Skill，降低长期维护与团队协作中的隐性成本。

## 写作与公开产出

我持续记录 Agent 架构、Memory 与 Context、编程语言和生产工程实践，已公开 34 篇文章。近期代表作包括：

- [《从模型调用到生产级 Agent：Vibe Coding 之外的工程实践》](../read/202607/production-agent-engineering-beyond-vibe-coding/)
- [《主流 Agent 的 Tool 设计》](../read/202607/agent-tool-design-code-as-tool-use/)
- [《6 个主流 Agent 的上下文管理与记忆系统深度对比》](../read/202603/agent-memory-context-comparison/)

完整文章与后续更新见[个人主页](../)。
