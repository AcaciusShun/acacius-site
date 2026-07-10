---
title: "VoHive 短信通知故障复盘：Telegram 与 Email 为什么没有推送"
date: 2026-07-06
lastmod: 2026-07-06
slug: "vohive-sms-notification-troubleshooting"
description: "复盘一次 VoHive 已收到短信、Telegram Bot 与 Email 却没有通知的问题，并总结代理、Chat ID、SMTP、DNS和服务日志的排查方法。"
tags: ['VoHive', 'Telegram Bot', 'SMTP', 'OpenClash', '故障排查']
categories: ['技术实践']
draft: false
---

今天处理了一个很典型的 VoHive 故障：设备在线，短信也已经出现在管理页面中，但 Telegram Bot 和 Email 都没有收到转发。

这类问题很容易让人把注意力放在 4G 模块、SIM 卡或 VoWiFi 上，实际上，“收到短信”和“把短信通知出去”是两条不同的链路。最终的问题集中在通知渠道的配置与网络访问，而不是模块本身。

本文按真实排查顺序复盘整个过程。所有密码、Token、Chat ID 和邮箱凭据均已省略。

## 先理解通知链路

一条短信从模块到达手机或邮箱，大致要经过下面几层：

```text
SIM / 4G 模块
  ↓ AT、QMI 或 VoWiFi 事件
VoHive 设备管理器
  ↓ 解析并写入短信记录
VoHive 通知分发器
  ├─ Telegram Bot → HTTP 代理 → api.telegram.org
  └─ Email → DNS → SMTP 服务器
```

因此，管理页面已经能看到短信，只能证明前半段正常：

- SIM 和模块收到了短信；
- VoHive 识别并保存了短信事件；
- Web 页面可以读取该记录。

它并不能证明 Telegram、SMTP、DNS 或代理配置正确。

## 第一步：不要先重启，先看日志

先围绕通知关键字筛选日志：

```bash
sudo journalctl -u vohive -n 800 --no-pager \
  | grep -Ei 'email|smtp|邮件|telegram|通知|proxy|发送.*失败'
```

其中最有用的是 `channel_count`：

- `channel_count: 0`：没有通知渠道成功初始化；
- `channel_count: 1`：只有一个渠道可用；
- `channel_count: 2`：本机的 Telegram 与 Email 都已初始化。

如果日志出现：

```text
通知渠道发送失败 channel=email
```

说明短信事件已经触发，只是 Email 发送失败。`channel=telegram` 同理。这个判断能快速把模块、SIM 和短信解析排除在外。

另外，下面这类日志通常不是故障：

```text
VoWiFi 短信已过滤
```

运营商 OTA 或无法解码的二进制短信可能会被主动过滤，本来就不会作为普通短信推送。

## 第二步：验证 OpenClash 代理

本次网络中，VoHive 运行在 Ubuntu，Telegram API 需要通过 OpenWrt 上的 OpenClash 访问：

```text
OpenWrt / OpenClash: 192.168.1.2
HTTP 代理端口:       7890
SOCKS5 代理端口:     7891
```

先检查端口：

```bash
nc -zvw3 192.168.1.2 7890
nc -zvw3 192.168.1.2 7891
```

端口连通只说明 TCP 可达，不代表认证或代理转发成功。必须继续通过代理请求 Telegram API：

```bash
curl --max-time 15 \
  --proxy-user 'Clash:<CLASH_PASSWORD>' \
  -x http://192.168.1.2:7890 \
  -I https://api.telegram.org
```

也可以测试 SOCKS5：

```bash
curl --max-time 15 \
  --proxy-user 'Clash:<CLASH_PASSWORD>' \
  --socks5-hostname 192.168.1.2:7891 \
  -I https://api.telegram.org
```

这里使用 `--socks5-hostname`，让域名也通过代理解析，避免本机 DNS 先把请求卡住。

## 第三个坑：VoHive 代理字段必须是完整 URL

VoHive 的 Telegram `proxy` 字段不是简单的“IP + 端口”，而是一个完整代理 URL。采用 OpenClash HTTP 端口时，应填写：

```text
http://Clash:<CLASH_PASSWORD>@192.168.1.2:7890
```

本次排查中遇到过几种错误写法。

### 把 IP 和端口写成一个地址

```text
192.168.1.2.7891
```

这无法解析出有效端口，程序可能尝试连接 `:0`。

### 缺少协议

```text
192.168.1.2:7890
```

URL 解析器不知道这是 HTTP 还是 SOCKS，日志可能出现：

```text
first path segment in URL cannot contain colon
```

### 缺少认证信息

```text
http://192.168.1.2:7890
```

如果 OpenClash 开启了 HTTP/SOCKS 认证，代理会返回：

```text
407 Proxy Authentication Required
```

保存正确配置后，日志中应看到类似信息：

```text
Telegram Bot 使用代理
已授权账户 (TG)
Telegram Bot 命令监听已启动
```

注意：部分日志可能完整打印带密码的代理 URL。复制日志到群聊、Issue 或博客前，一定要先脱敏。

## 第四个坑：`chat not found` 与代理无关

代理正常、Bot Token 也正确时，Telegram 的 `getMe` 请求会成功。但发送通知仍可能返回：

```text
Bad Request: chat not found
```

这通常不是网络问题，而是 Telegram 不允许机器人向当前 Chat ID 发送消息。依次检查：

1. 在 Telegram 中找到机器人，先主动发送 `/start`；
2. VoHive 中填写数字 Chat ID，而不是机器人 ID、用户名或手机号；
3. 如果目标是群组，确认机器人已经加入；
4. 群组 Chat ID 通常是负数，不要漏掉负号。

到这一步，Telegram 通知链路才能算真正打通。

## 第五步：SMTP 的端口与 TLS 模式要匹配

本次使用 Brevo SMTP Relay，最终工作的组合是：

```text
SMTP Host: smtp-relay.brevo.com
SMTP Port: 587
Use SSL:   false
```

这里的 `Use SSL=false` 并不代表邮件明文裸奔。对当前程序来说：

- `Use SSL=true`：连接建立时立即使用隐式 TLS，通常配合端口 `465`；
- `Use SSL=false`：先建立普通 SMTP 会话，再使用 STARTTLS，通常配合端口 `587`。

如果把端口 `587` 与隐式 TLS 组合，常见错误是：

```text
tls: first record does not look like a TLS handshake
```

服务器在等待普通 SMTP/STARTTLS，而客户端把它当成连接即 TLS，双方自然无法握手。

如果日志显示：

```text
535 5.7.8 Authentication failed
```

则说明 DNS、网络和 SMTP 端口其实都已经正常，失败点是用户名或密码。Brevo 应使用专门的 SMTP 凭据，而不是网站登录密码，也不要把 API Key 当成 SMTP 密码。

## 第六步：DNS 超时不要误判成 SMTP 密码错误

排查中还出现过：

```text
dial tcp: lookup smtp-relay.brevo.com on 127.0.0.53:53:
read udp ... ->127.0.0.53:53: i/o timeout
```

`127.0.0.53` 是 Ubuntu `systemd-resolved` 提供的本地 DNS stub，不是 SMTP 服务器。出现这条日志时，程序甚至还没连接到 Brevo，更谈不上验证 SMTP 密码。

可以分别检查本机解析、OpenWrt DNS 和公共 DNS：

```bash
resolvectl status
resolvectl query smtp-relay.brevo.com
nslookup smtp-relay.brevo.com 192.168.1.2
nslookup smtp-relay.brevo.com 1.1.1.1
```

如果使用 OpenClash Fake-IP，解析结果可能落在 `198.18.0.0/16`，这不一定异常。前提是 Ubuntu 的对应流量确实经过 OpenWrt/OpenClash，否则它拿到 Fake-IP 后却没有代理接管，连接就会失败。

偶发一次 DNS 超时、随后自动恢复，可以先观察；如果持续出现，再检查 Ubuntu 的默认路由、上游 DNS 和 OpenWrt 服务稳定性。

## 配置修改后如何安全重启

很多通知设置可以热更新，但遇到状态没有刷新时，可以重启 VoHive：

```bash
sudo systemctl restart vohive
sudo systemctl status vohive --no-pager
sudo journalctl -u vohive -n 150 --no-pager
```

如果服务长时间停留在 `deactivating`，可能是设备工作线程仍在等待 AT/QMI 操作。确认不会中断重要操作后，再使用：

```bash
sudo systemctl kill vohive
sudo systemctl reset-failed vohive
sudo systemctl start vohive
```

不要把“重启服务”当成排障方法本身。重启只是让新配置重新加载，真正的问题仍应从重启前后的日志中确认。

## 最后的验证方式

修复后不要只看“测试连接成功”，而应发送一条新的真实短信，验证完整链路：

1. VoHive 页面出现短信；
2. 日志记录短信事件；
3. `channel_count` 显示两个渠道已启用；
4. Telegram 收到正文；
5. Email 收到同一条短信；
6. 日志中没有 `通知渠道发送失败`。

本次最终结果是 Telegram Bot 与 Email 都成功收到重启后的测试短信。

需要注意，某次通知发送失败后，VoHive 通常不会在网络恢复时自动补发同一条消息。因此修复配置后，应使用一条新短信做验证，而不是一直等待旧通知出现。

## 一份可复用的排障顺序

下次再遇到“页面有短信，但没有推送”，可以直接按下面顺序处理：

```text
1. 页面是否已经收到短信？
   ├─ 否：查模块、SIM、AT/QMI、VoWiFi
   └─ 是：继续

2. 日志中 channel_count 是否大于 0？
   ├─ 否：查通知渠道配置是否成功加载
   └─ 是：继续

3. Telegram 失败？
   ├─ 连接失败：查代理地址、端口、认证
   ├─ 407：补代理用户名和密码
   └─ chat not found：查 /start 和 Chat ID

4. Email 失败？
   ├─ DNS timeout：查 systemd-resolved 与上游 DNS
   ├─ TLS handshake：查 465/587 与 SSL 模式
   └─ 535：查 SMTP 专用凭据

5. 保存或重启后，用一条新短信验证全链路
```

## 总结

这次故障表面上是“VoHive 没有推送”，实际上由几个独立问题叠加而成：代理 URL 格式、OpenClash 认证、Telegram Chat ID、SMTP TLS 模式，以及一次临时 DNS 超时。

最有效的做法不是反复修改和重启，而是沿着链路逐层验证：短信事件、渠道初始化、代理访问、Telegram 授权、DNS、SMTP 握手和最终发送。每一层都有很明确的日志特征，把它们分开后，问题就不再像一团雾。
