---
title: "Harness Design for Long-Running Apps"
subtitle: "Generator-Evaluator 多智能体架构如何提升长时间开发质量"
last_updated: 2026-03-25
---

# Harness Design for Long-Running Apps

Anthropic 工程博客介绍了 Generator-Evaluator 多智能体架构如何让 Claude 在长时间运行中产出高质量前端设计和完整全栈应用。

## 背景

Anthropic Labs 的 Prithvi Rajasekaran 于 2026-03-24 发布了一篇工程博客，探讨了在长时间开发场景下如何通过多 Agent 协作架构（Harness）提升 Claude 的自主开发能力。文章来源于实际生产环境的实验。

---

## 核心问题

单 Agent 长时间运行面临两个关键挑战：

1. **Context Anxiety（上下文焦虑）**：模型在接近 context limit 时会过早收尾工作。compaction 能保持连续性，但无法提供 "clean slate" 来避免这种行为。
2. **Self-Evaluation Bias（自我评估偏差）**：Agent 对自身输出倾向于过度肯定，在主观任务（无可验证测试）上尤为严重。

## 解决方案：GAN-Inspired Generator-Evaluator 架构

核心洞察：**让外部 evaluator 变得严格，比让 generator 自我批判要容易得多。**

### 前端设计场景

Evaluator 通过 **Playwright MCP** 直接与 live page 交互、截图，基于四个维度打分：

| 维度 | 关注点 |
|------|--------|
| Design Quality | 一致性、情绪、品牌感 |
| Originality | 自定义决策 vs AI 模板化倾向 |
| Craft | 字体、间距、配色和谐度 |
| Functionality | 可用性和任务完成度 |

每次生成运行 5-15 轮迭代，输出逐渐从常规布局进化到 3D CSS 空间体验等创新设计。

### 全栈场景：Three-Agent System

```
Planner ──→ Generator ←──→ Evaluator
  │              │              │
  │ 1-4句话 → 产品规格  │ 实现 + git │ Playwright 测试
  │ + AI feature 机会    │ Sprint 合同 │ 硬阈值评分
```

- **Planner Agent**：将简短 prompt 转化为高标准产品规格，保持宏观视角以防级联错误
- **Generator Agent**：使用 React + Vite + FastAPI + SQLite/PostgreSQL 迭代实现，维护 git 版本控制
- **Evaluator Agent**：通过 Playwright 操作运行中的应用，测试 UI / API / 数据库状态，按硬阈值评分

关键机制 — **Sprint Contracts**：Generator 和 Evaluator 在实现前协商规格，通过文件通信桥接产品故事和可测试需求。

## 性能数据

### Retro Game Maker (Opus 4.5)

| 方式 | 时长 | 成本 |
|------|------|------|
| Solo Agent | 20 min | $9 |
| Full Harness | 6 hours | $200 |

Solo 产出核心机制损坏；Harness 产出可玩游戏 + 集成 AI 功能。

### Digital Audio Workstation (Opus 4.6 简化版)

| 阶段 | 时长 | 成本 |
|------|------|------|
| Planning | 4.7 min | $0.46 |
| Build R1 | 2h 7min | $71.08 |
| QA R1 | 8.8 min | $3.24 |
| Build R2 | 1h 2min | $36.89 |
| QA R2 | 6.8 min | $3.09 |
| Build R3 | 10.9 min | $5.88 |
| QA R3 | 9.6 min | $4.06 |
| **Total** | **3h 50min** | **$124.70** |

## 关键发现

### Opus 4.6 带来的简化

Opus 4.6 的能力提升使得 Sprint 分解可以被移除，同时保持多小时连续开发的一致性。Evaluator 的价值变为任务依赖型 — 在能力边界处必要，在简单任务中多余。

### Prompt 措辞直接影响输出特征

例如 "museum quality designs" 这样的评估标准措辞，独立于迭代反馈，直接影响了模型的输出风格。

### 非线性改进

后续迭代通常优于前面，但有时中间版本更被偏好。随着迭代推进，Generator 倾向于尝试更有野心的方案，增加了实现复杂度。

### QA 调优的困难

Claude 开箱即用的 QA 能力很差 — 习惯性批准不合格输出、测试流于表面。有效调优需要多轮开发循环：读 evaluator 日志 → 识别判断偏差 → 更新 prompt。即便优化后，小布局问题、不直观交互、深层嵌套 bug 仍会逃过检测。

## 核心经验总结

1. **模块化假设需要压力测试**：Harness 的每个组件都编码了对模型能力的假设，这些假设很快会过时
2. **逐步简化**：一次移除一个组件评估影响，而非激进重设计
3. **脚手架随任务变化**：模型改进会移动能力边界，需持续评估各 harness 组件是否仍然 load-bearing
4. **演化而非消失**：*"The space of interesting harness combinations doesn't shrink as models improve. Instead, it moves."*

## 参考来源

- [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) (accessed: 2026-03-25)
