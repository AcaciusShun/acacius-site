---
title: "【教程】如何从其他 Mastodon 实例批量下载与导入自定义表情（完整指南）"
date: 2025-10-25T00:00:00+08:00
lastmod: 2025-10-25T00:00:00+08:00
slug: "copy-emoji"
description: "在维护 Mastodon 自建站点时，为服务器导入更多有趣的自定义表情可以大幅提升社区体验。本教程结合实际部署经验，详细介绍如何从其他 Mastodon 实例批量下载与导入自定义表情。"
tags: ["mastodon", "self-hosted"]
categories: ["mastodon"]
---

在维护 Mastodon 自建站点时，为服务器导入更多有趣的自定义表情可以大幅提升社区体验。本教程结合实际部署经验，详细介绍如何：

- 从其他 Mastodon 实例批量下载表情
- 使用脚本自动抓取表情
- 批量上传至 Docker 容器
- 使用 `tootctl` 导入表情

本教程适用于 Docker Compose 部署的 Mastodon 环境。

参考资料：

- Ein Verne Blog: *Mastodon 自定义表情*
- 表情下载工具：https://github.com/Starainrt/emojidownloader/releases

------

# 📥 一、使用开源脚本批量下载其他实例的表情

为了从其他 Mastodon 网站抓取表情，我们使用开源工具：

> **Starainrt / emojidownloader**
>  GitHub: https://github.com/Starainrt/emojidownloader

此工具可自动抓取其他实例公开的自定义表情。

------

## 1. 下载最新发布的二进制文件

进入 Release 页面：

> https://github.com/Starainrt/emojidownloader/releases

右键复制你需要的版本下载地址（Linux 平台）。

例如（版本可能更新）：

```
https://github.com/Starainrt/emojidownloader/releases/download/v0.1.0/emoji_downloader_linux_x86_64
```

------

## 2. 在服务器上下载脚本

```
wget https://github.com/Starainrt/emojidownloader/releases/download/v0.1.0/emoji_downloader_linux_x86_64
```

## 3. 添加执行权限

```
chmod +x ./emoji_downloader_linux_x86_64
```

## 4. 执行程序

```
./emoji_downloader_linux_x86_64
```

启动后，程序会提示输入：

- 你想下载表情的 **Mastodon 站点地址**（如：`m.somincola.org`）
- 输出目录（默认会保存在当前目录下）
- 是否自动按分类导出为多个 `.tar.gz`

程序运行完毕后，你将得到多个 `.tar.gz` 的表情包，结构类似：

```
~/myEmojis/
├── blob.tar.gz
├── NeoCat.tar.gz
├── Usamaru.tar.gz
├── 小鹦鹉.tar.gz
├── 阿鲁.tar.gz
└── ...
```

![](https://cdn.somlar.com/2026/02/f7bec5ee802b480ae47ce8b8d1c37938.png)


接下来即可将这些文件导入到本地实例中。

------

# 📦 二、确认 Mastodon Web 容器名称

使用 Docker Compose 时，Web 容器通常为：

```
mastodon-web-1
```

如需确认：

```
docker ps --format "table {{.Names}}\t{{.Image}}"
```

------

# 📤 三、批量上传表情包到容器

将所有 `.tar.gz` 文件复制进容器 `/tmp/` 目录：

```
for f in ~/myEmojis/*.tar.gz; do
  docker cp "$f" mastodon-web-1:/tmp/$(basename "$f");
done
```

复制结束后，容器内 `/tmp` 将包含：

```
/tmp/blob.tar.gz
/tmp/NeoCat.tar.gz
/tmp/Usamaru.tar.gz
...
```

------

# 🎨 四、使用 tootctl 导入表情包

命令格式：

```
bin/tootctl emoji import --category=<分类名> /tmp/<文件名>.tar.gz
```

在 Docker 中执行：

```
docker exec -it mastodon-web-1 bin/tootctl emoji import --category=Blob /tmp/blob.tar.gz
```

以下为示例（实际按你的文件命名）：

```
docker exec -it mastodon-web-1 bin/tootctl emoji import --category=Blob /tmp/blob.tar.gz
docker exec -it mastodon-web-1 bin/tootctl emoji import --category=NeoCat /tmp/NeoCat.tar.gz
docker exec -it mastodon-web-1 bin/tootctl emoji import --category=Usamaru /tmp/Usamaru.tar.gz
docker exec -it mastodon-web-1 bin/tootctl emoji import --category=Others /tmp/其他.tar.gz
docker exec -it mastodon-web-1 bin/tootctl emoji import --category=Parrot /tmp/小鹦鹉.tar.gz
docker exec -it mastodon-web-1 bin/tootctl emoji import --category=Aru /tmp/阿鲁.tar.gz
docker exec -it mastodon-web-1 bin/tootctl emoji import --category=McD /tmp/麦当当.tar.gz
```

![](https://cdn.somlar.com/2026/02/9387d6b595773b578f8ec30e25c183bc.png)

------

# ✔️ 五、在后台检查导入结果

访问：

```
https://你的域名/admin/custom_emojis
```

你会看到所有新导入的表情与分类。

------

# 🧹 六、可选：删除临时文件

```
docker exec -it mastodon-web-1 rm /tmp/*.tar.gz
```

------

# ⚠️ 可能遇到的问题

### **1. ImageMagick 缺失**

如果出现 `convert not found`：

```
docker exec -it mastodon-web-1 apt-get update
docker exec -it mastodon-web-1 apt-get install -y imagemagick
```

------

# 🚀 七、（可选）一键批量导入脚本

如需高频更新表情，可使用：

```
#!/bin/bash
WEB="mastodon-web-1"
DIR="$HOME/myEmojis"

for f in $DIR/*.tar.gz; do
  name=$(basename "$f")
  echo "Uploading: $name"
  docker cp "$f" $WEB:/tmp/$name

  category="${name%%.*}"
  echo "Importing: $name → category $category"
  docker exec -it $WEB bin/tootctl emoji import --category="$category" /tmp/$name
done
```

------

# 📝 总结

本教程完成了从下载到导入的完整流程：

1. 使用 **emojidownloader** 从其他实例抓取表情
2. 自动生成多个 `.tar.gz` 包
3. 批量上传到 Mastodon Web 容器
4. 使用 `tootctl emoji import` 导入
5. 后台验证

适用于所有 Docker Compose 安装的 Mastodon 站点。