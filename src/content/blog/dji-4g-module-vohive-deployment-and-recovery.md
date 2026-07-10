---
title: "大疆 4G 模块接入 VoHive：部署、USB ID 修改与恢复记录"
date: 2026-07-05
lastmod: 2026-07-06
slug: "dji-4g-module-vohive-deployment-and-recovery"
description: "在 PVE 的 Ubuntu 虚拟机中接入大疆 4G 模块、部署 VoHive、修改 USB ID，并记录驱动绑定与恢复方法。"
tags: ['VoHive', 'DJI', 'Quectel', 'LTE', 'Proxmox VE', 'Linux']
categories: ['技术实践']
draft: false
---

本文记录如何在 PVE 的 Ubuntu 虚拟机中接入大疆 4G 模块（一代）、部署 VoHive v1.5.5，并把模块的私有 USB ID 改为 Linux 可直接识别的移远 EC25 标准 ID。VoHive 运行在 Ubuntu 中，这并不是给模块刷入 VoHive 固件。

> **高风险提醒**：`AT+QCFG="usbcfg"` 修改的是 4G 模块自身的持久化配置。虚拟机快照、系统备份都无法回滚这项修改。不同硬件版本的参数也未必相同，请先读取并保存原值，不要直接照抄写入命令。

## 最终效果与网络结构

本次环境：

- PVE：`192.168.1.254:8006`
- Ubuntu：VM 102，`x86_64`，2 GiB 内存，地址 `192.168.1.21`
- PVE USB 直通：`usb0: host=3-4`，按物理 USB 端口绑定
- 模块：大疆 4G 模块（一代），内部平台为移远 EG25/EC25 系列
- 修改前 USB ID：`2ca3:4006 DJI Technology Co., Ltd. Baiwang`
- 修改后 USB ID：`2c7c:0125 Quectel Wireless Solutions Co., Ltd. EC25 LTE modem`
- 串口/QMI 驱动：`option1`、`qmi_wwan`
- 设备节点：`/dev/ttyUSB0`～`/dev/ttyUSB3`、`/dev/cdc-wdm0`、`wwan0`
- VoHive：v1.5.5，由 systemd 管理

## 一、识别大疆私有 USB ID

模块最初使用私有 ID `2ca3:4006`，不在通用 Linux 驱动的默认匹配表中。因此先临时让串口和 QMI 驱动接管设备：

```bash
sudo modprobe option
sudo modprobe qmi_wwan

printf '2ca3 4006\n' | sudo tee /sys/bus/usb-serial/drivers/option1/new_id
printf '2ca3 4006\n' | sudo tee /sys/bus/usb/drivers/qmi_wwan/new_id
```

验证设备节点和网络接口：

```bash
lsusb
ls -l /dev/ttyUSB* /dev/cdc-wdm*
ip -br link show wwan0
```

私有 ID 的动态绑定在重启后可能丢失，因此曾建立以下自动绑定组件：

```text
/usr/local/sbin/bind-baiwang-modem
/etc/systemd/system/baiwang-modem-bind.service
/etc/udev/rules.d/80-baiwang-modem.rules
```

改为标准移远 ID 后，内核可以直接识别，这些组件即可删除。

### 一个常见的权限坑

不要使用下面的写法，`>` 重定向仍由普通用户的 shell 执行：

```bash
sudo echo 2ca3 4006 > /sys/bus/usb-serial/drivers/option1/new_id
```

应使用 `tee`：

```bash
printf '2ca3 4006\n' | sudo tee /sys/bus/usb-serial/drivers/option1/new_id
```

## 二、确认 AT 端口

安装 `socat`：

```bash
sudo apt-get update
sudo apt-get install -y socat
```

再用只读的 `ATI` 命令测试 `/dev/ttyUSB2`：

```bash
printf 'ATI\r\n' | sudo timeout 8 socat -T 4 - /dev/ttyUSB2,crnl
```

本次模块返回：

```text
Baiwang
QDC507
Revision: QDC507GLEFM21
OK
```

不同模块的 AT 端口不一定都是 `/dev/ttyUSB2`，应逐个用只读命令确认。`timeout 8` 和 `socat -T 4` 是双重超时，可避免终端一直等待输入或响应。

## 三、恢复并部署 VoHive v1.5.5

当时 GitHub Release 中的对应二进制已经不存在，最终找回的文件为：

```text
vohive_v1.5.5_linux_amd64
```

原始文件 SHA-256：

```text
3dd53751eaba8aa3a30a312f65a5ad950b6ba2e677254d2f5608c4d9228a6df7
```

文件为 x86-64 Linux 静态 ELF，内嵌版本为 v1.5.5。

> SHA-256 只能确认文件一致，不能证明文件安全。应优先使用官方 Release 或自行从源码构建；第三方来源的二进制应先在隔离环境中检查。

本次安装目录：

```text
/opt/vohive/bin/vohive
/opt/vohive/config/config.yaml
/opt/vohive/data
/opt/vohive/logs
```

systemd 服务实际执行：

```text
/opt/vohive/bin/vohive -c /opt/vohive/config/config.yaml
```

常用服务命令：

```bash
sudo systemctl enable --now vohive
sudo systemctl status vohive --no-pager
sudo journalctl -u vohive -n 100 --no-pager
```

Web 管理地址为 `http://192.168.1.21:7575`。首次登录后应立即修改默认密码。

## 四、在 VoHive 中添加模块

VoHive 扫描到的原始硬件信息：

```text
VID/PID:       2ca3:4006
AT 端口:       /dev/ttyUSB2
QMI 控制口:    /dev/cdc-wdm0
网络接口:      wwan0
后端模式:      qmi
```

我使用的设备配置为：

```text
设备 ID:       baiwang-1
设备名称:      Baiwang QDC507
QMI proxy:     启用
qmi-proxy:     /usr/libexec/qmi-proxy
```

添加后先确认 SIM、短信和日志状态，再按需启用数据连接。

## 五、把 USB ID 改为移远标准值

### 1. 先确认 PVE 的直通方式

在 PVE 节点执行：

```bash
qm config 102
```

本机配置：

```text
usb0: host=3-4
```

这是按物理端口直通，VID/PID 改变后设备仍能重新进入 VM。若配置类似 `host=2ca3:4006`，应先改成物理端口直通，否则模块重启、ID 改变后可能直接从虚拟机中消失。

### 2. 停止可能占用端口的进程

```bash
sudo systemctl stop vohive
sudo systemctl stop ModemManager
sudo killall -9 qmi-proxy 2>/dev/null || true
sudo fuser -v /dev/ttyUSB2 /dev/cdc-wdm0
```

若 `vohive` 长时间停在 `deactivating`，可执行：

```bash
sudo systemctl kill vohive
```

后续启动前再运行：

```bash
sudo systemctl reset-failed vohive
```

不要随手使用 `pkill -f /usr/libexec/qmi-proxy`。`-f` 匹配完整命令行，可能误杀正在执行操作的 shell。

### 3. 读取并保存原始配置

```bash
printf 'AT+QCFG="usbcfg"\r\n' \
  | sudo timeout 8 socat -T 4 - /dev/ttyUSB2,crnl
```

本次原始返回：

```text
+QCFG: "usbcfg",0x2CA3,0x4006,1,1,1,1,1,0,0
OK
```

请完整保存自己的返回值；恢复时要用它，而不是凭印象填写。

### 4. 写入标准 ID

确认硬件型号与原值无误后，才执行：

```bash
printf 'AT+QCFG="usbcfg",0x2C7C,0x0125,1,1,1,1,1,0,0\r\n' \
  | sudo timeout 8 socat -T 4 - /dev/ttyUSB2,crnl
```

返回 `OK` 后再次查询，确认保存值变为：

```text
+QCFG: "usbcfg",0x2C7C,0x125,1,1,1,1,1,0,0
```

### 5. 重启模块并验证

```bash
printf 'AT+CFUN=1,1\r\n' \
  | sudo timeout 8 socat -T 2 - /dev/ttyUSB2,crnl
```

USB 设备会暂时消失。等待约 15～30 秒后检查：

```bash
lsusb
```

预期结果：

```text
2c7c:0125 Quectel Wireless Solutions Co., Ltd. EC25 LTE modem
```

继续验证驱动和设备节点：

```bash
readlink -f /sys/class/tty/ttyUSB2/device/driver
readlink -f /sys/class/net/wwan0/device/driver
ls -l /dev/ttyUSB* /dev/cdc-wdm*
```

最后恢复服务：

```bash
sudo systemctl start ModemManager
sudo systemctl reset-failed vohive
sudo systemctl start vohive

systemctl is-active ModemManager
systemctl is-active vohive
```

修改后，VoHive 成功重新接管设备，并收到了 SIM `READY` 与网络注册状态事件。

## 六、几个容易误判的问题

### USB 重新枚举不是掉线故障

修改 USB ID 或重启模块后，`lsusb` 中的 Device 编号会改变，这是正常现象。PVE 若按 VID/PID 直通，可能无法自动找回设备；按物理端口直通通常可以恢复。

### ModemManager 与 VoHive 不要同时拨号

VoHive 可以通过 `qmi-proxy` 与 ModemManager 共用 QMI 控制口，但不应让二者同时管理 APN、数据拨号或默认路由。否则很容易出现设备忙、路由被改写或拨号状态互相覆盖。

### 页面状态会有延迟

模块重启后，Web 页面可能短暂显示 SIM 未插入、ICCID/IMSI 为空或仍在搜索网络。先等待初始化完成，再刷新设备并查看日志：

```bash
sudo journalctl -u vohive -n 100 --no-pager
```

### `qmi-proxy` 可能残留

即使服务已经停止，代理进程也可能仍占用设备：

```bash
pgrep -a qmi-proxy
sudo fuser -v /dev/cdc-wdm0
```

必要时再执行：

```bash
sudo killall -9 qmi-proxy
```

## 七、恢复为大疆原始 USB ID

下面是应急恢复流程。本次整理文档时没有再次执行恢复操作。

先停止占用服务：

```bash
sudo systemctl stop vohive
sudo systemctl stop ModemManager
sudo killall -9 qmi-proxy 2>/dev/null || true
```

当前处于 `2c7c:0125` 时，标准驱动已经生成 `/dev/ttyUSB2`，可写回本次记录的原值：

```bash
printf 'AT+QCFG="usbcfg",0x2CA3,0x4006,1,1,1,1,1,0,0\r\n' \
  | sudo timeout 8 socat -T 4 - /dev/ttyUSB2,crnl
```

查询确认后重启模块：

```bash
printf 'AT+QCFG="usbcfg"\r\n' \
  | sudo timeout 8 socat -T 4 - /dev/ttyUSB2,crnl

printf 'AT+CFUN=1,1\r\n' \
  | sudo timeout 8 socat -T 2 - /dev/ttyUSB2,crnl
```

重新枚举后，`lsusb` 应显示：

```text
2ca3:4006 DJI Technology Co., Ltd. Baiwang
```

由于通用内核可能不认识这个私有 ID，需要重新临时绑定驱动：

```bash
sudo modprobe option
sudo modprobe qmi_wwan

printf '2ca3 4006\n' | sudo tee /sys/bus/usb-serial/drivers/option1/new_id
printf '2ca3 4006\n' | sudo tee /sys/bus/usb/drivers/qmi_wwan/new_id
```

动态 `new_id` 在系统重启后可能丢失。若要长期保持大疆 ID，应重新配置 udev/systemd 自动绑定规则。最后恢复服务：

```bash
sudo systemctl start ModemManager
sudo systemctl reset-failed vohive
sudo systemctl start vohive
```

## 通知功能

Telegram、OpenClash 和邮件通知的配置与排障已单独整理为[《VoHive 短信通知故障复盘》](/blog/vohive-sms-notification-troubleshooting)，本文不再重复。

## 常用检查命令速查

```bash
# USB 身份
lsusb | grep -Ei '2ca3:4006|2c7c:0125|DJI|Baiwang|Quectel'

# 串口、QMI 与网络接口
ls -l /dev/ttyUSB* /dev/cdc-wdm*
ip -br link show wwan0

# 驱动绑定
readlink -f /sys/class/tty/ttyUSB2/device/driver
readlink -f /sys/class/net/wwan0/device/driver

# VoHive
systemctl status vohive --no-pager
sudo journalctl -u vohive -n 100 --no-pager

# PVE USB 直通（在 PVE 节点执行）
qm config 102 | grep '^usb'
```

## 小结

操作前务必保存原始 `usbcfg` 返回值，并将 PVE 配置为按物理端口直通。出现问题时，依次检查 USB 枚举、驱动、设备节点、端口占用和 VoHive 日志。
