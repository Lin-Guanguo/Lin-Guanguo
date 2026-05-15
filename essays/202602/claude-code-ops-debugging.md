---
title: "Claude Code 做运维排查：一次远程断线定位"
subtitle: "用多通道探测、journalctl 和日志链缩小故障范围"
last_updated: 2026-02-24
---

# Claude Code 做运维排查：一次远程断线定位

通过 Tailscale 状态、frpc 端口探测和 journalctl 日志链，定位一台远程小主机断线原因为网线误插 COM 口。

## 背景

一台远程小主机的所有访问通道（frpc、Tailscale、Cloudflare Tunnel）同时失联，当时无法直接接触机器。现场重新插拔网线后恢复，后来确认是网线插错口了。但通过 Claude Code 查系统日志，能把整个过程溯源得一清二楚。

---

## 排查过程

### 第一步：多通道探测确认断线

从本机和中转服务器分别探测所有远程通道：

| 通道 | 方法 | 结果 |
|------|------|------|
| Tailscale | `ssh <relay> "tailscale status"` | `offline, last seen 2d ago` |
| frpc SSH | `nc -z -w 5 <relay-ip> <ssh-port>` | CLOSED/TIMEOUT |
| frpc 应用端口 | `nc -z -w 5 <relay-ip> <app-port>` | CLOSED/TIMEOUT |
| Cloudflare Tunnel | `curl https://<example-tunnel-domain>` | 302（Access 登录页，不能确认 origin 存活） |

结论：所有通道断开，目标机器完全离线。

### 第二步：确定精确断线时间

```bash
ssh <relay> "tailscale status --json"
```

从 JSON 输出中提取：
```
LastSeen: 2026-02-21T13:40:47.1Z  # 即北京时间 21:40:47
```

### 第三步：排除断电，定位物理原因

恢复连接后 SSH 到目标机器排查。

**查重启历史** — `last reboot`：
```
reboot  5.15.0-170-gener Mon Feb 16 22:41 - 15:58 (7+17:17)
```
2月16日开机后一直运行到2月24日手动重启，中间无非预期重启 → **排除断电**。

**查断网时刻内核日志** — `journalctl --since/--until` + 关键词过滤：
```
Feb 21 21:40:02  enp2s0: Lost carrier           ← 载波丢失
Feb 21 21:40:02  enp2s0: NIC Link is Down        ← 物理链路断开
Feb 21 21:40:02  enp2s0: DHCP lease lost          ← DHCP 租约丢失
```
→ **物理层断开**（网线被拔），不是软件/路由问题。

**16 秒后出现 Link Up**：
```
Feb 21 21:40:18  enp2s0: NIC Link is Up 1000 Mbps Full Duplex
```
但之后 **没有任何 DHCP 获取 IP 的日志**，直接静默 3 天到重启 → 网线插到了 COM 口（RJ45 串口），有电气信号触发 Link Up，但无以太网通信。

## 根因

网线从以太网口拔出后误插入 COM 口（RS232 串口，物理接口同为 RJ45）。内核检测到电气信号报告了 Link Up，但 RS232 和以太网协议完全不同，实际无法通信。

## Claude Code 排查策略

整个过程中几乎没有手动输入技术命令，Claude Code 自主选择工具和策略：

1. 先读项目 README 和 docker-compose，理解网络拓扑
2. 并行探测所有远程通道（ping、nc、curl 同时跑）
3. SSH 到中转服务器，用 `tailscale status --json` 拿精确断线时间
4. SSH 到目标机器，用 `last reboot` 排除断电，用 `journalctl` 按时间范围定位日志
5. 一层层缩小范围：断电？→ 不是 → 网线断了？→ 是 → 为什么 Link Up 后没恢复？→ 插错口了

这是一个标准的运维排查流程，但执行者是 AI。

## Linux 运维排查命令速查

### 查"发生了什么"

| 命令 | 用途 | 示例 |
|------|------|------|
| `last reboot` | 重启历史 | 看有没有非预期重启，判断是否断电 |
| `last -x shutdown` | 关机历史 | 区分正常关机 vs 异常断电（断电不会有 shutdown 记录） |
| `uptime` | 当前运行时长 | 快速判断上次启动时间 |
| `journalctl -b -1` | 上一次启动的完整日志 | 看上次关机前最后发生了什么 |
| `journalctl --since "2h ago"` | 最近一段时间的日志 | 按时间范围缩小排查范围 |
| `dmesg -T` | 内核消息（带可读时间） | 硬件、驱动级别的事件 |

### 查"网络怎么了"

| 命令 | 用途 | 示例 |
|------|------|------|
| `ip link show` | 网口状态（UP/DOWN） | 判断物理链路是否通 |
| `ip addr show` | IP 地址分配情况 | 看 DHCP 有没有拿到 IP |
| `journalctl -u systemd-networkd` | 网络服务日志 | DHCP 租约、载波丢失等事件 |
| `ethtool enp2s0` | 网口详细信息 | 速率、双工模式、链路状态 |
| `nc -z -w 5 <ip> <port>` | 端口探测 | 远程判断服务是否可达 |
| `tailscale status --json` | Tailscale 节点状态 | `LastSeen` 字段可精确到秒 |

### 查"为什么挂了"

| 命令 | 用途 | 示例 |
|------|------|------|
| `journalctl -p err` | 只看错误级别日志 | 过滤噪音，直奔问题 |
| `journalctl -k` | 只看内核日志 | 硬件故障、驱动异常 |
| `systemctl --failed` | 当前哪些服务挂了 | 快速发现异常服务 |
| `journalctl -u <service>` | 看特定服务日志 | 如 `-u docker`, `-u sshd` |

### 排查思路

```
1. last reboot / last -x shutdown
   → 有没有非预期重启？有 → 断电/panic；没有 → 软件问题或网络断开

2. journalctl --since/--until 缩小时间范围
   → 找到异常开始的精确时刻

3. 关键词过滤：grep -iE 'link|carrier|down|error|fail|kill|oom'
   → 定位根因类型（网络/硬件/OOM/服务崩溃）

4. 交叉验证：从外部通道（Tailscale/frps/Cloudflare）的记录反推时间
   → 多源互相印证，避免日志缺失导致误判
```

## COM 口说明

这类小主机上的 COM 口可能是 RS232 串口，但使用 RJ45 物理接口，外观与网口非常接近，极易混淆。建议贴标签区分。
