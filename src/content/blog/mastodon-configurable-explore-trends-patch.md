---
title: "用可移除 Patch 维护 Mastodon 定制：5000 字限制与 Explore 阈值"
date: 2026-07-28
lastmod: 2026-07-28
slug: "mastodon-configurable-explore-trends-patch"
description: "从后端验证器、实例 API、动态趋势配置到兼容性门禁，记录如何用两份可独立移除的 Patch 维护 Mastodon 的 5000 字限制与 Explore 阈值。"
tags: ["Mastodon", "Ruby on Rails", "Fediverse", "Docker", "GitHub Actions"]
categories: ["开发实践"]
draft: false
---

自建 Mastodon 很容易从“只改一个常量”走向长期维护 fork：先把嘟文上限从 500 调到 5000，接着为了小站体验调整 Explore，最后每次升级都要重新确认散落在源码里的改动。

这次我把两项正在使用的定制重新整理成独立 Patch：

1. `001-character-limit.patch`：把本地嘟文上限调整为 5000。
2. `002-configurable-trends.patch`：让热门嘟文、话题标签和链接阈值可以在管理后台动态配置。

目标不是减少代码行数，而是让每项定制都能被识别、验证、升级和移除。

## 设计边界

这套实现遵循几个约束：

- 尽量复用 Mastodon 现有的数据和后台表单，不引入新的服务。
- Patch 应保持单一职责，不能把不相关功能绑在一起。
- 上游代码不兼容时，构建必须在生成镜像之前停止。
- 配置读取异常不能中断趋势定时任务。
- 没有 Patch 时，代码和数据应能回到上游默认行为。
- 示例中的仓库、镜像和服务器信息全部使用通用占位符。

这意味着实现不只是“功能可用”，还要考虑下一次 Mastodon 发布后的处理成本。

## Patch 001：把嘟文上限调整为 5000

Mastodon 对本地嘟文长度的最终约束位于：

```text
app/validators/status_length_validator.rb
```

当前 Patch 只修改一个常量：

```diff
- MAX_CHARS = 500
+ MAX_CHARS = 5000
```

看起来很简单，但这个常量同时连接了后端验证和前端展示。

```text
StatusLengthValidator::MAX_CHARS
        |
        +--> Rails 验证器：拒绝超过上限的本地嘟文
        |
        +--> Instance API：configuration.statuses.max_characters
                    |
                    +--> Web UI：发嘟框计数器与提交限制
```

实例 API 的 serializer 会把 `MAX_CHARS` 作为 `max_characters` 返回，Web UI 再从服务器配置中读取它。因此不需要额外修改 JavaScript 中的默认值，也不需要维护另一份前端常量。

这里的“字符”也不是简单的字节数。验证器使用 grapheme cluster 计数，将内容警告与正文合并计算；URL 按固定的 23 个字符计入，提及也会经过实体解析。Patch 改变的是最终上限，不会绕过这些原有规则。

### 为什么从覆盖整个文件改成最小 Patch

早期做法是在自定义 Dockerfile 中覆盖完整的 `status_length_validator.rb`。它能工作，但会把上游对该文件的后续修复一并覆盖掉。

现在只保留一行 diff。上游文件结构发生变化时，`git apply --check` 会明确失败；上游仍兼容时，新版本中的其他代码可以正常保留。这比复制一份完整文件更容易审查。

## Patch 002：让 Explore 阈值适应小站

Mastodon 4.6.x 的默认趋势条件更适合具有一定活跃规模的实例：

- 热门嘟文至少获得 5 次喜欢与转嘟的合计互动。
- 热门话题标签至少由 5 个不同账号使用。
- 热门链接至少由 5 个不同账号分享。
- 嘟文趋势分数默认每 1 小时衰减一半。
- 候选嘟文还要满足公开可见、允许发现、不是回复、没有敏感标记等条件。

对小型实例来说，5 个不同账号可能已接近一天的全部活跃用户。于是 Explore 并非没有数据，而是内容很难跨过候选阈值。

Patch 在“管理后台 → 设置 → 发现”中增加四项配置：

| 设置 | 上游默认值 | 小站起始参考值 |
| --- | ---: | ---: |
| 热门嘟文最低互动数 | 5 | 2 |
| 热门嘟文分数半衰期 | 1 小时 | 3 小时 |
| 热门话题标签最低账号数 | 5 | 2 |
| 热门链接最低账号数 | 5 | 2 |

![Mastodon 管理后台发现页面中的热门嘟文、话题标签与链接阈值配置](https://cdn.somlar.com/2026/07/eb885fd5fca7f350a0a21161895e80f7.png)

这些值复用 Mastodon 的 `Setting` 表，不需要新增 migration。保存后，趋势计算会在下一批刷新时读取新值，不需要重启 Web 或 Sidekiq。

## 动态配置如何进入趋势计算

公共读取逻辑位于 `Trends::Base`：

```ruby
def configured_integer(setting_key, fallback, min:, max:)
  value = Integer(Setting.public_send(setting_key), exception: false)
  value.nil? ? fallback : value.clamp(min, max)
rescue StandardError
  fallback
end
```

`Trends::Statuses`、`Trends::Tags` 和 `Trends::Links` 在每次计算批次开始时取得有效值。这样做是因为趋势对象可能被缓存；如果只在初始化时读取一次，管理员保存配置后仍可能继续使用旧值。

实现还保留了显式参数的优先级：

```ruby
def effective_threshold
  return options[:threshold] if option_explicitly_configured?(:threshold)

  configured_integer(
    :trends_statuses_threshold,
    options[:threshold],
    min: 1,
    max: 100
  )
end
```

这让现有调用方和测试仍可以传入自己的 `threshold`，只有未显式指定时才读取后台设置。

运行时的保护包括：

- 三项数量阈值限制为 `1–100`。
- 分数半衰期限制为 `1–168` 小时。
- 空值、非法字符串和读取异常回退到上游默认值。
- 管理后台表单执行同样的整数与范围验证。

动态配置因此不会成为趋势任务的新故障点。

## Patch 应用与验证流程

定制代码没有直接提交到上游源码目录，而是保存在：

```text
.custom/
├── apply.sh
├── verify.sh
└── patches/
    ├── 001-character-limit.patch
    └── 002-configurable-trends.patch
```

一次构建中的处理顺序如下：

```text
官方 Mastodon tag
        |
        v
按文件名收集 *.patch
        |
        v
git apply --check 全量预检
        |
        +-- 失败 --> 停止，不构建镜像
        |
        v
按顺序应用 Patch
        |
        v
Ruby / YAML / diff / 关键字段检查
        |
        +-- 失败 --> 停止，不部署服务器
        |
        v
构建 Web 与 Streaming 镜像
```

`apply.sh` 使用 `set -euo pipefail`，并在真正写入源码前一次性检查全部 Patch。这样不会出现第一份已应用、第二份失败的半完成状态。

`verify.sh` 负责：

- 执行 `git diff --check`。
- 检查受影响 Ruby 文件和测试文件的语法。
- 解析 settings 与中英文 locale YAML。
- 确认 `MAX_CHARS = 5000` 和四个趋势字段确实存在。

需要区分的是：该脚本提供快速兼容性门禁，并不等价于完整的 Mastodon RSpec 测试套件。Patch 内包含设置保存、动态读取、默认回退和后台表单的 specs；在更高风险的版本更新中仍应运行相关测试。

## 在新版本上复现验证

下面使用通用目录名演示，不包含真实仓库与凭据：

```bash
# 1. 检出准备升级的官方版本
git clone --branch v4.6.4 --depth 1 \
  https://github.com/mastodon/mastodon.git source

# 2. 预检并应用全部定制
bash fork/.custom/apply.sh \
  "$PWD/fork/.custom" \
  "$PWD/source"

# 3. 执行快速兼容性检查
bash fork/.custom/verify.sh "$PWD/source"

# 4. 按正常流程构建镜像
docker build -t <registry-user>/mastodon:4.6.4-custom source
```

生产环境中，Web 与 Sidekiq 应使用同一份包含 Rails Patch 的 Mastodon 镜像。Streaming 使用自己的 Dockerfile 构建，并保持与同一上游版本对应。

完整步骤可以概括为：

1. 固定一个明确的 Mastodon 上游 tag。
2. 在干净源码上运行 Patch 预检。
3. 应用 Patch 并执行快速验证。
4. 对受影响功能运行针对性测试。
5. 构建带版本号的镜像，不只依赖 `latest`。
6. 先执行官方升级说明要求的迁移，再重启服务。
7. 验证实例版本、发嘟上限、后台字段和 Explore 候选。

## 可移除性

两项功能互相独立：

- 删除 `001-character-limit.patch` 后，重新构建即可恢复官方字数上限。
- 删除 `002-configurable-trends.patch` 后，重新构建即可恢复官方趋势参数。

趋势 Patch 没有新增数据库结构。遗留的自定义 Setting 记录可以清理，也可以保留；未应用 Patch 的官方代码不会读取它们。

验证脚本和发布说明中的对应检查也应同步删除，避免构建流程继续寻找已经取消的功能。

## 运营边界

5000 字让成员可以发布完整长文，但不代表每条内容都适合写到上限。更低的趋势阈值也只是在小站中增加候选，不代表放弃审核。

如果没有启用“允许热门内容无需事先审核”，达到阈值的嘟文、标签和链接仍需管理员确认后才会公开显示。对于开放注册实例，建议保留人工审核，并根据候选质量逐步调整参数。

## 相关代码

- [5000 字符上限 Patch](https://github.com/somincola/mastodon/blob/main/.custom/patches/001-character-limit.patch)
- [可配置趋势阈值 Patch](https://github.com/somincola/mastodon/blob/main/.custom/patches/002-configurable-trends.patch)
- [Patch 应用脚本](https://github.com/somincola/mastodon/blob/main/.custom/apply.sh)
- [定制验证脚本](https://github.com/somincola/mastodon/blob/main/.custom/verify.sh)

真正降低维护成本的不是“改得少”，而是每一项差异都有清楚的边界、失败方式和退出路径。这样定制才能跟随上游继续演进，而不会逐渐变成无法升级的历史包袱。
