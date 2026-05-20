---
title: "LLM 与 AI 应用核心概念科普：Token、Context、Prompt、Tool 与 Skill"
date: 2026-03-10T00:00:00+08:00
lastmod: 2026-03-10T00:00:00+08:00
slug: "llm-ai-concepts-token-prompt-mcp-skill"
description: "用通俗易懂的方式介绍 LLM、Token、Content、Context Window、Prompt、Tool/MCP、Agent Skill 等 AI 应用中的核心概念。"
tags: ["AI", "LLM", "科普"]
---

当你开始使用 ChatGPT、Claude 等 AI 产品，或尝试开发 AI 应用时，会频繁遇到一些术语：Token、Context Window、Prompt、MCP、Skill……本文用通俗的语言和例子，帮你快速理解这些概念。

---

## LLM：大语言模型

**LLM (Large Language Model，大语言模型)** 是能够理解和生成人类语言的 AI 模型。你可以把它想象成一位「读过海量书籍、文章和代码」的助手：给它一段文字，它能续写、总结、翻译、写代码，或回答你的问题。

常见的大模型包括 OpenAI 的 GPT 系列、Anthropic 的 Claude、Google 的 Gemini 等。它们都基于「预测下一个词」的核心机制：根据已有内容，推断最可能的下一个词，从而生成连贯的文本。

---

## Token：AI 的「语言积木」

**Token** 是 LLM 处理文本的**最小单位**。它不是完整的单词，而可能是：

- 一个单词（如 `hello`）
- 单词的一部分（如 `un` + `believable`）
- 一个汉字或几个汉字
- 标点、空格等

可以把它类比成乐高积木：模型把文本拆成一块块 Token，再根据这些积木的组合规律来理解和生成内容。

### 粗略换算

| 语言 | 大致换算 |
|------|----------|
| 英文 | 1 Token ≈ 0.75 个单词 ≈ 4 个字符 |
| 中文 | 1 Token ≈ 1–2 个汉字 |

例如：「人工智能」可能被拆成 2–3 个 Token。因此，同样长度的中文往往比英文消耗更多 Token。

### 为什么 Token 重要？

1. **计费**：多数 AI 服务按 Token 数量收费（输入 + 输出）
2. **上下文限制**：模型单次能「记住」的内容有上限，通常用 Token 数表示
3. **性能**：Token 过多会影响响应速度和效果

### 动手试试：在线分词工具

想直观感受文本如何被拆成 Token？可以使用 [OpenAI 官方 Tokenizer](https://platform.openai.com/tokenizer) 输入任意文字，查看分词结果和数量。

> 备注：该工具需能访问 OpenAI 平台（platform.openai.com）方可使用。

---

## Content 与 Context Window：模型的「记忆容量」

**Content**（内容）指的是在一次对话中，模型能「看到」的全部信息，包括：

- 系统提示（System Prompt）
- 用户消息（User Message）
- 历史对话
- 模型回复（Assistant Message）

**Context Window**（上下文窗口 / 内容窗口）则是模型单次能处理的最大 Token 数，可以理解为它的「短期记忆容量」。

### 举个例子

假设某模型的 Context Window 是 128K Token（约 10 万英文单词）：

- 你可以一次性塞进一本中篇小说
- 但如果对话太长，最早的内容会被「挤出」窗口，模型就「忘掉」了
- 超出窗口的输入通常会被截断或拒绝

不同模型的 Context Window 差异很大，例如：

- [Claude](https://docs.anthropic.com/en/docs/build-with-claude/context-windows) 部分型号支持 200K Token
- [GPT-4](https://platform.openai.com/docs/models) 支持 128K Token

**注意**：窗口越大不代表效果一定更好，关键在于「放进去的内容是否相关、精炼」。

---

## Prompt：你给模型的「指令」

**Prompt**（提示）就是你发给模型的文字，用来描述任务、提供背景或约束输出。

可以把它类比成给同事写的工作说明：写得越清晰、越具体，对方越容易做对。

### 简单例子

- 模糊：「写一首诗」
- 清晰：「用七言绝句写一首关于春天的诗，押平水韵，风格偏田园」

后者更容易得到符合预期的结果。

### 常见 Prompt 类型

| 类型 | 作用 |
|------|------|
| System Prompt | 设定模型角色、语气、规则（如「你是一位专业翻译」） |
| User Prompt | 用户的具体问题或任务 |
| Few-shot Prompt | 在问题前加几个示例，教模型「照这个格式回答」 |

---

## Tool 与 MCP：让模型「动手做事」

默认情况下，LLM 只能「说话」——生成文本。但很多场景需要它**执行操作**：查天气、读文件、发邮件、查数据库……

这就需要 **Tool**（工具）：模型根据你的需求，决定调用哪个工具，并传入参数，再把工具返回的结果整合进回复。

### MCP：统一的「工具接口」

不同 AI 产品各自定义工具格式，导致同一能力要重复开发。**MCP (Model Context Protocol)** 就是为了解决这个问题：定义一套标准协议，让各种工具以统一方式暴露给 LLM。

可以把它类比成 **USB-C**：设备只要符合协议，就能插到不同电脑上使用。

### MCP 工具类示例

MCP 生态中有大量现成的「工具服务器」，按类型大致可分为：

| 类型 | 示例工具 | 能力 |
|------|----------|------|
| **文件系统** | Filesystem | 读写本地文件、目录遍历，可配置访问范围 |
| **版本控制** | Git | 读取仓库、搜索提交、查看 diff、操作分支 |
| **网页抓取** | Fetch | 抓取网页内容并转为适合 LLM 的格式 |
| **数据库** | PostgreSQL、SQLite | 执行查询、查看表结构、分析数据 |
| **云服务** | Google Drive、AWS | 访问云端文件、调用云 API |
| **协作与搜索** | GitHub、Slack、Brave Search | 管理仓库、收发消息、网页搜索 |

这些工具以 **MCP Server** 形式运行，AI 客户端连接后即可调用。例如启动文件系统工具：

```bash
npx -y @modelcontextprotocol/server-filesystem /path/to/allowed/files
```

### 具体案例：Instagram MCP

以 [Instagram MCP](https://smithery.ai/servers/instagram) 为例，可以更直观地理解 MCP 能做什么。该服务器面向 Instagram 商业/创作者账号，提供多类工具，例如：

| 能力 | 示例 |
|------|------|
| **内容发布** | 创建媒体草稿、发布图文/视频、创建轮播帖 |
| **数据分析** | 获取帖子洞察（曝光、互动等）、查看评论 |
| **消息管理** | 获取私信会话、查看对话列表 |

连接后，你可以用自然语言对 AI 说「帮我看看最近几条帖子的数据」「把这条草稿发出去」「有哪些新私信」，AI 会调用对应工具完成操作。这类「把第三方服务变成 AI 可调用的工具」的模式，正是 MCP 的典型用法。

更多官方参考实现和社区服务器可浏览：

- 官方介绍：[Model Context Protocol 官网](https://modelcontextprotocol.info/about/)
- 文档与规范：[MCP 文档](https://modelcontextprotocol.info/docs)
- 参考实现：[modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)
- 社区目录：[MCP Registry](https://registry.modelcontextprotocol.io/)、[Smithery](https://smithery.ai/servers)

通过 MCP，你可以开发一次工具（如文件系统、数据库、云服务），在支持 MCP 的 AI 产品中复用。

---

## Agent Skill：模型的「技能包」

**Skill**（技能）可以理解为给模型加载的**专项能力包**：包含说明文档、示例、工作流程等，让模型在特定任务上表现更好、更稳定。

例如：

- 「处理 Word 文档」技能：教模型如何读写、编辑 .docx
- 「生成 Slack 动图」技能：约束尺寸、帧率、风格
- 「前端设计规范」技能：提供配色、字体、布局规则

### 官方 Skill 资源

不同厂商有自己的 Skill 体系：

| 厂商 | 资源 | 说明 |
|------|------|------|
| **Anthropic** | [anthropics/skills](https://github.com/anthropics/skills) | Claude 官方 Skill 仓库，含文档、PDF、PPT、设计等 |
| **Anthropic** | [Agent Skills 文档](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview) | 官方 Skill 规范与使用指南 |
| **OpenAI** | [GPT Actions 文档](https://platform.openai.com/docs/actions/) | 为 Custom GPT 配置外部 API 的「动作」机制 |

Skill 和 Tool 常一起使用：Skill 提供「怎么做」的指导，Tool 提供「实际执行」的能力。

---

## 小结：概念之间的关系

```
用户输入 (Prompt)
    ↓
[Context Window] ← 限制单次可处理的 Token 总量
    ↓
LLM 处理 (按 Token 切分)
    ↓
根据需要调用 Tool (如通过 MCP)
    ↓
结合 Skill 中的指导
    ↓
生成回复 (输出 Token)
```

理解这些概念后，你就能更清楚地：

- 控制输入长度和成本（Token）
- 设计合适的 Prompt 和 System Prompt
- 在 Context Window 内合理安排内容
- 通过 Tool 和 Skill 扩展模型能力

---

## 使用 MCP 与 Skill 时请注意安全

MCP 和 Skill 都会直接影响 AI 的行为与可访问的资源，使用前务必重视安全：

- **来源可信**：优先选择官方维护或知名开源项目，避免来历不明的第三方服务器或技能包
- **自建或精选**：有条件时自行部署 MCP、编写 Skill，或从可信渠道精选后使用
- **先审后用**：安装或加载前查看代码与内容，或先交给 AI 帮你审查一遍是否有可疑逻辑
- **警惕投毒**：恶意 MCP 可能窃取凭证、篡改数据或植入后门；恶意 Skill 可能植入误导性规则、泄露隐私或操纵模型行为——切勿盲目信任社区分享的配置

---

如果你在开发或使用 AI 产品时遇到具体问题，欢迎在评论区交流。
