# 开发与交付检查

轻量与性能同时体现在使用体感、产品设计和实现上。功能围绕核心编程流程，不堆砌入口、选项和技术层次；以实际体验和资源开销判断收益。

## 开发验证

不编写或引入自动化测试、测试夹具和测试框架。行为通过真实环境功能实测验证，静态检查和人工审查作为辅助；具体约定见 [AGENTS.md](../AGENTS.md)。

每次修改至少完成：

1. 在受影响的实际客户端或服务中走通正常流程和关键失败路径。
2. 人工审查边界、安全性、数据完整性和维护成本。
3. 执行以下检查：

```bash
npm run verify
git diff --check
```

涉及性能时，用相同环境与操作对比修改前后结果，关注交互响应、启动时间、内存及网络开销。不凭主观判断宣称性能提升。

## 按交付边界检查

| 交付范围 | 构建 | 功能实测重点 |
| --- | --- | --- |
| Web/API 与 sessiond | 根目录 `npm run build` | 打开工作区、发送与恢复会话、文件与终端、断线重连；Web/API 重启不影响会话 |
| Windows Desktop | `cd desktop && npm ci && npm run build` | 实际安装、直连与 SSH、最近连接、托盘、通知、图标与许可证 |
| Android | `cd android && ./gradlew assembleDebug` | 设备或模拟器上的直连与 SSH、返回导航、连接恢复、隧道关闭与许可证 |

只验证受影响的边界，不为纯文档修改重建全部客户端。重启 sessiond 会中断活动会话及终端，应先安排好中断时机；同时重启时先 Web/API，后 sessiond。

npm 发布与官网部署默认关闭，确认账号权限和实际交付产物前不启用。客户端目前以本地 Windows 安装器和 Android Debug APK 为交付物，详见各客户端 README。

### 现有交付脚本

仓库保留 `check:artifacts` 与 `smoke:package-install`，现有 CI 在构建后运行；本次文档整理不修改这些脚本或新增检查套件。需要核查 npm 交付边界时可运行：

```bash
npm run build
npm run check:artifacts
# Linux 隔离交付环境中，按需检查实际全局安装
npm run smoke:package-install
```

`check:artifacts` 只读取当前 `dist`，不会重新构建；`smoke:package-install` 会执行实际包安装。它们均不能替代受影响功能的真实使用验证。

## 服务端 TypeBox 边界

`pi-studio-typebox` 是固定版本的 `typebox` npm 别名，不是独立 fork。

Pi 扩展运行在宿主的模块映射中，服务端 CLI 和 sessiond 则独立运行。服务端工具使用 `pi-studio-typebox`，`extensions/` 使用 Pi 提供的 TypeBox，不依赖 Pi 私有文件或 npm 提升布局，也不将服务端别名引入扩展。

该分离避免扩展依赖诊断与独立运行时解析冲突，背景见[上游问题 #277](https://github.com/jmfederico/pi-web/issues/277)。除非宿主提供更合适的公开机制，不为统一名称而移除此边界。

## 验证结果说明

交付时简要列出已实测流程、检查结果及未验证项。构建或静态检查通过不代表功能通过；未执行、失败或受阻的步骤必须如实说明。
