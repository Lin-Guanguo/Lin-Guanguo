---
title: "Claude Code /insights 命令逆向分析"
subtitle: "Leaf Path 重复计数 Bug 如何放大统计数据"
last_updated: 2026-02-06
---

# Claude Code /insights 命令逆向分析：Leaf Path 重复计数 Bug

通过逆向 Claude Code 二进制，发现 /insights 报告中所有图表数据因 JSONL tree 结构的 leaf path 重复计数被膨胀约 28 倍。

## 背景

运行 `/insights` 后发现报告中的数字严重不一致——声称 16,258 sessions、154K messages，但 facet 缓存只有 7 个文件，图表却显示 199 个 session 的分析结果。结合两篇外部文章对 insights 架构的描述，决定深入逆向分析。

---

## 参考文章

- [Deep Dive: How Claude Code's Insights Command Works](https://www.zolkos.com/2026/02/04/deep-dive-how-claude-codes-insights-command-works.html) - 描述了 6 阶段流水线架构
- [Claude Code's Insights](https://www.natemeyvis.com/claude-codes-insights/) - 使用体验，指出多次运行结果不一致

## 逆向方法

对 Mach-O 二进制 `/opt/homebrew/Caskroom/claude-code/2.1.31/claude` 使用 `strings` 命令提取嵌入的 JavaScript 源码（混淆/minified），追踪关键函数调用链。

## 6 阶段流水线架构

| 阶段 | 函数 | 模型 | 作用 |
|------|------|------|------|
| 1. 数据收集 | `xcT` → `jN8` → `vN8` → `xN8` | - | 从 `~/.claude/projects/` 加载所有 session |
| 2. Transcript 处理 | `uL8` / `vL8` | Haiku | 超 30K 字符的 session 分块摘要（25K/chunk） |
| 3. Facet 提取 | `mL8` | Haiku | 每 session 提取结构化评估，缓存到 `~/.claude/usage-data/facets/` |
| 4. 聚合分析 | `dL8` + `BnB` | Haiku | 程序化聚合 + LLM 叙事分析 |
| 5. Executive Summary | `lL8` | Sonnet | 生成 At a Glance 摘要 |
| 6. 渲染 | `sL8` | - | 输出 HTML 仪表盘 |

## Bug 根因：xN8 的 Leaf Path 展开

### JSONL 树状结构

Claude Code 的 session JSONL 使用树状结构存储对话，支持分支/编辑/fork。每条消息有 `uuid` 和 `parentUuid`，形成 DAG。`leafUuids` 标记所有终端节点。

### xN8 函数行为

```javascript
// xN8: 为每个 leaf 创建独立 session 条目
async function xN8(T) {
    let { messages, leafUuids } = await R$T(T);  // 读 JSONL
    let leaves = [...messages.values()].filter(K => leafUuids.has(K.uuid));
    let sessions = [];
    for (let leaf of leaves) {
        let path = GmT(messages, leaf);  // 重建 root→leaf 路径
        sessions.push({
            sessionId: path[0].sessionId,  // 所有 leaf 共享同一个 sessionId!
            messages: path,
            ...
        });
    }
    return sessions;  // 一个 JSONL → 多个 "session"
}
```

### dL8 聚合函数的 bug

```javascript
function dL8(allSessions, facetsMap) {
    let stats = { outcomes: {}, satisfaction: {}, ... };
    for (let session of allSessions) {          // 遍历所有 leaf path
        let facet = facetsMap.get(session.session_id);  // 按 session_id 查 facet
        if (facet) {
            stats.outcomes[facet.outcome] += 1;  // BUG: 同一 facet 被多个 leaf 重复计数
            // ... 其他 facet 指标同样被膨胀
        }
    }
}
```

**本质是经典的「一对多 JOIN 不去重」问题。**

## 数据验证

### Facet 缓存 vs 报告数据

实际 facet 文件：7 个（`~/.claude/usage-data/facets/*.json`）

| Facet Session | Leaf Paths | 通过过滤(≥2 msg) | Facet outcome |
|---------------|-----------|-----------------|---------------|
| `09130d41` | 71 | 70 | partially_achieved |
| `47cb384b` | 62 | 61 | mostly_achieved |
| `66980ed8` | 36 | 35 | partially_achieved |
| `66f929db` | **156** | 153 | fully_achieved |
| `930d045b` | 37 | 36 | fully_achieved |
| `9bdfd084` | 50 | 49 | mostly_achieved |
| `a71c6409` | 89 | 88 | mostly_achieved |
| **合计** | **501** | **492** | |

经 duration ≥ 1min 过滤后 → **199**，与报告 outcomes 总数完全吻合。

### 两次运行交叉验证

| | CN 报告 (14:31, 4 facets) | EN 报告 (18:22, 7 facets) |
|---|---|---|
| Sessions | 15,900 | 16,258 |
| Messages | 151,589 | 154,325 |
| Outcomes 总数 | 96 | 199 |
| Facet sessions | 4 | 7 |
| 符合 qualifying leaves | ~96 | ~199 |

数据完美一致：增加 3 个 facet（272 个 qualifying leaves）→ outcomes 从 96 增长到 199。

### 报告各指标失真倍数

| 指标 | 报告值 | 实际值 | 膨胀倍数 |
|------|--------|--------|---------|
| Sessions | 16,258 | 694 top-level | ~23x |
| Messages | 154,325 | ~70K user msgs | ~2.2x |
| Session Types | 199 | 7 | ~28x |
| Goals | 308 | ~14 | ~22x |
| Satisfaction | 368 | ~12 | ~31x |
| Outcomes | 199 | 7 | ~28x |

## 什么数据是准确的

- **定性分析**（项目描述、Wins、Friction 案例）— 来自 7 个真实 facet 的 LLM 生成内容
- **工具使用相对比例**（Bash > Read > Edit）— 虽然绝对值膨胀，比例关系正确
- **rawHourCounts 时段分布** — 独立于 facet 系统，按 message 粒度统计

## 修复建议

```javascript
// dL8 中应对 session_id 去重
const countedSessionIds = new Set();
for (let session of allSessions) {
    let facet = facetsMap.get(session.session_id);
    if (facet && !countedSessionIds.has(session.session_id)) {
        countedSessionIds.add(session.session_id);
        stats.outcomes[facet.outcome] += 1;
        // ... other facet-based counts
    }
}
```

同理，`total_sessions` 和 `total_messages` 也应该按 unique `session_id` 去重统计。

## 推测 Bug 成因

JSONL 最初可能是线性结构（1 file = 1 session = 1 leaf）。后来引入 tree/branching 功能（支持对话编辑、分支探索），但 `/insights` 的 `xN8` session 加载逻辑将每个 leaf 视为独立 session，而 `dL8` 聚合没有对共享 `session_id` 的 leaf paths 去重。
