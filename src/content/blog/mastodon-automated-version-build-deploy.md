---
title: "为定制版 Mastodon 设计自动版本检测、镜像构建与部署流水线"
date: 2026-07-28
description: "拆解一条面向自托管 Mastodon 的 GitHub Actions 流水线：锁定上游版本线、验证自定义 Patch、构建 Web 与 Streaming 镜像，并在通过门禁后部署。"
tags: ["Mastodon", "GitHub Actions", "Docker", "CI-CD", "Self-hosted"]
categories: ["开发实践"]
draft: false
---

维护带有少量定制的 Mastodon 时，最耗时的通常不是 Docker 构建，而是重复判断：

- 上游是否发布了新的稳定版本？
- 当前 Patch 还能否应用？
- Web 与 Streaming 镜像是否来自同一个 tag？
- 数据库迁移应该在什么时候执行？
- 构建成功、部署失败时，版本状态应该怎样记录？

我把这些判断整理成一条 GitHub Actions 流水线。它每周检查指定的 Mastodon 版本线，也支持手动选择 tag；只有 Patch 验证通过后才会构建镜像，并可继续通过 SSH 更新服务器。

本文只展示通用结构。镜像命名、仓库地址、账号、域名、服务器路径和凭据均使用占位符。

## 先定义自动化边界

“自动检测最新版”不应等于“自动跨越所有版本”。

当前流程只自动选择符合以下规则的稳定 tag：

```text
v4.6.<纯数字补丁版本>
```

`v4.6.4` 会被选中，预发布版本和 `v4.7.x` 不会被自动采用。原因是补丁版本通常适合走快速兼容性验证，而新的 minor 或 major 版本更可能调整数据库、前端资源、趋势模型或 Docker 构建方式。

手动触发仍可传入指定 tag，用于提前验证下一条版本线，但不会绕过 Patch 门禁。

## 流水线总览

整个过程拆成五个 job：

```text
定时 / 手动触发
        |
        v
1. detect-version
   读取上游 tag，与 .current-version 比较
        |
        +-- 无变化 --> 结束
        |
        v
2. validate-patches
   在干净的官方源码上预检、应用、验证 Patch
        |
        +-- 失败 --> 结束，不构建、不连接服务器
        |
        v
3. build
   矩阵构建 Web 与 Streaming 镜像并推送
        |
        v
4. deploy
   拉取镜像、执行 migration、重建服务
        |
        v
5. post-build
   记录已构建版本并创建发布说明
```

Job 之间用 `needs` 建立依赖。验证失败时，后续构建天然不会开始，而不是依靠每个 shell step 自己判断是否继续。

![GitHub Actions 中一次完整的 Mastodon 自动构建与部署运行记录](https://cdn.somlar.com/2026/07/0a29e6b530200122510c83c8b50b6864.png)

## 第一步：检测上游稳定版本

Workflow 支持三种手动输入：

| 参数 | 作用 |
| --- | --- |
| `version` | 指定要构建的上游 tag；留空时自动检测 |
| `force` | 即使版本未变化也重新构建 |
| `skip_deploy` | 只构建镜像，不连接服务器 |

![GitHub Actions 中的 Mastodon 工作流列表与手动运行参数](https://cdn.somlar.com/2026/07/797590fcfef555ac00b90b1736e58f2a.png)

自动检测的核心逻辑可以简化为：

```bash
git remote add upstream https://github.com/mastodon/mastodon.git 2>/dev/null || true
git fetch upstream --tags --quiet

TAG=$(
  git tag -l 'v4.6.*' --sort=-v:refname |
  grep -E '^v4\.6\.[0-9]+$' |
  head -1
)

CURRENT=$(cat .current-version 2>/dev/null || echo "none")

if [ "$TAG" != "$CURRENT" ] || [ "$FORCE" = "true" ]; then
  SHOULD_BUILD=true
else
  SHOULD_BUILD=false
fi
```

这里有三个细节：

1. `--sort=-v:refname` 按版本号而不是字符串排序。
2. 正则排除 alpha、beta、rc 等预发布 tag。
3. `.current-version` 保存“已经成功构建的版本”，避免定时任务重复消耗构建资源。

手动传入 `version` 时，应在实际实现中继续检查 tag 是否存在，避免错误输入直到 checkout 阶段才失败。

## 第二步：在干净源码上验证 Patch

验证 job 分别检出两个目录：

```text
fork/    # 只提供 .custom/ 与 workflow
source/  # 指定 tag 的官方 Mastodon 源码
```

然后执行：

```bash
bash fork/.custom/apply.sh \
  "$PWD/fork/.custom" \
  "$PWD/source"

bash fork/.custom/verify.sh "$PWD/source"
```

当前定制包括：

- 将本地嘟文上限从 500 调整为 5000。
- 在管理后台增加 Explore 热门嘟文、标签和链接阈值。

`apply.sh` 先对全部 Patch 执行一次 `git apply --check`，确认都能应用后才真正写入。`verify.sh` 再检查 diff、Ruby 语法、YAML 和关键修改。

这个 job 是整条流水线最重要的安全边界。Patch 上下文只要与新版本不兼容，流程就会在耗时的镜像构建和服务器操作之前失败。

## 第三步：矩阵构建两类镜像

Mastodon 的 Rails 应用和 Streaming 服务使用不同 Dockerfile，但它们必须来自同一个上游 tag。使用矩阵可以让两者共享相同构建逻辑：

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - component: web
        image: <registry-user>/mastodon
        dockerfile: Dockerfile
      - component: streaming
        image: <registry-user>/mastodon-streaming
        dockerfile: streaming/Dockerfile
```

每个组件推送三类 tag：

```text
<image>:4.6.4
<image>:4.6.4-custom
<image>:latest
```

版本 tag 用于审计和回退，`-custom` 明确表示包含本地 Patch，`latest` 供当前生产 Compose 使用。

实际构建使用 Buildx 和 GitHub Actions cache，并按组件分开 cache scope，避免 Web 与 Streaming 的缓存互相污染：

```yaml
cache-from: type=gha,scope=${{ matrix.component }}
cache-to: type=gha,mode=max,scope=${{ matrix.component }}
```

Registry 登录信息只从 GitHub Secrets 读取，不能写进 workflow 或文章示例。

## 第四步：部署顺序

构建完成后，部署 job 通过 SSH 执行：

```bash
cd <mastodon-deploy-directory>

docker compose pull
docker compose run --rm web bin/rails db:migrate
docker compose up -d
docker image prune -f
```

顺序不能随意交换：

1. `pull` 先确保节点取得刚构建的镜像。
2. `db:migrate` 使用新 Web 镜像执行官方数据库迁移。
3. `up -d` 在迁移成功后重建服务。
4. `image prune` 最后清理不再引用的旧层。

`docker compose run --rm web bin/rails db:migrate` 会创建一个临时 Web 容器，只执行 Rails migration，完成后删除容器。它不会启动完整网站，也不会清空业务数据。

生产 Compose 可以使用：

```yaml
services:
  web:
    image: <registry-user>/mastodon:latest

  sidekiq:
    image: <registry-user>/mastodon:latest

  streaming:
    image: <registry-user>/mastodon-streaming:latest
```

Web 与 Sidekiq 需要使用同一份 Rails 镜像，Streaming 则使用对应的独立镜像。

## 第五步：记录版本与发布说明

构建成功后，流程把 tag 写入 `.current-version`：

```bash
echo "$VERSION" > .current-version
git add .current-version
git commit -m "chore: built $VERSION"
git pull --rebase origin main
git push
```

`git pull --rebase` 用于处理构建期间主分支出现新提交的情况，降低机器人 push 被拒绝的概率。

随后创建一条 GitHub Release，记录：

- 对应的 Mastodon 上游 tag。
- Web 与 Streaming 镜像 tag。
- 当前包含的自定义功能。
- 本次部署 job 的结果。

这让“源码版本、定制内容、镜像版本”之间有一个可追踪的对应关系。

## 失败行为比成功路径更重要

可以用一张表检查各阶段失败时会发生什么：

| 失败阶段 | 镜像是否更新 | 服务器是否变更 | 处理方式 |
| --- | --- | --- | --- |
| 版本检测 | 否 | 否 | 修正 tag 或网络问题 |
| Patch 验证 | 否 | 否 | 适配 Patch 后重跑 |
| 单个镜像构建 | 不完整 | 否 | 修复构建并强制重跑 |
| Registry 推送 | 不完整 | 否 | 检查凭据与配额 |
| migration | 是 | migration 可能已执行 | 查看 Rails 输出并人工处理 |
| 服务重建 | 是 | 可能部分更新 | 检查 Compose 状态与日志 |

这里不能简单承诺“一键自动回滚”。数据库迁移是否可逆取决于上游版本，直接把镜像切回旧 tag 不一定足够。升级前仍需要数据库和媒体存储备份，并阅读 Mastodon 官方升级说明。

另一个需要明确的语义是：当前 `.current-version` 记录成功构建的版本，不是服务器实时运行版本。如果镜像构建成功但部署失败，下一次定时检查可能认为该版本已经处理过。此时应使用 `force=true` 重跑，或者增加独立的部署状态记录。

## 从零搭建的步骤

一套可复用的实施顺序是：

1. **整理定制**：把每个功能拆成独立 Patch，并提供快速验证脚本。
2. **限制自动版本线**：只允许经过评估的 minor 系列自动前进。
3. **创建版本记录**：用 `.current-version` 或制品元数据避免重复构建。
4. **配置 Secrets**：Registry 用户名与 token、服务器地址、SSH 用户、私钥和端口。
5. **加入兼容性 job**：在干净上游源码上预检、应用并验证 Patch。
6. **矩阵构建镜像**：确保 Web 与 Streaming 使用同一个 tag。
7. **先构建后部署**：任何镜像失败都不能进入服务器阶段。
8. **执行 migration**：按照官方升级顺序，在服务重建前完成。
9. **保留版本 tag**：不要让 `latest` 成为唯一可追踪的镜像。
10. **记录与告警**：保存上游版本、定制项、镜像和部署结果。

## 仍可继续改进的地方

当前流程已经减少了重复劳动，但还可以继续加强：

- 将“已构建版本”和“已部署版本”分开记录。
- 部署后请求实例健康检查和版本 API。
- 为 SSH 主机增加明确的指纹校验。
- 在高风险升级中运行受影响的 RSpec，而不只做快速语法验证。
- 为数据库与媒体备份增加独立、可验证的恢复演练。
- 把 minor 版本线做成显式配置，而不是直接写在 shell 正则中。

自动化的价值不是让升级无人负责，而是把重复步骤固化，把不兼容尽可能提前暴露，并留下足够清楚的人工接管点。

## 相关代码

- [自动检测、构建与部署 Workflow](https://github.com/somincola/mastodon/blob/main/.github/workflows/sync-build-deploy.yml)
- [Patch 应用脚本](https://github.com/somincola/mastodon/blob/main/.custom/apply.sh)
- [定制验证脚本](https://github.com/somincola/mastodon/blob/main/.custom/verify.sh)
