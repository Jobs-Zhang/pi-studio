# PI Studio 启动页 SSH 连接设计

日期：2026-10-13
分支：feat/desktop-and-app

## 背景与目标

PI Studio（`desktop/`，Electron 薄壳）的启动页 `connect.html` 目前只支持直连 URL + 最近使用（纯字符串历史）。当目标 PI STUDIO 网关位于 SSH 可达的内网时，桌面端无法连接。

本设计为启动页增加 **SSH 连接能力**：

1. 启动页支持 **直连 / SSH 两种模式**（分段切换，记住上次模式）。
2. SSH 模式自动识别桌面端环境：本机 OpenSSH 客户端、`%USERPROFILE%\.ssh\config`（含 `Include`）的 Host 别名，可直接选择并自动填充端口/用户/密钥。
3. 也支持手动输入：host（支持 `user@host`）、端口、用户、密钥文件或密码（二选一）、远程网关 URL。
4. 用过的连接（直连与 SSH）都进入最近使用，点击即重连；托盘菜单同步展示。
5. 隧道由 Electron 主进程在**桌面端本地**建立（启动页在连上任何服务端之前，只能依赖本地环境；服务端 `sshTunnelManager` 属于 web/API 进程，此处镜像其方案）。

非目标（YAGNI）：

- 通过 SSH 直接执行 pi 会话（远端不装 PI STUDIO 的场景，另立项目）。
- SSH agent 转发、跳板编排 UI（`~/.ssh/config` 的 `ProxyJump` 经系统 `ssh` 自然生效）。
- 多隧道并存管理界面（启动页一次只维护一个活动隧道）。
- 非 Windows 平台的打包支持（代码跨平台，打包仍按现状 Windows portable）。

## UI 设计（已确认，预览稿见 Z:\home\jobs\design-preview\desktop-connect-ssh-mockup.html）

布局沿用现有蓝紫主题卡片，自上而下：

1. Logo + 标题。
2. 「直连 | SSH」分段切换：直连面板保持现状（URL 输入 + 下拉历史）。
3. SSH 面板内分两个二级 Tab（`~/.ssh/config` / `账户密码`）：
   - **`~/.ssh/config` 页（纯 config 语义）**：只选主机别名（下拉列出本机 config 别名）+ 环境状态条（一行，仅提示检测结果/缺客户端/无配置）；不展示、不覆盖端口/用户/密钥，**无密码框、无「记住密码」**，认证完全交给系统 ssh（密钥/agent/config）；
   - **`账户密码` 页（全手动）**：SSH 地址（`user@host` 或 IP）+ 端口/用户 + 密码或密钥文件（二选一）+ 「记住密码」勾选框；
   - 两页共用：远程网关 URL（完整 URL，默认 `http://127.0.0.1:8504`，即 PI STUDIO 在 SSH 主机上可被访问的地址）。
4. 连接按钮 + 状态行（连接中/失败原因，失败保留表单可重试）。
5. 最近使用：混合列表；SSH 项带 `[SSH]` 徽标，主行显示别名，副行 `user@host:port → 网关 · 上次连接时间`；直连项同现状。悬浮删除单条、`Clear all`。
6. 快捷键提示（↑↓ 选择、Enter 连接）沿用。

交互要点：

- 默认显示上次使用的模式（`lastMode`）；SSH 面板默认停在 `~/.ssh/config` 页。
- config 页选中别名即完成输入，连接时把别名原样交给 ssh，config 对端口/用户/认证拥有完全话语权。
- 连接过程：按钮置为「连接中…」，状态行 `正在建立 SSH 隧道…` → 隧道就绪后窗口跳转 `http://127.0.0.1:<本地端口>`；失败显示可读原因（认证失败 / 超时 / 远程网关不可达），config 页认证失败时提示可切「账户密码」页。
- 最近使用点击：直连项立即连接；**config 条目永不询问密码**，直接重建隧道；手动条目有存密码/密钥则立即重连，否则切到「账户密码」页回填并聚焦密码框。副行区分来源（`来自 ~/.ssh/config` / `user@host:port → 网关`）。

## 数据模型（`~/.pi-studio-desktop/config.json`）

`recentConnections` 从字符串数组升级为结构化条目（旧字符串迁移为直连条目）：

```jsonc
{
  "lastMode": "direct",            // 或 "ssh"
  "recentConnections": [
    {
      "type": "direct",
      "url": "http://192.168.1.100:8504",
      "lastUsedAt": "2026-10-13T08:00:00.000Z"
    },
    {
      "type": "ssh",
      "via": "manual",              // 或 "config"（纯 config 别名连接）
      "host": "dev-box",            // 别名或 user@host / IP
      "port": 22,
      "user": "deploy",
      "identityFile": "~/.ssh/id_ed25519",
      "password": "<base64>",       // 仅在勾选「记住密码」时存在
      "targetUrl": "http://127.0.0.1:8504",
      "lastUsedAt": "2026-10-13T08:00:00.000Z"
    }
  ]
}
```

- 去重键：直连 = `url`；SSH = `via + host/port/user/targetUrl`（config 与手动连接同主机也是两条）；命中则移到队首并更新 `lastUsedAt`，上限 10 条。
- config 条目不存储任何认证信息；密码仅在手动条目勾选「记住密码」时存在，用 Electron `safeStorage`（Windows DPAPI）加密后以 base64 存储；**加密不可用时密码不落盘**（其余字段照常保存），避免降级为明文。
- 渲染进程永远看不到已存密码：重连时由主进程内部解密后直接用于建隧道。

## 进程内架构（均在 `desktop/`，CommonJS）

| 文件 | 职责 |
| --- | --- |
| `sshConfig.cjs` | 纯函数解析 `~/.ssh/config`：别名列表、别名 → `{hostName, port, user, identityFile}` 解析，含 `Include`（相对被含文件目录，循环忽略）。无 I/O 的解析函数可测。 |
| `tunnel.cjs` | 隧道生命周期：`buildSshArgs`（镜像 `sshTunnelManager` 的选项契约）、空闲端口分配、就绪探测、spawn `ssh -N -L`、askpass、close。 |
| `main.cjs` | 编排：IPC、历史存储/迁移、safeStorage、活动隧道唯一持有者、托盘菜单。 |
| `preload.cjs` | contextBridge 暴露 `window.piStudioDesktop` API。 |
| `connect.html` | 启动页 UI 与交互。 |

隧道实现要点：

- 命令：`ssh -N -L 127.0.0.1:<随机端口>:<网关host>:<网关port> [-p] [-l] [-i] <host>`，选项 `-o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new`（首次连接免交互确认，密钥变更仍拒绝）。
- 就绪判定：TCP 连通本地监听端口即认证成功（`ssh` 认证通过才开监听），与服务端一致；探测在超时前持续重试（首次连接常被拒），并与子进程退出竞速，失败时汇总 stderr 尾部作为错误原因。
- **密码 askpass**：服务端用 `.sh` 脚本，Windows 的 `ssh.exe` 无法执行该脚本，故桌面端改为**自调用**：askpass 程序指向 `process.execPath`（PI Studio 自身），子进程 env 加 `PI_STUDIO_ASKPASS=1`；`main.cjs` 入口最先检查该环境变量，打印密码到 stdout 后立即 `exit(0)`，不启动任何窗口。跨 Windows/POSIX 一致，无需外部脚本。
- 生命周期：主进程持有唯一活动隧道；新连接建立成功后关闭旧隧道，应用退出时全部关闭。
- 环境探测：`ssh -V` 判断客户端存在；解析 `~/.ssh/config` 提供别名下拉（Windows 取 `%USERPROFILE%\.ssh\config`，其余取 `~/.ssh/config`）。

## 错误处理

- 环境缺失（无 ssh 客户端）：SSH 面板状态条红色提示，连接按钮禁用，不静默降级。
- 隧道失败：状态行显示原因（认证失败 / 连接超时 / ssh 退出码 + stderr 摘要），表单保留、可重试；不写入最近使用。
- 远程网关不可达：隧道建立但页面加载失败由页面自身呈现（同直连现状）。
- 历史/配置读写失败：沿用现状吞掉写错误仅影响持久化，不影响连接；解析失败按空历史处理并保留原文件。

## 测试与验证

- 纯逻辑用 Node 内置 test runner（`node --test desktop/`，desktop 不引入测试依赖）：`sshConfig.cjs` 的解析/Include/别名解析、`tunnel.cjs` 的命令行构建与密码互斥参数。
- 人工验证（Windows）：直连回归、ssh config 选别名连接、手动填密码连接、记住密码重启后重连、最近使用/托盘点击、错误提示。
- 本环境（WSL）无法运行 Electron 图形界面，交付时如实标注未跑的验证项。
