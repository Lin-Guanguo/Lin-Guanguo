---
title: "从 just-bash 到 microVM：Agent 沙盒到底在隔离什么"
subtitle: "同样是 Bash，安全边界可能落在完全不同的层次"
description: 从创作 Agent 的文件系统需求出发，比较 just-bash、OS sandbox、container、gVisor 与 microVM，并分析主流 Agent 沙盒的执行边界和生命周期
last_updated: 2026-09-02
---

# 从 just-bash 到 microVM：Agent 沙盒到底在隔离什么

我开始研究 Agent 沙盒，起因只是一个文件系统需求。

我正在开发一个创作 Agent。它需要在同一个 Project 中跨多次运行保留 Workspace，同时把模型的操作限制在预期的文件系统边界内。模型通过 Bash 处理文件，但我不希望它继承启动 Agent 的本地用户权限。

顺着这个问题，我先看到了 Cloudflare Computer，又顺着它找到 [just-bash](https://github.com/vercel-labs/just-bash)。实现这套方案后，我想更深入地研究 Agent 沙盒技术，看看市面上的主流方案分别把边界放在哪里。

## 一、一个文件系统需求引出的沙盒问题

我的场景只需要一个供模型搜索、编辑和组织文件的 Workspace，just-bash 因此很合适。它在 TypeScript 中解析 Shell，再把命令与文件操作路由到虚拟文件系统，整个过程不会调用宿主的 `/bin/bash`。模型看到熟悉的 Shell，实际只能使用应用显式提供的能力。

我的实现运行在 Kubernetes 集群中。持久卷保存所有 Project，每个 Project 使用一个独立子目录；相比为每次执行分配 container 或 VM，这种做法很轻量。但子目录只是存储结构，不是安全边界：如果 Shell 能看到持久卷根目录，模型完全可以通过 `..`、绝对路径或符号链接读写相邻 Workspace。

我只把当前 Project 的子树挂载到 just-bash VFS，再把 Skill 只读挂载到另一条路径，命令则运行在短生命周期 Worker 中。这个执行世界没有宿主 `exec`、网络和真实语言 runtime。

真正实现之后，我才发现 just-bash 并不简单：它需要在应用层同时定义 Shell 语义、命令集合和文件系统行为，才能构成一个自洽的受限执行世界。

如果我给 just-bash 注册一个 custom command，再在里面直接 `spawn("/usr/bin/python3")`，真实 Python 的文件、网络和子进程访问就不会经过 VFS。[just-bash Threat Model](https://github.com/vercel-labs/just-bash/blob/main/THREAT_MODEL.md) 也将这些 host adapter 视为应用的可信边界。

我最后得到的是一个受限命令与文件 runtime。它适合当前的创作 Agent；需要真实 Python、npm、compiler 或仓库脚本时，边界就要外移到操作系统、container 或 VM。全文要回答的问题也由此出现：同样一个 Bash Tool，谁在强制它的边界？

## 二、Agent 沙盒到底要隔离什么

沙盒首先是一份威胁模型。本地用户让 Agent 编辑自己的项目，主要担心模型误操作；Agent 读取陌生仓库和网页后执行指令，还要面对 prompt injection 与依赖脚本；云平台允许陌生用户提交任意 binary，执行者本身就要按主动攻击者处理。三种场景要求的边界并不相同。

[Anthropic 对 Claude containment 的复盘](https://www.anthropic.com/engineering/how-we-contain-claude)也区分了模型层防御与环境 containment。审批和提示影响 Agent 倾向于做什么；系统边界给它最终能做到什么设置上限。

可以把 Agent 的执行面画成一张 capability 图：

```text
Agent 执行的代码
├─ 文件：可读、可写、可执行的路径
├─ 进程：解释器、子进程、daemon 与 signal
├─ 网络：公网、私网与本地 IPC
├─ 身份：凭据与宿主代理
├─ 资源：CPU、内存、磁盘、PID、I/O 与输出
└─ 状态：Workspace、snapshot、volume 与历史会话
```

评估整个执行环境时，至少要分开三个维度：完整性关心能否修改 Workspace 之外的对象，保密性关心能否读取宿主 Secret，可用性关心能否耗尽资源。`workspace-write` 可能阻止 Agent 改写 home，却仍允许它读取其中的凭据。

同样，单次 command timeout 只限制这次执行，进程树和 CPU、内存、PID、磁盘仍需要独立约束。

网络和凭据会改变文件边界的意义。Sandbox 能读 Secret 又能出网时，只读根仍可能泄露数据；Docker socket 和 MCP 也会把宿主能力穿过边界。更窄的设计会将真实凭据留在外部 proxy，只在受控出口中按需注入。

边界覆盖哪些 Tool 也很重要。Bash 进入 sandbox，不代表文件 Tool、Browser 和 MCP 也在同一个执行世界；backend 不可用时是拒绝还是回到宿主，同样属于安全契约。

所以，“用了 Docker”、“使用 Firecracker”或“只能写 Workspace”都不足以描述一个 Agent 沙盒。还要知道 Guest 看见什么接口，哪一层强制策略，以及能力从哪些 bridge 穿过去。

## 三、从 just-bash 到 microVM，边界落在哪一层

把 just-bash、Docker 和 microVM 排成从“轻”到“重”的梯子，会隐藏最重要的差异：Guest 看到什么接口，权限判定又发生在哪层。

| 路线 | Guest 看到的主要接口 | 边界执行者 | 未改写的 native program | 独立 Guest kernel |
|---|---|---|---|---|
| just-bash / VFS | Bash 子集、虚拟命令与文件 API | 应用解释器 | 不支持 | 无 |
| Seatbelt / bwrap / Windows Token | 宿主 OS ABI | 宿主内核 | 支持 | 无 |
| OCI container | Linux 用户空间与 syscall | 宿主内核 + runtime | 支持 Linux 程序 | 无 |
| gVisor | Linux syscall ABI | 用户态 Sentry | 大量支持，受兼容性限制 | 无传统 Guest kernel |
| VM / microVM | vCPU、内存和虚拟设备 | hypervisor + VMM | Guest 内支持 | 有 |

just-bash 由应用定义命令和文件能力；一旦启动宿主进程，强制边界就随之外移。

当 Agent 需要真实 Git、Python、npm 和 compiler 时，策略通常在 spawn 处由宿主 OS 强制。上层可以共用一套 permission profile，macOS、Linux 和 Windows 的实现却不同：

```text
统一 permission profile
├─ macOS  → Seatbelt
├─ Linux  → namespace + mount + seccomp / LSM
└─ Windows → Token + SID + ACL + Job / Firewall
```

WSL2 运行真实 Linux kernel，因此能复用 Linux sandbox backend；原生 Windows 则需要独立实现。

Container 将 Linux 用户空间与 rootfs 组织成可分发环境。Namespace 和 cgroup 之外，[OCI runtime](https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md) 还会组合 capability、seccomp 和 LSM；容器内程序仍与宿主共享 kernel。

[gVisor](https://gvisor.dev/docs/architecture_guide/intro/) 让 workload 的 syscall 先进入用户态 Sentry，从而缩小直接暴露给宿主 kernel 的接口。它保留了大量 Linux 兼容性，也会带来兼容与性能取舍。

microVM 将 Guest kernel 放进 hypervisor boundary。[Firecracker](https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md) 基于 KVM，用精简设备模型降低启动成本与攻击面。现代同架构 VM 的大量指令直接在 CPU 上执行，hypervisor 仲裁特权转换、内存和设备；将 VM 概括成“指令集模拟”并不准确。

一台 microVM 可以有独立 kernel，同时把整个 home 挂载进去、开放公网、注入长期 Token。因此计算边界更强之后，文件、网络、凭据和生命周期仍然要单独设计。

Wasm 与 [QuickJS](https://bellard.org/quickjs/quickjs.html) 属于另一条应用 runtime 路线：前者通过 host import 获得文件和网络能力，后者是可嵌入的 JavaScript engine，并非 V8；两者都不直接提供完整 Linux 世界。

Sandbox 技术在 Docker 之后一直演进。Agent 带来的变化发生在产品层：过去藏在云平台、CI 和在线判题内部的隔离能力，正在变成应用开发者直接调用的 API。

## 四、同样是 Bash，本地 Agent 的执行契约并不相同

Claude Code、Codex、Pi 和 DeepSeek Harness 都让模型调用 Bash。Bash 只是 Tool 界面；要知道命令真正受到什么限制，还得沿着执行链找到最终创建进程的位置：

```text
模型 Tool Call
→ permission 与审批
→ Tool executor
→ sandbox policy
→ 平台 backend
→ 真实 process
```

### Claude Code 和 Codex：在 spawn 处包住真实进程

[Claude Code 的沙盒文档](https://code.claude.com/docs/en/sandboxing)描述了一条很典型的路径：它在 Bash 子进程外包上 OS sandbox，macOS 使用 Seatbelt，Linux 和 WSL2 使用 bubblewrap，网络经过受控 proxy。这条边界包住 Shell 进程树；Read、Edit、Write 等内建 Tool 仍由 permission system 管理。

Codex 的本地 executor 同样运行真实工具链。它先将文件、网络和审批要求组成 permission profile，再映射到平台 backend：Linux 主路径是 bubblewrap，macOS 是 Seatbelt，[Windows 实现](https://openai.com/index/building-codex-windows-sandbox/) 则组合 Token、SID、ACL 和防火墙。[Codex Linux sandbox 的公开代码](https://github.com/openai/codex/blob/main/codex-rs/linux-sandbox/README.md)体现了这种“统一策略，平台分别强制”的结构。

这两种实现都保留了真实的 Git、Python 和 compiler，启动快且能复用用户环境；代价是 macOS、Linux 和 Windows 需要各自的后端，Tool 是否全部进入同一边界也要逐个确认。

Pi 默认运行宿主 Shell，也允许 provider 将文件和 Bash 整组替换到 Docker 或 microVM（[Pi 代码快照](https://github.com/earendil-works/pi/tree/853a80d26c90)）。DeepSeek Harness 把 `workspace-write` 的 [sandbox contract](https://github.com/deepseek-ai/deepseek-harness/blob/cd5ef8148158/packages/sandbox/sandbox/src/index.ts) 限定为 file effects：Bash 交给 OS backend，文件 Tool 使用进程内 path fence，E2B provider 则是可选的远程执行世界。

因此，看本地 Agent 的代码时，我会比较默认权限、Tool 覆盖面、网络和凭据的 bridge，以及 backend 不可用时会拒绝执行还是回退到宿主。

## 五、市面上的 Agent 沙盒正在卖什么

本地 Coding Agent 转换的是用户电脑上的权限；托管 Sandbox 还要按用户和任务创建执行世界，处理启动延迟、持久状态、多租户、计费与回收。

市场份额没有可比的公开数据。下面三家按公开资料完整度、通用 Linux 能力和架构代表性选取，能力以 2026-09-01 官方资料为准。

| 产品 | 主要计算边界 | 对外的逻辑对象 | 持久与恢复方向 |
|---|---|---|---|
| E2B | Firecracker microVM | Sandbox / Template | Pause（全状态或仅文件系统）、全状态 Snapshot / Fork |
| Cloudflare Sandbox | 独立 VM 中的 Ubuntu container | Durable Object / Sandbox ID | 目录 Backup、Bucket mount、应用恢复 |
| Vercel Sandbox | Firecracker microVM 中的 container | 长寿命 Sandbox / 短寿命 VM Session | 文件系统持久、Snapshot 与 Fork |

### Cloudflare：Computer 和 Sandbox SDK 是两个不同的状态模型

[Cloudflare Computer](https://developers.cloudflare.com/changelog/post/2026-08-03-cloudflare-computer/) 正是我最初找到 just-bash 的地方。它用 Durable Object SQLite 支撑 Workspace，执行层可选 just-bash / Dynamic Workers isolate 或 Linux container。Sandbox SDK 是另一个产品对象。

[Cloudflare Sandbox SDK 的架构](https://developers.cloudflare.com/sandbox/concepts/architecture/)由 Worker SDK、Durable Object 和 Ubuntu container 组成。Durable Object 提供稳定 ID、路由和生命周期协调，Linux 命令运行在独立 VM 中的 container。ID 可以比当前 container 存活更久，目录持久交给 [R2 Backup](https://developers.cloudflare.com/sandbox/guides/backup-restore/) 或 Bucket mount。Worker 还能代理 [HTTP(S) 出站](https://developers.cloudflare.com/sandbox/guides/outbound-traffic/)，在匹配目标时才注入 Secret。计算隔离、状态与凭据因此由三套机制合作。

### E2B 与 Vercel：可程序化的 microVM

[E2B 的公开架构](https://github.com/e2b-dev/infra/blob/main/docs/ARCHITECTURE.md)把 container image 构建成 Template，每个 Sandbox 则独享 Firecracker microVM。预启动的内存、磁盘和 VM state 成为模板，实例通过 COW 保留自己的修改；Guest 内的服务将 process、file、PTY、Git 和 port 暴露成 API。

[Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)也使用 Firecracker，支持任意 Linux 程序、包安装、端口和按域名或 CIDR 约束的网络。它的长寿命 Sandbox 保留文件系统，每次开机却可以是新的 VM Session。

其他路线中，[GKE Agent Sandbox](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/machine-learning/agent-sandbox) 用 Claim 和 WarmPool 管理生命周期，计算隔离交给 gVisor RuntimeClass；[AWS AgentCore Runtime Session](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html) 则将一组 Agent 调用绑定到 dedicated microVM。

样本中反复出现的产品能力可归为三组：exec/file/PTY 等执行 API，snapshot/fork/TTL 等状态 API，以及网络、凭据和审计等能力控制。具体产品只会选择其中一部分组合。

## 六、Agent 沙盒的生命周期：计算可以停，工作区还要在

一次性代码执行可以在结果返回后直接删除环境。Agent 任务却会在命令之间等待模型、用户、审批或外部系统，几分钟乃至几小时后才继续。

[Kubernetes SIG Apps 的总结](https://kubernetes.io/blog/2026/03/20/running-agents-on-kubernetes-with-agent-sandbox/)将这类 workload 概括为 stateful、singleton、long-lived 且 mostly idle。一直保留实例能延续进程，等待时间也会占用内存和容量；直接删除实例又可能丢掉已安装的依赖和未完成的 Workspace。解法是将一个 Sandbox 拆成几层寿命：

```text
逻辑 Sandbox：ID、owner、policy、retention
├─ 当前计算：kernel、RAM、进程、临时 rootfs
├─ Workspace：snapshot、volume、object storage
└─ 外部附件：hostname、tunnel、credential lease
```

逻辑 ID 可以稳定，当前 VM 或 container 却能不断更换。Command timeout、idle timeout、compute max lifetime 和 retention TTL 也分别约束命令、空闲计算、实例寿命与持久状态；文档只写“五分钟 timeout”，仍无法判断到期时会丢什么。

### 三种不同的“恢复”

E2B、Vercel 和 Cloudflare 刚好提供了三份很不同的恢复合同。它们都能释放暂时不需要的计算，各自保留的状态不同。

[E2B Pause/Resume](https://docs.e2b.dev/sandbox/persistence)默认保存文件系统、RAM 与进程，也可关闭 `keepMemory` 只保留文件。即使恢复了进程，外部 WebSocket、PTY stream 和 TCP 仍需重连。

[Vercel Persistent Sandbox](https://vercel.com/kb/guide/vercel-sandbox-duration-and-persistence)保留 Sandbox 对象、配置和文件系统。每次开机是新的 VM Session，background service 由 `onResume` 重启：代码、依赖和文件还在，进程不保证连续。

[Cloudflare Sandbox 的生命周期](https://developers.cloudflare.com/sandbox/concepts/sandboxes/)区分 Sandbox ID 与当前 container。空闲、故障或平台替换后，同一 ID 可能指向新 container；本地文件、进程和 terminal 都已结束，应用要从 Backup、Bucket mount 或自有状态重建 Workspace。

对上层用户，三者都可能表现为继续同一逻辑工作区，实际保留的东西却从“进程继续”一直到“只剩稳定 ID”。所以要问的是暂停时保存了什么，继续执行时还要重建什么。

### 恢复是一份应用合同

[GKE Pod Snapshot](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/pod-snapshots)展示了边界情况：`whole-pod` 可保存内存、CPU 寄存器、文件描述符和 Pod 文件系统，恢复后却是一个新 Pod，具有新 IP 和 hostname，外部 TCP 也会断开。保存了 RAM，不等于保存了整个外部世界。

平台因此要记录 Sandbox ID、compute generation、checkpoint 与过期时间；应用要知道哪些服务可以重启，哪些任务要从业务 checkpoint 重放。Resume 与 retry 需要幂等，进程句柄要绑定 compute generation，网络和短期凭据则在每次激活后重建。

几个常见术语分别对应不同状态：Snapshot 记录过去，Volume 让数据脱离计算存活，Warm Pool 预启动将来的实例，Fork 从一份状态派生独立分支。Warm Pool 不携带某个用户的 Workspace，但可以和 Snapshot 或 Volume 结合。

最后，`stop` 通常只释放计算，`delete` 才结束逻辑对象；Snapshot、Volume、Tunnel 和 credential lease 还需要各自的 retention 与 garbage collection。用户感到的是一台可以随时回来的电脑，平台则能在空闲时回收实例，再在请求到来前后新建计算，或从 Warm Pool 领取预热实例。

## 七、选择边界，而不是选择“最强沙盒”

走完这些层次后，“哪个 Sandbox 最强”仍然很难回答。一棵只暴露必要文件的 `InMemoryFs`，对宿主的授权可能比挂载了整个 home 的 microVM 更窄；遇到攻击者提供的 native binary，应用层 Shell 又无法代替内核边界。工作负载与边界的匹配，比底层名称更重要。

选型实际有三条轴：计算层决定谁强制文件、进程和 kernel 边界；生命周期决定 Workspace、进程、Fork 与 scale-to-zero；能力控制决定网络、凭据、IAM 和 MCP 如何穿过边界。换成独立 kernel，不会自动修正一个权限过大的 Tool。

回到我的创作 Agent，just-bash 仍然是当前需求下的合理选择。任务集中在搜索、编辑、patch 和组织文件；Skill 只读，Project Workspace 可持久，Shell 不需要公网。没有 `execve`、socket 和宿主 `process.env` 的执行世界也容易审计。

需要真实 Python、Node、Git hook、compiler 或用户 binary，或 Shell 必须携带真实身份出网时，我才需要重新评估 OS sandbox、container 与 microVM。继续给 just-bash 加宿主 bridge，也会把边界慢慢移出它的控制。

因此，评估 Agent Sandbox 时，我会先问五件事：谁在执行？任务需要哪些 capability？系统要保护什么？哪些状态要穿越生命周期？边界不可用时会发生什么？

沙盒是一项历史悠久的技术。Agent 让隔离、交互等待、长期状态与能力控制同时成为高频需求，也推动这些能力从基础设施内部走向普通应用可调用的 API。

> 如果模型、仓库内容或执行代码做出了最坏选择，系统中哪一道边界仍然能够确定地限制损害？
