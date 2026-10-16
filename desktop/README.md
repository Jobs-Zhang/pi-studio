# PI STUDIO Windows 客户端

连接 PI STUDIO Gateway 的桌面壳，提供直连、SSH 隧道、最近连接、托盘及系统通知。业务 UI 由 Gateway 提供，不随客户端内置完整服务端。

## 环境与交付状态

- Windows 10/11，以及可达的 PI STUDIO Gateway；服务端启动见[项目 README](../README.md#run-from-source)。
- SSH 连接需要本机 OpenSSH 客户端，可在 Windows「可选功能」中安装。
- 正式下载渠道尚未配置，目前从源码构建 `PI Studio Setup.exe`。安装器是支持的 Windows 交付形式，便携程序不能替代安装器的快捷方式和通知注册。

## 构建与开发

在仓库根目录执行：

```bash
cd desktop
npm ci
npm run build
```

构建输出为 `dist/PI Studio Setup.exe`。`electron-builder.yml` 是唯一打包配置来源；发布前需在 Windows 实际安装并检查连接、图标、通知和许可证。

开发命令：

```bash
npm start
npm run start:local
npm run start:dev
```

依次打开连接页、连接本机 Web/API（端口 `8504`）、连接本机 Vite UI（端口 `8505`）。开发模式未注册通知所需的快捷方式；Windows 未打包模式暂不支持密码认证，使用密钥认证。

## 连接与配置

- **直连**：输入客户端可达的 Gateway 地址，例如 `https://gateway.example.com`。
- **SSH 配置**：选择本机 `~/.ssh/config` 主机别名，认证交给系统 SSH 和 agent，不提供密码输入。
- **SSH 手动连接**：填写主机、端口和用户，使用密码或密钥文件认证；远程网关填写从 SSH 主机可访问的地址，默认指向该主机的回环端口 `8504`。

最近连接保存在 `~/.pi-studio-desktop/config.json`。勾选记住密码后使用系统加密保存；Windows 使用 DPAPI，不勾选则不保存。

可用 `--url=<Gateway 地址>` 或环境变量 `PI_STUDIO_DESKTOP_URL` 指定启动地址。

## 通知

在工作台操作面板（`Ctrl+K`）启用桌面通知。通知覆盖提问、扩展对话框、回合完成或失败、机器不可用等事件；窗口失焦或最小化时也可接收。

Windows 通知应使用安装版验证。普通浏览器的通知还受安全上下文限制；一般 HTTP 局域网地址不能请求系统通知权限。

## 常见问题

- **图标仍为 Electron 默认图标**：先核对安装目录内程序的图标，再取消旧任务栏固定并重新固定；必要时通过安装器重装，不默认删除系统图标缓存。
- **Linux/WSL 构建在 NSIS 阶段失败**：检查 electron-builder 日志及 Wine 环境。优先使用隔离的 `WINEPREFIX` 或 Windows 构建环境，不直接删除 `~/.wine`，其中可能包含其他应用与数据。

## 许可证

采用 [MIT 许可证](../LICENSE)。连接页提供“来源与开源许可”，安装包资源目录同时携带 `LICENSE`。
