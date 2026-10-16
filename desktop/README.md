# PI Studio

[PI STUDIO](https://pi-studio.dev) 的桌面客户端 —— 你的 AI 编码工作台。

PI Studio 连接到远程 PI STUDIO 网关，并在 Windows 上提供浏览器标签页做不到的能力：
托盘入口、系统通知，以及在最小化或失焦时仍能接收实时事件的窗口。

## 功能

- 🔗 **快速连接** — 输入直连地址，或通过 **SSH 隧道**连接内网网关
- 🖥 **SSH 连接** — 自动识别本机 `~/.ssh/config` 主机配置，也支持手动填写主机/端口/用户/密钥/密码
- 🔔 **系统通知** — 代理需要你关注时收到系统通知
- 📌 **最近使用** — 直连与 SSH 连接都会记录，点击即重连

## 环境要求

- 可达的 PI STUDIO 网关（安装方式见 [pi-studio.dev](https://pi-studio.dev)）
- Windows 10/11
- SSH 连接需要本机 OpenSSH 客户端（Windows 10/11 自带，可在「可选功能」中安装）

## 下载

从发布页获取最新的 `PI Studio Setup.exe`（安装器）。

## 使用

1. 运行 `PI Studio Setup.exe` 完成安装，从开始菜单启动 **PI Studio**
2. 选择连接方式：
   - **直连**：输入网关地址（如 `http://192.168.1.100:8504`），点击 **连接**
   - **SSH · `~/.ssh/config`**：从下拉中选择本机 `~/.ssh/config` 里的主机别名即可，认证由系统 ssh（密钥/agent）完成，**无需也不提供密码输入**；只需再填「远程网关」（PI STUDIO 在 SSH 主机上可被访问的地址，默认 `http://127.0.0.1:8504`）
   - **SSH · 账户密码**：手动填写地址（`user@host` 或 IP）、端口、用户，认证用密码或密钥文件（二选一）；勾选「记住密码」后密码会使用系统加密（Windows DPAPI）保存在本机，不勾选则不保存
3. 连接成功的条目会出现在 **Recent** 列表中，点击即可重连（config 条目直接重连，不会询问密码）

### 命令行

```bash
# 直接连接（安装目录下的 PI Studio.exe）
"%LOCALAPPDATA%\Programs\PI Studio\PI Studio.exe" --url=http://your-server:8504

# 通过环境变量设置默认地址
set PI_STUDIO_DESKTOP_URL=http://your-server:8504
"%LOCALAPPDATA%\Programs\PI Studio\PI Studio.exe"
```

### 通知

在 PI STUDIO 的操作面板中启用桌面通知：

1. 打开操作面板（Ctrl+K）
2. 搜索 "Enable Desktop Notifications"
3. 允许权限提示

通知会在以下情况触发：

- 代理提问（`ask_user`）
- 扩展对话框
- 回合完成
- 回合失败
- 机器不可用
- 窗口处于非激活状态（最小化到托盘或失焦）时，当前会话的通知也会弹出

系统通知依赖安装版：Windows 要求应用的开始菜单快捷方式已注册才能显示通知，安装器会自动完成注册。若在浏览器中打开 PI STUDIO，通知还受浏览器限制，非 https / localhost 网关不允许系统通知。

## 从源码构建

```bash
cd desktop
npm install
npm run build
```

输出：`dist/PI Studio Setup.exe`

只想检查打包结果里的 `PI Studio.exe`、不生成安装包时，可以只做目录构建：`npx electron-builder --win --dir --config electron-builder.yml`。

## 开发

```bash
cd desktop
npm start           # 打开启动页
npm start:local     # 直接连接 http://127.0.0.1:8504
```

限制：Windows 开发模式（未打包）下暂不支持密码认证，请使用密钥认证；开发模式也未注册系统通知所需的快捷方式，系统通知请用安装版验证。

## 常见问题

- **任务栏、桌面快捷方式仍显示 Electron 默认图标**：安装器升级时不会重建已有快捷方式，加上 Windows 按路径缓存图标，旧图标会留下来。步骤：从任务栏取消固定 → 执行 `ie4uinit.exe -show`（不够就结束 explorer 后删除 `%LocalAppData%\Microsoft\Windows\Explorer\iconcache_*.db`，再启动 explorer）→ 卸载后重新安装，让快捷方式重建 → 重新固定。可在资源管理器里先确认 `%LocalAppData%\Programs\PI Studio\PI Studio.exe` 的图标已是 π。
- **Linux/WSL 上 `npm run build` 在 NSIS 阶段失败（`wine process failed`，`wow64.dll` 加载失败）**：electron-builder 会用 wine 跑安装器 stub 提取卸载程序，32 位 wine prefix 损坏时就会卡在这里。判断：`ls ~/.wine/drive_c/windows/syswow64 | wc -l` 为 0（正常约 835）；重建：`rm -rf ~/.wine && wine cmd /c echo ok`（约 1 分钟）。Windows 上构建走原生执行，不受影响。

## License

MIT
