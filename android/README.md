# PI Web for Android

[PI WEB](https://pi-web.dev) 的 Android 客户端 —— 手机上打开你的 AI 编码工作台。

## 功能

- 🔗 **直连** — 输入可达的 PI WEB 网关地址即可连接
- 🖥 **SSH 隧道** — 手机不在内网时，用 SSH 账号密码把网关映射到本机回环端口
- 📌 **最近使用** — 直连与 SSH 连接都会记录，点击即重连
- 🔒 **记住密码** — 密码用 Android Keystore 加密后保存在本机，明文不落盘

## 连接方式

- **直连**：网关地址（如 `http://192.168.1.100:8504`）在手机上可达时直接使用。
- **SSH**：填写 SSH 地址（`user@host` 或 IP）、端口、登录用户、密码，再填「远程网关」（PI WEB 在 SSH 主机上可被访问的地址，默认 `http://127.0.0.1:8504`）。隧道建立在手机本机，连接页随后打开 `http://127.0.0.1:<随机端口>`。

Android 上不读取 `~/.ssh/config`，也不支持密钥文件与 ssh agent：**只支持账号密码认证**。

## 环境要求

- Android 8.0（API 26）或更高
- 可达的 PI WEB 网关

## 下载

构建产物为调试版 APK（`app-debug.apk`），安装时需要在系统设置中允许「安装未知来源应用」。

## 从源码构建

前置：JDK 17+、Android SDK（`platform-tools`、`platforms;android-35`、`build-tools;35.0.0`）。

```bash
cd android
export ANDROID_HOME=~/Android/sdk
./gradlew assembleDebug
```

输出：`app/build/outputs/apk/debug/app-debug.apk`，用 `adb install -r` 或直接传到手机上安装。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `app/src/main/java/dev/pi/web/MainActivity.kt` | WebView 壳：加载连接页、返回键、系统栏 insets |
| `.../ConnectionService.kt` | 历史、能力协商、隧道生命周期（对应 `desktop/main.cjs` 的 IPC 处理器） |
| `.../ConnectBridge.kt` | 把 `window.piWebDesktop` 契约暴露给连接页 |
| `.../SshTunnel.kt` | JSch 隧道：认证 + `direct-tcpip` 本地转发 |
| `.../ConnectionStore.kt`、`.../PasswordCipher.kt` | 最近使用的持久化；密码的 Keystore 加密 |
| `.../ConnectionModels.kt`、`.../ConnectPayloads.kt` | 与 `desktop/history.cjs`、`desktop/main.cjs` 对齐的数据结构与纯函数 |

连接页与桌面端**共用同一份源码**：构建时把 `desktop/connect.html` 暂存进 assets，平台差异通过 `capabilities` 协商（Android 端声明 `sshConfig=false`、`identityFile=false`、无键盘快捷键）。

## 与桌面端的差异

- 隧道由 JSch 库实现，不依赖设备上的 OpenSSH 客户端。
- 只支持密码认证（无 `~/.ssh/config`、无密钥文件）。
- 隧道跟随应用前台生命周期：返回连接页或退出应用即关闭。

## License

MIT
