# PI STUDIO Android 客户端

通过 WebView 访问 PI STUDIO Gateway，支持直连、密码认证的 SSH 隧道和最近连接。业务 UI 由 Gateway 提供，服务端启动见[项目 README](../README.md#run-from-source)。

## 环境与交付状态

- Android 8.0（API 26）或更高，以及客户端可达的 Gateway。
- 目前只提供本地构建的 Debug APK；正式签名与发布渠道尚未配置，不将 Debug APK 当作正式发行版。
- 本地安装可能需要允许对应应用安装未知来源软件。

## 构建

需要 JDK 17+、Android SDK 的 `platform-tools`、`platforms;android-35` 和 `build-tools;35.0.0`。

在仓库根目录执行：

```bash
cd android
export ANDROID_HOME="/path/to/android-sdk"
./gradlew assembleDebug
"$ANDROID_HOME/platform-tools/adb" install -r app/build/outputs/apk/debug/app-debug.apk
```

输出：`app/build/outputs/apk/debug/app-debug.apk`。构建通过后仍需在模拟器或设备上实测连接、返回导航和隧道关闭，不编写自动化测试。

## 连接与安全

- **直连**：输入手机可访问的 Gateway 地址，例如 `https://gateway.example.com`。
- **SSH**：填写 SSH 主机、端口、用户、密码和从该 SSH 主机可访问的远程网关地址。隧道在手机上转发到随机本地回环端口，再由 WebView 访问。
- 不读取 `~/.ssh/config`，不支持密钥文件或 SSH agent。
- 勾选记住密码后，通过 Android Keystore 加密保存，明文不落盘。
- 返回连接页或退出应用会关闭隧道；不要依赖客户端作为常驻 SSH 转发服务。

## 代码边界

源码目录为 `app/src/main/java/dev/pi/studio/`：

| 文件 | 职责 |
| --- | --- |
| `MainActivity.kt` | WebView、连接页、返回导航与系统栏 |
| `ConnectionService.kt`、`ConnectBridge.kt` | 连接生命周期、能力协商与页面桥接 |
| `SshTunnel.kt` | JSch 认证与本地转发 |
| `ConnectionStore.kt`、`PasswordCipher.kt` | 最近连接持久化与密码加密 |
| `ConnectionModels.kt`、`ConnectPayloads.kt` | 与 Desktop 对齐的连接数据结构 |

构建时将 `desktop/connect.html` 和根目录 `LICENSE` 放入 assets。连接页通过 `capabilities` 适配平台，不另建 Android 专用副本。

## 许可证

采用 [MIT 许可证](../LICENSE)。连接页可离线查看“来源与开源许可”，APK 同时包含 `assets/LICENSE`。
