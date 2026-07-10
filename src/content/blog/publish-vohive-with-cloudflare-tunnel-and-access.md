---
title: "使用 Cloudflare Tunnel 与 Access 安全发布内网 VoHive"
date: 2026-07-06
lastmod: 2026-07-06
slug: "publish-vohive-with-cloudflare-tunnel-and-access"
description: "使用 Cloudflare Tunnel 将内网 VoHive 安全发布到公网，并通过 Cloudflare Access 增加邮箱验证与访问策略。"
tags: ['Cloudflare', 'Cloudflare Tunnel', 'Zero Trust', 'VoHive', 'Self-hosted']
categories: ['技术实践']
draft: false
---

VoHive 原本只运行在家中 Ubuntu 服务器的 `http://192.168.1.21:7575`。我希望在外面也能查看设备和短信通知，但又不想把 7575 端口直接映射到公网。

最后采用的方案是：

```text
浏览器
  ↓ HTTPS
Cloudflare Access（邮箱验证码、访问策略）
  ↓
Cloudflare Tunnel
  ↓ 主机主动建立的出站连接
Ubuntu 上的 cloudflared
  ↓ 127.0.0.1:7575
VoHive
```

最终访问地址为 `https://vohive.somlar.com`。未通过 Access 身份验证的请求不会到达 VoHive；通过后还需要面对 VoHive 自身的登录验证，相当于保留了两层防护。

## 为什么不直接做端口转发

直接在路由器上把公网端口映射到 `192.168.1.21:7575` 虽然简单，但会把应用登录页直接暴露给互联网，也要求家庭宽带拥有可用的公网入口。

Cloudflare Tunnel 的 `cloudflared` 由内网主机主动向 Cloudflare 建立出站连接，因此：

- 不需要在爱快、OpenWrt 或上级路由器上开放入站端口；
- 不依赖固定公网 IPv4；
- 浏览器只访问 Cloudflare，不会看到源站地址；
- 可以在应用前增加 Cloudflare Access 身份验证和白名单策略。

这并不代表可以忽略源站安全。VoHive 自身密码、系统更新、备份和最小权限仍然需要保留。

## 准备条件

- 一个已接入 Cloudflare DNS 的域名；
- 一台可以访问互联网、同时能访问 VoHive 的 Linux 主机；
- VoHive 已能在服务器本机通过 `http://127.0.0.1:7575` 访问；
- 具有 Cloudflare Zero Trust 配置权限。

本文使用 Ubuntu amd64。其他架构需要把安装包名称中的 `amd64` 换成对应架构。

## 1. 安装 cloudflared

### 方法一：直接安装官方 deb 包

```bash
cd /tmp
wget -O cloudflared-linux-amd64.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

sudo dpkg -i cloudflared-linux-amd64.deb
cloudflared --version
```

如果 `dpkg` 报告缺少依赖，可以执行：

```bash
sudo apt-get -f install
sudo dpkg -i /tmp/cloudflared-linux-amd64.deb
```

### 方法二：使用 Cloudflare APT 软件源

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt-get update
sudo apt-get install cloudflared
```

如果 Ubuntu 自己的软件源出现 `403`，应先检查 `/etc/apt/sources.list` 和 `/etc/apt/sources.list.d/` 中的镜像地址。这和 Tunnel 本身不是同一个问题，但会阻止 APT 正常安装依赖。

## 2. 登录 Cloudflare 并创建 Tunnel

在 Ubuntu 上执行：

```bash
cloudflared tunnel login
```

命令会输出一个授权网址。用浏览器打开它，选择托管目标域名的 Cloudflare Zone 并授权。成功后，本机通常会生成：

```text
~/.cloudflared/cert.pem
```

创建名为 `vohive` 的 Tunnel：

```bash
cloudflared tunnel create vohive
```

记下输出中的 Tunnel UUID。命令还会生成类似下面的凭据文件：

```text
~/.cloudflared/<TUNNEL-UUID>.json
```

不要把 `cert.pem`、Tunnel JSON 凭据、Access Token 或任何密码提交到 Git 仓库。

可以查看已有 Tunnel：

```bash
cloudflared tunnel list
```

## 3. 配置域名与源站

先让 Cloudflare 为子域名创建指向 Tunnel 的 DNS 记录：

```bash
cloudflared tunnel route dns vohive vohive.somlar.com
```

将凭据放入系统目录：

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/<TUNNEL-UUID>.json /etc/cloudflared/
sudo chmod 600 /etc/cloudflared/<TUNNEL-UUID>.json
```

创建 `/etc/cloudflared/config.yml`：

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /etc/cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: vohive.somlar.com
    service: http://127.0.0.1:7575
  - service: http_status:404
```

最后一条 `http_status:404` 是兜底规则。没有匹配前面 hostname 的流量会直接返回 404，而不会被意外转发到其他本地服务。

检查配置：

```bash
sudo cloudflared tunnel ingress validate
sudo cloudflared tunnel ingress rule https://vohive.somlar.com
```

## 4. 安装 systemd 服务

先确认前台运行正常：

```bash
sudo cloudflared --config /etc/cloudflared/config.yml tunnel run
```

看到连接成功后按 `Ctrl+C` 退出，再安装系统服务：

```bash
sudo cloudflared --config /etc/cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
```

检查状态和日志：

```bash
systemctl status cloudflared --no-pager
journalctl -u cloudflared -n 100 --no-pager
```

需要持续观察时：

```bash
journalctl -u cloudflared -f
```

此时域名已经能够经过 Tunnel 到达 VoHive，但不要止步于此。下一步要用 Access 给入口加锁。

## 5. 创建 Cloudflare Access 应用

进入 Cloudflare Zero Trust 控制台：

1. 打开“访问控制 → 应用程序”；
2. 新建“自托管”应用；
3. 应用名称填写 `VoHive`；
4. 公共主机名填写 `vohive.somlar.com`；
5. 会话持续时间根据需要设置，本文使用 24 小时；
6. 新建一个 `Allow` 策略；
7. `Include` 选择“电子邮件”，填写允许访问的邮箱；
8. 保存策略并创建应用。

策略应该尽量具体，不要为了省事直接选择“所有人”。如果有多人使用，可以加入多个邮箱，或者接入 Google、GitHub、Microsoft Entra ID 等身份提供商。

![Cloudflare Zero Trust 中的 VoHive Access 应用](https://cdn.somlar.com/2026/07/cloudflare.png)

创建完成后，访问域名会先显示 Cloudflare Access 登录页。本文使用邮箱一次性验证码：

![访问 VoHive 时首先出现 Cloudflare Access 登录页](https://cdn.somlar.com/2026/07/access.png)

## 6. 验证是否真的被 Access 保护

不要只看网页能否打开，还应从未登录状态检查 HTTP 响应：

```bash
curl -I https://vohive.somlar.com
```

正确结果通常包括：

```text
HTTP/2 302
location: https://<TEAM-NAME>.cloudflareaccess.com/cdn-cgi/access/login/...
www-authenticate: Cloudflare-Access ...
```

这表明请求首先被重定向到 Cloudflare Access，而不是直接看到 VoHive 登录页。

还需要完成以下测试：

- 不在白名单中的邮箱不能通过验证；
- 白名单邮箱可以收到验证码并登录；
- Access 登录成功后能正常打开 VoHive；
- 重启 Ubuntu 后 `cloudflared` 自动恢复；
- 家中路由器没有为 7575 创建公网端口转发；
- 停止 `cloudflared` 后公网入口无法访问源站。

重启后的检查命令：

```bash
sudo reboot

# 重新连接服务器后
systemctl is-enabled cloudflared
systemctl is-active cloudflared
journalctl -u cloudflared -b --no-pager
```

## 日常维护与故障排查

### 域名返回 502

通常是 Tunnel 在线，但 `cloudflared` 无法连接本地 VoHive：

```bash
curl -I http://127.0.0.1:7575
ss -lntp | grep 7575
journalctl -u cloudflared -n 100 --no-pager
```

确认 VoHive 进程存在、监听端口正确，并且 `config.yml` 没有写错协议或端口。

### 域名无法解析

```bash
dig vohive.somlar.com
cloudflared tunnel list
cloudflared tunnel info vohive
```

检查 DNS 记录是否指向正确的 Tunnel，以及域名是否确实由当前 Cloudflare 账户管理。

### 能看到 VoHive，却没有 Access 登录页

这说明 Access 应用可能没有覆盖当前 hostname，或者策略配置过宽。检查：

- Access 应用的公共主机名是否完全等于访问域名；
- 应用是否启用；
- 是否存在 `Bypass` 或“所有人”规则；
- 浏览器是否还保留着有效的 Access Cookie。可用无痕窗口再次测试。

### Tunnel 服务没有自动启动

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

同时确认 `/etc/cloudflared/config.yml` 和凭据文件路径正确，服务用户能够读取 JSON 凭据。

## 安全清单

- 不开放 VoHive 的公网端口转发；
- Access 策略只允许明确的邮箱或身份组；
- 保留 VoHive 自身登录验证；
- 不在博客、截图或 Git 中公开 Tunnel 凭据和 Token；
- 定期更新 Ubuntu、VoHive 与 cloudflared；
- 定期检查 Access 审计日志和 `cloudflared` 服务日志；
- 备份 VoHive 配置，但不要把明文密钥提交到仓库；
- 如果邮箱账户支持，开启 MFA。

## 常用命令速查

```bash
# 版本
cloudflared --version

# Tunnel
cloudflared tunnel list
cloudflared tunnel info vohive

# 配置检查
sudo cloudflared tunnel ingress validate
sudo cloudflared tunnel ingress rule https://vohive.somlar.com

# 服务状态
systemctl is-active cloudflared
systemctl status cloudflared --no-pager

# 日志
journalctl -u cloudflared -n 100 --no-pager
journalctl -u cloudflared -f

# 公网入口检查
curl -I https://vohive.somlar.com

# 本地源站检查
curl -I http://127.0.0.1:7575
ss -lntp | grep 7575
```

## 参考资料

- [Cloudflare Tunnel 官方文档](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [安装和运行本地管理的 Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/)
- [Cloudflare Access 自托管应用](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Access 策略](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)

这套方案的关键不是“给内网服务套一个域名”，而是把公网入口、传输通道和身份认证拆开处理：Tunnel 负责安全地连接内网，Access 负责决定谁能进来，VoHive 自身再负责应用内权限。这样比裸露端口更容易维护，也更适合长期运行的家庭服务。
