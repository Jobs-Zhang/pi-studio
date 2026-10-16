# SSH 机器连接设计

日期：2026-10-10
分支：feat/desktop-notifications（新工作建议切 `feat/ssh-machines`）

## 背景与目标

PI WEB 的机器（machines）体系目前只支持直连：远端机器上运行 PI WEB，本机通过 `baseUrl`（+ `token`/`headers`）经 HTTP/WebSocket 访问。当远端 PI WEB 不在可达网络上（如家里/机房的内网开发机）时，无法添加为机器。

本设计为机器增加第二种连接方式 **SSH 隧道**：远端仍运行 PI WEB（连接模型不变），本机通过系统 `ssh` 建立本地端口转发访问它。

目标：

1. 机器支持 `direct`（现状）与 `ssh` 两种连接方式，二者共存、同一套代理链路。
2. SSH 认证三种来源均支持：
   - `~/.ssh/config` 已配置的 Host 别名（端口/密钥/ProxyJump 复用系统配置）；
   - 手动填写 `host` + `port` + `user` + 私钥文件；
   - 手动填写 `host` + `port` + `user` + 密码。
3. 隧道由 web/API 服务进程管理，浏览器与 Desktop 均可使用，Desktop 保持薄壳不变。

非目标（YAGNI）：

- 远端不安装 PI WEB、通过 SSH 直接执行 pi 会话（全新执行通道，另立项目）。
- SSH agent 转发、动态跳板编排等高级场景（`~/.ssh/config` 已覆盖绝大多数）。
- 双向/远程端口转发（`-R`）、SOCKS 代理。

按项目约定不做旧数据兼容：`machines.json` 直接采用新 schema，无需迁移逻辑。

## 数据模型

`src/server/machines/machineStore.ts` 的 `StoredMachine` 重构为：

```ts
export interface StoredMachine {
  id: string;
  name: string;
  kind: "remote";
  baseUrl: string;              // 远端 PI WEB 地址；ssh 模式下相对 SSH 主机解析
  connection: MachineConnection;
  token?: string;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type MachineConnection =
  | { mode: "direct" }
  | {
      mode: "ssh";
      host: string;             // ~/.ssh/config Host 别名 或 主机名/IP
      port?: number;            // 缺省用 ssh config / 22
      user?: string;
      identityFile?: string;    // 私钥路径，支持 ~ 展开
      password?: string;        // 仅密码认证；与 identityFile 互斥
    };
```

校验规则（`machineService.ts`）：

- `mode: "direct"`：仅校验现有字段。
- `mode: "ssh"`：`host` 必填非空；`identityFile` 与 `password` 同时给出时报错；`baseUrl` 必填（默认建议 `http://127.0.0.1:8505`，UI 预填）。
- API 返回的 `Machine`（`shared/apiTypes.ts`）增加脱敏的 `connection` 字段：密码不回传（序列化时省略 `password`，以布尔 `hasPassword` 代替）。

`MachineHealth` 增加隧道状态：

```ts
tunnel?: {
  state: "connecting" | "up" | "failed";
  error?: string;   // 失败原因（ssh stderr 摘要）
};
```

## SSH 隧道管理器

新模块 `src/server/machines/sshTunnelManager.ts`。

### 职责

维护 `machineId → TunnelRecord` 映射：

```ts
interface TunnelRecord {
  localPort: number;
  child: ChildProcess;
  state: "connecting" | "up" | "failed";
  lastError?: string;
  lastSpawnAt: number;
  stderrTail: string[];   // 最近 50 行，用于错误诊断
}
```

### 建立流程（惰性）

首次请求某 SSH 机器时：

1. 用 `net.createServer().listen(0)` 申请空闲本地端口后立即释放，得到 `localPort`（已实测 `-L` 不支持端口 0 动态分配，必须自选；端口被抢的小概率竞态由 `ExitOnForwardFailure` 兜底报错）。
2. 解析 `baseUrl` 的 `host:port` 作为转发目标。
3. spawn 系统 `ssh`：

```
ssh -N
    -L 127.0.0.1:<localPort>:<targetHost>:<targetPort>
    [-p <port>] [-l <user>] [-i <identityFile>]
    -o ExitOnForwardFailure=yes
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3
    -o StrictHostKeyChecking=accept-new
    <host>
```

（ssh 仅在认证成功后才开启本地 `-L` 监听，因此对 `127.0.0.1:<localPort>` 做一次 TCP connect 探测即可确认「认证通过 + 隧道就绪」；认证失败时进程退出、connect 得到 ECONNREFUSED。）

4. 状态机：spawn 后 `connecting`；对 `127.0.0.1:<localPort>` 的 TCP connect 探测成功（带超时，如 10 秒）后置 `up`；探测超时或子进程退出（exit code 非 0 或被信号杀死）置 `failed` 并记录 `lastError`，删除映射。
5. 重连退避：同一机器两次 spawn 间隔至少 5 秒（常量，不做成配置），避免认证失败时的 spawn 风暴。

### 密码认证（SSH_ASKPASS）

系统 `ssh` 无法从 stdin 非交互收密码，采用 `SSH_ASKPASS` 机制：

- 在临时目录写一个 0600 的 askpass 脚本（`echo '<password>'`，经 `sh -c` 执行），spawn 时设置环境变量 `SSH_ASKPASS=<脚本>`、`SSH_ASKPASS_REQUIRE=force`（OpenSSH ≥ 8.4，强制无 tty 也走 askpass）、`DISPLAY=:0`（旧版本需要）。
- 子进程退出后删除脚本。
- 密码明文存 `machines.json`（文件本身 0600，与 token 同等待遇）；UI 上明确提示优先使用密钥。要求 `StrictHostKeyChecking=accept-new` 已消除交互式 host key 确认。

依赖注入：`SshTunnelManager` 构造函数接受 `{ spawnImpl, now, connectProbe }`，默认用 `node:child_process.spawn`，便于测试用 fake 替换。

### 与现有链路的集成

`MachineService.remoteClient(id)`（`machineService.ts`）：SSH 机器先 `await tunnels.ensure(machine)`，然后返回 `new RemoteMachineClient({ ...machine, baseUrl: http://127.0.0.1:<localPort> }, ...)`——仅替换 baseUrl 的 host:port，`token`/`headers` 不变。`machineProxyRoutes` 的 HTTP 与 WebSocket 代理零改动（隧道是 TCP 层转发，对上层完全透明）。

`MachineService.health(id)`：SSH 机器在返回的 `MachineHealth` 里附加 `tunnel` 字段；隧道 `failed` 时 `status: "error"`、`error` 为失败原因，不再发 HTTP 请求。

进程退出清理：`SshTunnelManager.close()` 在 web/API 进程关闭时杀掉所有 ssh 子进程；`app.ts` 接入 fastify `onClose` 钩子。

## API 变更

`machineRoutes.ts`：

- `POST /api/machines`、`PATCH /api/machines/:id` 的 body 接受 `connection` 字段（校验规则见上）。
- 新增 `GET /api/machines/ssh-config/hosts`：只读解析 `~/.ssh/config`（含 `Include` 指令引用的文件，尽力而为），返回非通配符 `Host` 别名列表，供 UI 下拉。解析器为独立小模块 `sshConfigParser.ts`（逐行 `Host`/`Include` 处理），不引第三方依赖。

## UI 变更

`MachineDialog.ts`：

- 新增「连接方式」单选：直连 / SSH（默认直连）。
- SSH 模式追加字段：主机（`datalist` 挂载 `ssh-config/hosts` 结果）、端口（占位 22）、用户名、私钥路径、密码（私钥与密码二选一，同时填写给出校验提示）。`baseUrl` 语义提示改为「远端 PI WEB 地址（在 SSH 主机上可达）」，默认预填 `http://127.0.0.1:8505`。
- 提交时组装 `connection` 字段。

`MachineList.ts` / `MachineSwitcher.ts`：

- 机器行显示连接方式徽标（直连/SSH）。
- health 轮询展示 `tunnel.state`：连接中（转圈）/ 已连接 / 失败（红点 + `error` 摘要 tooltip）。

## 错误处理

- ssh stderr 持续捕获，保留最近 50 行；隧道失败时取最后几行作为 `lastError`（如 `Permission denied (publickey)`、`Connection refused`）。
- `ensure()` 在退避窗口内直接抛上次失败原因，不再立刻重试。
- spawn 失败（找不到 `ssh` 可执行文件）在 health 中报「未找到 ssh 命令」并提示安装 OpenSSH 客户端。
- 所有失败路径记录 error 级日志（含 machineId、ssh 目标、exit code、stderr 摘要），不打印密码与 token。

## 安全

- `machines.json` 保持 0600；密码与 token 同级存储，文档中明示风险与密钥优先建议。
- askpass 脚本 0600、临时目录、用后即删。
- `StrictHostKeyChecking=accept-new`（TOFU）：首次连接自动接受并记录 host key，host key 变化时 ssh 拒绝连接并报错——错误信息透传到 UI。
- 隧道仅绑定 `127.0.0.1`，不暴露到局域网。

## 测试

- `sshTunnelManager.test.ts`：fake spawnImpl 验证参数构造（各认证组合）、空闲端口申请、状态机（connecting→up→failed）、退避、子进程退出清理、askpass 脚本生成与删除。
- `sshConfigParser.test.ts`：Host 别名提取、通配符过滤、Include 展开。
- `machineService.test.ts`：connection 校验规则、密码脱敏、health 附加 tunnel 字段。
- `machineRoutes.test.ts`：新接口与 body 校验。
- `MachineDialog.test.ts`：连接方式切换、互斥校验、提交组装。
- 真实 ssh 的端到端验证放在本地手动脚本（`scripts/`），不进 CI。

## 文档

`docs/machines.md`（及对应 `machines.html`）补充 SSH 连接方式说明：三种认证来源、密码存储风险提示、前置要求（系统 OpenSSH ≥ 8.4 用于密码认证）。

## 实施顺序建议

1. schema + 校验 + 隧道管理器（含单测）
2. API（connection 字段、ssh-config/hosts）
3. UI（MachineDialog / MachineList）
4. 文档 + 手动端到端验证
