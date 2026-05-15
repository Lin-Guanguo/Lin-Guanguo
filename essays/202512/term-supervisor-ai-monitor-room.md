---
title: "TermSupervisor：多个 AI 编程会话的监控室"
subtitle: "用 iTerm2 API 和 Web 仪表盘管理并行 Claude Code 会话"
last_updated: 2025-12-06
---

# TermSupervisor：多个 AI 编程会话的监控室

最近在做项目，同时开了好几个 Claude Code 帮我写代码。

问题来了：管理它们太麻烦。要不停切窗口看状态，哪个跑完了，哪个报错了，最烦的是卡在"等待权限批准"——不点确认它就一直等着。

作为程序员，这种重复劳动必须解决。

于是周末写了个工具：**TermSupervisor**

**做什么的？**

Hook iTerm2 的 API，把所有终端窗口映射到一个 Web 页面上。用 iPad 或副屏挂着，一眼看清所有状态。

**核心功能：**

- 状态用颜色区分：蓝色=运行中，黄色=等待批准，绿色=完成，红色=失败
- 实时同步终端内容
- 支持多屏，主屏干活，副屏监控

**技术栈：**

- Python 3.12 + FastAPI
- iTerm2 Python API
- WebSocket 实时推送
- 状态机检测终端运行状态

如果你也经常同时跑多个 AI Agent，可能会用得上。

自用小工具，已经开源：https://github.com/Lin-Guanguo/TermSupervisor
功能还不算完善，仍有小 bug，自有足够，慢慢优化
