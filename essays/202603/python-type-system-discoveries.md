Last Updated: 2026-03-26

# 第一次写 Python 项目，一些发现

*——一个静态语言出身的程序员，在大模型时代开始全职写 Python*

---

写了多年 C++、Java、Go，去年底转 Python 做 Agent 开发。一开始很不适应——没有编译器兜底，代码里全是字符串 key，运行之前一切都是未知的。

写了两个月之后，主导了一次项目重构，开始认真调研 Python 的最佳实践。结论出乎意料：Python 确实是一门精简的语言——该有的机制都有，但不强迫你用。用好了，体验属于最舒服那一档。

这篇记录五个发现。

---

## 发现一：Python 的类型系统，什么都不做

这是第一个让我震惊的事。

```python
state.get("xxx", {}).get("yyy", [])
```

在我们的项目里这种代码一大堆。最麻烦的不是链式调用本身，而是那些**字符串 key**——`state["xxx"]`、`state.get("yyy", {})`，有的用 `.get()`，有的直接用 `[]`，key 是什么全靠字符串。在静态语言里，数据结构是确定的，字段有没有编译时就知道了。在 Python 里，一个 `dict` 可以装任何东西，字段名散落在字符串里，改一个 key 你都不知道会影响哪里。

更多时候，代码里根本没有类型标注。变量是什么类型，全靠看上下文猜。

而且项目里同事其实用了 `TypedDict`——明明定义了结构，结果这东西只是提示，运行时不校验，甚至不提供 `.field` 访问，还是得用 `["key"]` 取值。所以大家照样 `.get()` 来 `.get()` 去，定义了跟没定义一样。

我第一次看到 `TypedDict` 啥都能不做的时候大为震惊——这种玩意儿到底是干啥的？

其实说"什么都不做"也不完全准确。Python 的 `typing` 模块提供了不少东西——类型标注、`TypedDict`、`Protocol`、`Literal`、`dataclass`——看起来该有的都有。但这些东西有一个共同特点：**默认只是标注，运行时不校验、不拦截、不报错。**

它们存在的意义是给**工具**看的——Pyright 做静态分析、Pydantic 做运行时校验——但这些都是第三方的事，语言本身不管。

Python 官方的态度很明确：我只提供标注语法，至于你拿它做什么，那是你的事。

这是一个**白纸策略**——语言提供了画布和颜料，但不替你画画。

---

## 发现二：第三方工具补齐了一切

Python 官方只给了白纸，但社区在上面画出了一套相当完整的东西。我在项目里用的这套工具链：

- **Pydantic** —— 运行时类型校验和转换，守住数据入口
- **Pyright** —— 静态类型分析，写代码时就能发现类型错误
- **Ruff** —— 代码检查和格式化，速度极快

其中 Pydantic 是最关键的一环。它读取你写的类型标注，在运行时**真正去校验和转换**：

```python
from pydantic import BaseModel

class Config(BaseModel):
    timeout: int
    retries: int = 3

config = Config(timeout="30")  # 传的是字符串
print(config.timeout)          # 30（int，自动转换了）
print(type(config.timeout))   # <class 'int'>

Config(timeout="abc")          # ValidationError
```

Pydantic 的哲学是 **"parsing, not validation"**——不只是检查你给的对不对，而是尝试把你给的**解析成**目标类型。能转就转，转不了才报错。

加上这套工具之后，Python 的类型标注从"装饰品"变成了有实际效果的东西。Pyright 管静态、Pydantic 管运行时、Ruff 管代码规范——整套体系用起来其实挺舒服的。

---

## 发现三：Python 的反射能力强得超出预期

在我的 Agent 链路里，会有一个计划节点，把好几发模型调用串起来。这就要求上一发调用的输出，要满足下一发调用的输入。

这种场景下，我需要动态获取下游节点的类型签名，然后用大模型自带的格式化输出（`response_format`）来约束上游的输出格式。于是我发现 Python 居然正好有这种能力。

对比一下：
- **C++** 几乎没有反射，运行时拿不到类型信息
- **Java** 有一些反射，但泛型会被擦除，拿不到完整的类型参数
- **Python** 的反射非常强大——类型标注在运行时作为普通 Python 对象存在，你能拿到你想要的一切

```python
from typing import get_origin, get_args

T = list[int]
get_origin(T)  # → list
get_args(T)    # → (int,)
```

甚至能直接拿到 JSON Schema。Pydantic 把这个能力发挥到了极致——`model_json_schema()` 可以自动把 Python 类型转换成标准的 JSON Schema：

```python
from pydantic import BaseModel, Field

class StoryPage(BaseModel):
    title: str = Field(description="页面标题")
    content: str = Field(description="页面内容")
    scene_description: str = Field(default="", description="场景描述")

StoryPage.model_json_schema()
# → 完整的 JSON Schema，自动递归展开所有嵌套类型
```

我写 Agent 的时候，经常需要让模型输出符合某些字段的格式。这个 JSON Schema 正好就是 LLM 的 `response_format`——直接约束模型输出。

而且部分字段的取用也很方便。一个完整模型有 10 个字段，这次只需要其中 3 个？从 schema 里裁出对应的子 Schema 就行，传给模型，模型就只输出这 3 个字段。

整个链路是：**Python 类型 → Pydantic 模型 → JSON Schema → LLM 输出约束 → 解析回 Python 对象。** 闭环。

在静态语言里做同样的事，你需要反射、annotation processor 或者 proc macro，写一堆样板代码。Python + Pydantic 几乎是零成本——因为类型本来就在运行时，不需要任何额外机制去"找回"它们。

这是动态语言的一个结构性优势。不是"够用"，是**真的更方便**。

---

## 发现四：加上第三方库后，Python 类型体验属于最好用的那一档

发现一说 Python 自己什么都不做，发现二说第三方工具补齐了。但补齐之后的体验不只是"够用"——是真的好用。

Python 默认就是 Duck Typing——不强调继承，有什么方法就是什么类型。Go 的 interface、TypeScript 的 structural typing 都是这个路子，现代语言基本都往这个方向走。Python 的 `Protocol` 也是如此——**你有什么，你就是什么：**

```python
from typing import Protocol

class Renderable(Protocol):
    title: str
    content: str

# 不需要继承 Renderable，只要有 title 和 content 就行
class StoryPage:
    title: str
    content: str
    scene_description: str  # 多出来的字段无所谓

class NewsArticle:
    title: str
    content: str
    source: str
```

`StoryPage` 和 `NewsArticle` 没有任何继承关系，但它们都满足 `Renderable`，因为它们都**有**那些字段。比写 Java 的 `implements SomeInterface` 舒服多了。

在我的 Agent 项目里，这个特性解决了一个很实际的问题：

**多个节点的输出要能传给同一个下游节点。**

传统做法是让所有上游节点的输出都继承下游节点定义的输入类型。这意味着上游必须知道下游的存在——耦合了。

用 Protocol 的话，反过来：下游声明"我需要什么"，上游只要碰巧有这些字段就自动满足。如果差一个字段，写个 `@property` 适配一下就行。

**上游不需要知道下游的存在，下游不需要知道上游是谁。** 这才是真正的解耦。

---

## 发现五：唯一还难受的地方——边界收敛

融合了 Pydantic + Pyright + Ruff 之后，整体体验确实属于最好用那档。但目前还有一个痛点：**边界收敛**。

Pydantic 的类型保障是有前提的——你得把所有数据进出的边界收干净。API 入口的收敛我做到了，所有外部数据进来都走 Pydantic 校验，这部分没问题。

但一旦涉及到框架层面的序列化和反序列化，就容易漏。比如 LangGraph 的 checkpoint——State 存进去是 Pydantic 模型，取出来变成了普通 `dict`。类型标注还在，但运行时已经不是那个类型了，**一点报错都没有**，后续代码用 `.field` 访问直接炸。

这种问题很隐蔽：不是类型写错了，而是类型在某个环节被悄悄"降级"了。你以为拿到的是 `StoryPage`，其实是一个长得像 `StoryPage` 的 dict。

要想真正舒服地用 Pydantic，你得把**所有**边界都收干净——API 入口、序列化/反序列化、框架交接点，一个都不能漏。

还有性能开销。Pydantic 每次创建对象都要遍历字段、校验类型、做转换——在 Agent 开发里我选择性忽略了，因为一次 LLM 调用要几秒，Pydantic 的开销微不足道。但如果是开发其他高性能服务，相比 C++/Java 的零开销抽象，Pydantic 的抽象开销可太大了。

---

## 总结

Python 的类型系统是一张白纸——语言本身什么都不做。但社区在上面画出了一套还不错的东西：

- **Duck Typing（Protocol）** 提供了真正的解耦
- **Pydantic** 补齐了运行时校验，让类型标注不再是装饰
- **动态类型的可内省性** 在 LLM 集成场景下，反而是比静态语言更方便的特性

心路历程：**不信任 → 焦虑 → 学会用工具建防线 → 发现有些地方确实更好 → 接受了。**

好在第三方库把 Python 的"简单"补齐成了"机制完善"——最终的结果是：既保留了简单好用，又拿到了大型项目需要的安全感。

---

## 附：The Zen of Python

```
Beautiful is better than ugly.
```
优美胜于丑陋。
```
Explicit is better than implicit.
```
明确胜于隐晦。
```
Simple is better than complex.
```
简单胜于复杂。
```
Complex is better than complicated.
```
复杂胜于凌乱。
```
Flat is better than nested.
```
扁平胜于嵌套。
```
Sparse is better than dense.
```
稀疏胜于稠密。
```
Readability counts.
```
可读性很重要。

---

```
Special cases aren't special enough
  to break the rules.
```
特例不足以特殊到违反上述规则。
```
Although practicality beats purity.
```
然而实用胜于纯粹。
```
Errors should never pass silently.
Unless explicitly silenced.
```
错误不应被默默忽略。除非你明确地让它闭嘴。
```
In the face of ambiguity,
  refuse the temptation to guess.
```
面对模棱两可，拒绝猜测的诱惑。

---

```
There should be one-- and preferably
  only one --obvious way to do it.
```
应该有一种——最好只有一种——显而易见的方式来做事。
```
Although that way may not be obvious
  at first unless you're Dutch.
```
虽然这种方式一开始可能并不明显（除非你是荷兰人）。
```
Now is better than never.
Although never is often better
  than *right* now.
```
做总比不做好。但不假思索就动手，还不如不做。
```
If the implementation is hard to
  explain, it's a bad idea.
If the implementation is easy to
  explain, it may be a good idea.
```
如果实现很难解释，那就是个坏主意。如果实现容易解释，那可能是个好主意。
```
Namespaces are one honking great
  idea -- let's do more of those!
```
命名空间是个绝妙的好主意——多用吧！
