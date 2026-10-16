# PI STUDIO 配置参考

按实际需求修改配置，不为预留功能增加不必要的选项。以下保留配置键、优先级与运行时边界的详细说明；表格版见仓库中的 [config.html](config.html)，不依赖外部官网。

## 配置速览

| 类型 | 位置 | 用途 |
| --- | --- | --- |
| 全局配置 | `$PI_STUDIO_CONFIG`；未设置时为 `$XDG_CONFIG_HOME/pi-studio/config.json` 或 `~/.config/pi-studio/config.json` | 单台机器的服务与工作台设置 |
| 项目配置 | `<project>/.pi-studio/config.json` | 支持的项目级文件访问、上传与附件设置 |
| 托管状态 | `$PI_STUDIO_DATA_DIR`，默认 `~/.pi-studio` | 项目、机器注册表及归档，不是用户配置接口 |
| Pi 状态 | `$PI_CODING_AGENT_DIR`，默认 `~/.pi/agent` | Pi 凭据、模型、设置、会话与扩展包 |

全局运行时优先级为内置默认值 → 全局文件 → 环境变量。项目配置仅覆盖明确支持的键：上传与附件目录覆盖全局值，`pathAccess.allowedPaths` 合并去重，不覆盖服务端口等机器级设置。

修改前核对目标机器与生效方式，尤其不要通过切换数据目录来修改用户设置。重启 sessiond 会中断活动会话和终端；需要同时重启时先 Web/API，后 sessiond。具体键的规则见 [Precedence and reloads](#precedence-and-reloads)。

## Config files

PI STUDIO uses two config files:

- **Global PI STUDIO config:** `$PI_STUDIO_CONFIG`, or `$XDG_CONFIG_HOME/pi-studio/config.json`, or `~/.config/pi-studio/config.json`.
- **Project-local PI STUDIO config:** `<project>/.pi-studio/config.json` for commit-able project settings.

Each PI STUDIO machine has its own config. When using Fleet/machine federation, Settings uses the selected machine for config that affects work running there: session daemon tools, desired PI STUDIO plugin enablement/settings, external path access, and upload defaults. Gateway/browser-only settings stay local to the gateway: the default theme, keyboard shortcuts, remote machine registry/tokens, and gateway host/port/allowed-hosts.

Pi package settings are separate from PI STUDIO config. They live in Pi's package-manager settings on the target machine and are managed by Pi (`pi install`, `pi remove`, `pi update`) or **Settings → Pi packages**. In a federated setup, **Settings → Pi packages** targets the currently selected machine. The PI STUDIO `plugins` config key controls desired enablement/settings for discovered browser-only, server-only, and dual-entry PI STUDIO plugins on that machine; it does not install, remove, or update Pi packages.

### Custom config paths in installed services

`start`, `restart`, and `doctor` use the config path saved in the installed services for readiness checks unless the caller supplies a nonempty `PI_STUDIO_CONFIG` override. `doctor` checks the managed setup, not every custom runtime environment.

| Situation | Behavior / action |
| --- | --- |
| Use the installed config | Run `pi-studio start`, `pi-studio restart`, or `pi-studio doctor` normally. |
| Override the path for one command | Supply a nonempty `PI_STUDIO_CONFIG` when invoking that command. This does not rewrite service definitions. |
| Change the managed service config path | Run `pi-studio install --config /path/to/config.json` to regenerate both web/API and sessiond service definitions. |
| Upgrade from an installation that set the path only for the web service | Rerun that same install command so both services use the same config. |
| systemd cannot verify the loaded service environment | The command fails rather than guesses if manager state is stale, the loaded fragment differs, or a PI STUDIO-managed environment value cannot be verified. Managed `Environment=` values (currently `PI_STUDIO_CONFIG`) must match the installed definition; unrelated variables are ignored. Drop-ins that leave managed values unchanged are allowed. |
| systemd uses `EnvironmentFile=` | Accepted with a nonfatal warning. File contents are not included in systemctl's `Environment` property and PI STUDIO does not inspect them, so config overrides in those files cannot be verified. |
| launchd has an old config path or a label loaded from another plist | `start` and `doctor` fail. `restart` reloads installed plists and can repair stale loaded state. |

## Startup model and thinking defaults

Open the model or thinking-level selector and click a row’s star under **New session default** to save it for new sessions. A filled star marks the saved default. Clicking the option itself changes only the current session; setting the default leaves the current session unchanged.

Defaults are saved in Pi’s global `settings.json` on the selected session’s machine (`~/.pi/agent/settings.json` by default), using `defaultProvider`, `defaultModel`, and `defaultThinkingLevel`. They apply to new sessions without restarting. Project `.pi/settings.json` overrides, explicit startup choices, and per-model thinking settings still take precedence. A default model must be enabled; otherwise startup falls back to the first enabled model. Resumed sessions keep their saved model and thinking level.

## Reverse-proxy deployment paths

The deployment path is not a PI STUDIO config-file key or environment setting. The published client is portable: one build works at `/` and at canonical trailing-slash prefixes such as `/ai/` or `/test/ai/`.

For a nested deployment, redirect the slashless prefix to the trailing-slash URL, strip the prefix before forwarding to PI STUDIO, and proxy authenticated HTTP and WebSocket traffic through the same location. Relative browser and PWA URLs then stay within that prefix. See the [反向代理部署说明](install.html#reverse-proxy-prefix) for a complete Nginx example.

## Precedence and reloads

Machine-global runtime values are resolved as:

```text
defaults → global config file → environment overrides
```

Supported project-local settings are then applied for that project's workspaces. For upload and prompt-attachment defaults, `<project>/.pi-studio/config.json` overrides the global value.

Environment overrides include `PI_STUDIO_HOST`, `PI_STUDIO_PORT` / `PORT`, `PI_STUDIO_ALLOWED_HOSTS`, `PI_STUDIO_MAX_UPLOAD_BYTES`, `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, `PI_STUDIO_SPAWN_SESSIONS`, `PI_STUDIO_SUBSESSIONS`, `PI_STUDIO_ASK_USER`, and `PI_STUDIO_ENVIRONMENT_FACTS`.

Process restarts depend on the key:

- `host` / `port`: restart the gateway web/API service or process.
- `maxUploadBytes`: restart both the web/API process and the session daemon on that machine.
- `spawnSessions` / `subsessions` / `askUser` / `extensionDialogsTimeoutMs` / `environmentFacts`: restart the session daemon on that machine.
- `pathAccess`: applies on the next request; existing file views may need a browser refresh.
- `uploads.defaultFolder`: applies to newly opened Files upload dialogs and new direct drag/drop batches after config/workspace refresh.
- `attachments.defaultFolder`: applies to new prompt-attachment saves after config/workspace refresh.
- `plugins`: browser-only changes apply after a browser-tab reload. Any enablement, settings, package-source, or package-revision change affecting a `serverModule` requires a manual session-daemon restart, then a browser reload for its paired UI.
- `serverPlugins.safeStart`: persistent offline recovery state applied before server-plugin discovery/import on the next sessiond start; use the `pi-studio plugins safe-start ...` CLI rather than hand-editing it.
- Pi package install/remove/update: not a PI STUDIO config key; after a mutation, type `/reload` in each idle PI STUDIO session on the target machine to refresh ordinary Pi resources such as extensions, skills, prompt templates, themes, and context/system prompt files. For a PI STUDIO package with `serverModule`, manually restart `pi-studio-sessiond.service`, then reload the browser. If a global Pi extension adds or removes a model provider, or changes a provider's connection settings, the same manual sessiond restart is required; `/reload` cannot change either startup snapshot. A known Pi model provider refreshing only its own model list is applied without a restart. See [Pi extension provider baseline](#pi-extension-provider-baseline).
- `shortcuts`: saved settings apply in the browser after config refresh/save.
- `defaultTheme`: applies after settings save or browser config refresh when the browser has no local theme override; no service restart.

## Global config example

```json
{
  "host": "127.0.0.1",
  "port": 8504,
  "defaultTheme": { "themeId": "themes:pi-studio-dark", "auto": true },
  "pathAccess": {
    "allowedPaths": ["~/SDKs", "/opt/reference"]
  },
  "uploads": {
    "defaultFolder": ".pi-studio/uploads"
  },
  "attachments": {
    "defaultFolder": ".pi-studio/attachments"
  },
  "maxUploadBytes": 67108864,
  "spawnSessions": true,
  "subsessions": true,
  "askUser": true,
  "extensionDialogsTimeoutMs": 300000,
  "plugins": {
    "workspace-tasks": { "enabled": true },
    "updates": { "enabled": true },
    "info": { "enabled": false }
  },
  "shortcuts": {
    "core:view.chat": "mod+1",
    "core:session.stop": null
  }
}
```

## Project-local config

Project-local config lives at `<project>/.pi-studio/config.json`. Use it for settings that should follow a repository.

```json
{
  "version": 1,
  "pathAccess": {
    "allowedPaths": ["~/SDKs", "/opt/reference"]
  },
  "uploads": {
    "defaultFolder": "manual/uploads"
  },
  "attachments": {
    "defaultFolder": "prompt-attachments"
  }
}
```

Project-local `pathAccess.allowedPaths` entries are merged after the global list and deduplicated. Paths must still be host-absolute or `~`-prefixed; relative roots are not supported.

Project-local `uploads.defaultFolder` overrides the global upload destination for workspaces in that project, and project-local `attachments.defaultFolder` overrides the global prompt-attachment destination the same way. These defaults also apply when accessing the project through Fleet.

Plugins may own separate project files, such as `.pi-studio/tasks.json` for the built-in Workspace Tasks plugin.

PI STUDIO also honors one optional project hook; see [Worktree pre-remove hook](#worktree-pre-remove-hook).

## Worktree pre-remove hook

Before PI STUDIO removes a workspace — for Git projects, a secondary worktree — it gives the repository one chance to tear down project-owned infrastructure tied to that workspace. To use the hook, provide an executable script at:

```text
.pi-studio/hooks/worktree-pre-remove
```

relative to the workspace where the deletion command runs. PI STUDIO runs the deletion command from the project's main workspace when it exists, so commit the hook there and it follows the repository.

When the hook is present and executable, PI STUDIO dispatches the hook and the removal as one composed terminal command:

```sh
'<hook path>' '<workspace path>' && <workspace removal command>
```

For Git projects the removal command is `git worktree remove '<worktree path>'`.

Contract:

- **Arguments:** exactly one — the absolute path of the workspace being removed.
- **Working directory:** the workspace the removal command runs in, not the workspace being removed.
- **Exit codes:** `0` lets the removal proceed; any non-zero exit blocks it. The `&&` chain is the fail-closed guarantee — a failing hook keeps the worktree on disk.
- **Absent hook:** a missing file, or a file without the executable bit (for example after a checkout that lost it), is treated as no hook; PI STUDIO then runs the removal command on its own.

The composed command is dispatched like any other workspace deletion — same `Delete workspace: <branch>` terminal title — so hook output and failures are visible in the terminal run. If PI STUDIO cannot probe the hook path because of an unexpected filesystem error, the deletion request fails before any workspace terminals are closed.

Example: a hook that stops and removes local dev containers that bind-mount the worktree, so deletion does not leave stale containers behind. The hook is an opaque extension point — the contract does not assume any specific tooling, so use whatever the repository standardizes on:

```sh
#!/bin/sh
# .pi-studio/hooks/worktree-pre-remove
set -eu

worktree_path="$1"

# Stop/remove local dev containers bind-mounting "$worktree_path",
# release other per-worktree resources, etc.
# Exit non-zero to block the worktree removal.
```

## Configuration matrix

Rows with JSON key `—` are runtime-only environment variables, not config-file keys. `Global` means machine-global. In Settings, selected-machine-safe global keys (`pathAccess`, `uploads`, `attachments`, `maxUploadBytes`, `spawnSessions`, `subsessions`, `askUser`, and `plugins`) are edited for the selected machine; gateway host/port/allowed-hosts, keyboard shortcuts, and machine registry/tokens stay local.

| Config | JSON key | Env var | Scope | Project-local behavior | Applies / restart |
| --- | --- | --- | --- | --- | --- |
| **Config-file keys** |  |  |  |  |  |
| Web/API bind host | `host` | `PI_STUDIO_HOST` | Global | Not supported locally | Restart web/API |
| Web/API port | `port` | `PI_STUDIO_PORT`, `PORT` | Global | Not supported locally | Restart web/API |
| Dev-server allowed hosts | `allowedHosts` | `PI_STUDIO_ALLOWED_HOSTS` | Global | Not supported locally | Restart dev web/UI |
| External filesystem roots | `pathAccess.allowedPaths` | — | Global + project | **Merges**: global roots first, then project roots; duplicates removed | Next file request; refresh existing views if needed |
| Manual file upload default folder | `uploads.defaultFolder` | — | Global + project | **Overrides**: project value wins for workspaces in that project; otherwise global/default applies | New Upload dialogs and direct drag/drop batches after config/workspace refresh |
| Prompt attachment default folder | `attachments.defaultFolder` | — | Global + project | **Overrides**: project value wins for workspaces in that project; otherwise global/default applies | New prompt-attachment saves after config/workspace refresh |
| Upload/body limit | `maxUploadBytes` | `PI_STUDIO_MAX_UPLOAD_BYTES` | Global | Not supported locally | Restart web/API and session daemon on that machine |
| Agent can spawn sessions | `spawnSessions` | `PI_STUDIO_SPAWN_SESSIONS` | Global/session daemon | Not supported locally | Restart session daemon on that machine |
| Tracked subsessions | `subsessions` | `PI_STUDIO_SUBSESSIONS` | Global/session daemon | Not supported locally; also requires `spawnSessions` | Restart session daemon on that machine |
| Agent can post question forms | `askUser` | `PI_STUDIO_ASK_USER` | Global/session daemon | Not supported locally | Restart session daemon on that machine |
| Extension dialog auto-cancel timeout | `extensionDialogsTimeoutMs` | — | Global/session daemon | Not supported locally | Restart session daemon on that machine |
| Session environment facts | `environmentFacts` | `PI_STUDIO_ENVIRONMENT_FACTS` | Global/session daemon | Not supported locally | Restart session daemon on that machine |
| PI STUDIO plugin desired enablement/settings | `plugins.<id>.enabled`, `plugins.<id>.settings` | — | Global + sessiond startup snapshot for server entries | Not core local config; plugins may read their own project files | Browser-only: reload tab. Server-backed: manually restart sessiond, then reload tab |
| Server-plugin safe start | `serverPlugins.safeStart` | — | Global/offline recovery | Not supported locally; manage with `pi-studio plugins safe-start ...` | Applied before discovery/import on next sessiond start |
| Default browser theme | `defaultTheme.themeId`, `defaultTheme.auto` | — | Gateway global | Not supported locally; device choices take precedence | Settings save / browser config refresh; no restart |
| Keyboard shortcuts | `shortcuts.<actionId>` | — | Global | Not supported locally | Applies after settings save/config refresh |
| Project config version | `version` | — | Project | Project-local only; must be `1` when present | Next project-config read |
| **Runtime-only environment variables** |  |  |  |  |  |
| Global config file path | — | `PI_STUDIO_CONFIG` (`XDG_CONFIG_HOME` affects the default path) | Process/env | Selects the global config file; not a project config | Restart services/processes after changing env |
| Managed data directory | — | `PI_STUDIO_DATA_DIR` | Process/env | Not supported locally | Restart web/API and session daemon |
| Session daemon socket | — | `PI_STUDIO_SESSIOND_SOCKET` | Web/API + session daemon env | Not supported locally | Restart daemon and web/API; both must match |
| Session daemon TCP port | — | `PI_STUDIO_SESSIOND_PORT` | Session daemon env | Not supported locally | Restart session daemon; set `PI_STUDIO_SESSIOND_URL` for web/API too |
| Session daemon TCP host | — | `PI_STUDIO_SESSIOND_HOST` | Session daemon env | Not supported locally | Restart session daemon |
| Web-to-daemon URL | — | `PI_STUDIO_SESSIOND_URL` | Web/API env | Not supported locally | Restart web/API |
| Projects storage file | — | `PI_STUDIO_PROJECTS_FILE` | Web/API + session daemon env | Not supported locally | Restart services; advanced state override |
| Remote machines storage file | — | `PI_STUDIO_MACHINES_FILE` | Web/API env | Not supported locally | Restart web/API; advanced state override |
| Agent state directory | — | `PI_CODING_AGENT_DIR` | Session daemon env | Not supported locally | Restart session daemon on that machine; affects auth, models, settings, sessions, Pi packages, and Pi-package-backed PI STUDIO plugins |
| Agent session storage directory | — | `PI_CODING_AGENT_SESSION_DIR` | Session daemon env | Not supported locally | Restart session daemon on that machine; env-only session storage override |
| Skip update checks | — | `PI_STUDIO_SKIP_VERSION_CHECK`, `PI_STUDIO_OFFLINE`, `PI_SKIP_VERSION_CHECK`, `PI_OFFLINE` | Web/API env | Not supported locally | Restart web/API after env changes |
| Offline mode | — | `PI_STUDIO_OFFLINE`, `PI_OFFLINE` | Web/API + session daemon env | Not supported locally | Restart session daemon and web/API after env changes; also disables the [background model catalog refresh](#background-model-catalog-refresh) |

## Key details

### Managed data directory

`PI_STUDIO_DATA_DIR` sets the root for PI STUDIO-managed runtime state and defaults to `~/.pi-studio`. Unless a more specific path override is configured, PI STUDIO stores its project and machine registries, locally discovered plugins, default session-daemon socket, and session archives beneath this root.

Each data directory is independent: after pointing PI STUDIO at a new root, it starts there with empty registries and no session archives. To carry session archives over, stop PI STUDIO, then copy `archived-sessions.json` and the `archived-sessions/` directory from the old data directory into the new one before starting it again.

Only one live session daemon may use a data directory. For a second instance, set a distinct `PI_STUDIO_DATA_DIR`, `PI_STUDIO_SESSIOND_SOCKET` (or `PI_STUDIO_SESSIOND_PORT` / `PI_STUDIO_SESSIOND_HOST`), and `PI_STUDIO_PORT`. Stale ownership markers are normally recovered automatically. If startup still refuses, verify the named owner is no longer running before deleting `sessiond-owner.json` as the error suggests.

This setting does not change the PI STUDIO config file selected by `PI_STUDIO_CONFIG` or Pi-owned state such as the active session files selected by `PI_CODING_AGENT_SESSION_DIR`.

### Agent process environment

Agent shells, terminals, and spawned sessions inherit the session daemon's environment almost as-is. When the daemon starts, it removes only `NODE_ENV` and `PORT` from the environment agent processes see, so development commands behave normally inside sessions — for example, `npm install` is not affected by a production `NODE_ENV` meant for the daemon. Ordinary variables (`PATH`, `HOME`, proxy settings, and the like) stay visible, and so do the daemon's `PI_STUDIO_*` configuration keys and the resolved `PI_CODING_AGENT_DIR` / `PI_CODING_AGENT_SESSION_DIR` values, so a `pi` CLI started from inside a session uses the same agent state — auth, models, and session storage — as the daemon. The daemon itself keeps using the values it captured at startup.

Every process spawned from a session also inherits `PI_STUDIO_SESSION=1`, marking it as nested inside the running PI STUDIO instance. The inherited `PI_STUDIO_*` values point at that live instance, so starting another PI STUDIO instance from inside a session fails loudly at startup because the live instance owns the state (see [Managed data directory](#managed-data-directory)); running one deliberately requires a distinct `PI_STUDIO_DATA_DIR`, `PI_STUDIO_SESSIOND_SOCKET` (or `PI_STUDIO_SESSIOND_PORT` / `PI_STUDIO_SESSIOND_HOST`), and `PI_STUDIO_PORT`.

Session system prompts state these nesting facts — and, in a Docker deployment, the container layout facts — so agents learn the rules before discovering them by breaking their own session, including the precautions never to restart the hosting session daemon and to restart the web/API process before the session daemon. Set the `environmentFacts` config key to `false`, or `PI_STUDIO_ENVIRONMENT_FACTS=false` in the session daemon's environment, to leave environment facts out of session system prompts; they default to on.

### External path access

`pathAccess.allowedPaths` grants PI STUDIO's file explorer and absolute `@` path completions access to specific filesystem roots outside the current workspace.

By default, workspace-relative file reads stay inside the workspace and absolute paths are denied. Add only roots you trust PI STUDIO to list and read through the browser UI.

Accepted root forms:

- Unix absolute paths: `/opt/reference`
- Home-relative paths: `~/SDKs`
- Windows absolute paths on Windows hosts: `C:\Users\dev\SDKs`

When an absolute request is served, PI STUDIO expands `~`, canonicalizes the configured roots with `realpath`, requires roots to be existing directories, and rejects symlink escapes outside the allowed roots.

In **Settings → General**, external filesystem roots are saved on the selected machine. Gateway host, port, and allowed-hosts fields stay on the gateway config.

This is not a sandbox for the underlying Pi Coding Agent or your OS user. It only controls PI STUDIO UI/API file exposure outside a workspace.

### Manual upload defaults

The Files panel can upload one or more files in two ways:

- Drop files onto the Files panel to upload immediately to the workspace-effective default folder.
- Use the toolbar **Upload** button to open the review dialog, edit the destination, and opt into upload options.

`uploads.defaultFolder` sets the workspace-effective default destination. The built-in default is `.pi-studio/uploads`; a global config value applies to every project unless `<project>/.pi-studio/config.json` sets a project-local override.

```json
{
  "uploads": {
    "defaultFolder": "manual/uploads"
  }
}
```

The value must be a non-empty workspace-relative folder. PI STUDIO normalizes repeated separators and backslashes to `/`, and rejects absolute paths or `..` traversal. In the upload dialog only, clearing the destination field uploads that batch to the workspace root.

Uploads stay inside the workspace, create parent folders by default, and do not overwrite existing files unless you enable overwrite in the review dialog. Direct drag/drop never overwrites. Check the upload progress UI for completion, conflicts, and errors.

In Fleet, Settings saves the global upload default on the selected machine; the Files panel uses that project's effective destination.

The per-request size limit is still controlled by `maxUploadBytes` / `PI_STUDIO_MAX_UPLOAD_BYTES` on the machine serving the upload.

### Prompt attachment defaults

When the chat composer has pending attachments, its delivery selector offers **Save to …**: the attachments are written into a workspace folder and the prompt references the saved paths, instead of attaching the content inline.

`attachments.defaultFolder` sets the workspace-effective save destination shown in that selector. The built-in default is `.pi-studio/attachments`; a global config value applies to every project unless `<project>/.pi-studio/config.json` sets a project-local override.

```json
{
  "attachments": {
    "defaultFolder": "prompt-attachments"
  }
}
```

The value must be a non-empty workspace-relative folder. PI STUDIO normalizes repeated separators and backslashes to `/`, and rejects absolute paths or `..` traversal. Saved attachments always stay inside the workspace root, and an explicit per-request folder on the attachments API overrides the configured default.

In Fleet, Settings saves the global attachment default on the selected machine; the composer uses that project's effective destination.

### Agent state directory

PI STUDIO runs every session on its bundled Pi SDK. `pi-studio doctor` and the status/update flow probe the `pi` command on the machine's `PATH`.

`PI_CODING_AGENT_DIR` selects the Pi agent state directory used for auth providers, models, settings, sessions, Pi packages, and Pi-package-backed PI STUDIO plugin discovery. It defaults to Pi's own default, `~/.pi/agent`. `PI_CODING_AGENT_SESSION_DIR` overrides session storage separately from the state directory. Both are environment-only; there is no config-file key.

```sh
# Session daemon environment
PI_CODING_AGENT_DIR=/opt/pi-profiles/lab
PI_CODING_AGENT_SESSION_DIR=/opt/pi-profiles/lab-sessions
```

The directory must use the data layout supported by the bundled Pi SDK; PI STUDIO does not load or convert incompatible formats, migrate profile data, or repartition PI STUDIO-managed archives when the directory changes.

The session daemon resolves the directory once at startup and exports the resolved values to everything it starts, so sessions, terminals, the bash tool, and subsessions all observe the same `PI_CODING_AGENT_DIR` / `PI_CODING_AGENT_SESSION_DIR`. That resolved active directory stays fixed for the daemon lifetime: changing the environment takes effect on the next session-daemon restart on that machine, and until then sessions, Pi package operations, Pi-package-backed PI STUDIO plugin discovery, status/install detection, and update planning continue to use the daemon-owned active directory; a web/API restart recovers that same active directory instead of applying the new value.

If the session daemon cannot report a valid active directory, profile-dependent Pi package and PI STUDIO plugin operations report unavailable instead of falling back to independently resolved values. A package-managed update command is shown only when the daemon reports a valid active directory and the `pi` command is on `PATH`, and the command pins that directory for the update. Restart the session daemon on the selected machine to establish the next active directory.

### Pi extension provider baseline

Model providers are shared across all sessions on a machine. PI STUDIO loads them when the session daemon starts, using Pi's built-in providers, environment credentials, the active agent directory's `models.json`, and globally installed Pi extensions/packages. PI STUDIO workspace plugins are separate; see the [插件说明](plugins.md).

Provider connection settings stay fixed until the daemon restarts. Project extensions and `/reload` cannot add, replace, or remove providers. Other Pi extension features continue to load and reload normally.

Pi virtual models are unsupported in PI STUDIO, even from global extensions: their routers capture session-bound context that cannot safely be shared across sessions. Calls to `registerVirtualModel()` or `unregisterVirtualModel()` on the shared runtime raise explicit errors, reported in bootstrap diagnostics or session extension errors. Disable the extension's virtual-model feature and select a physical model instead; restarting the daemon does not enable it.

#### Model list refresh for a known provider

An extension may refresh an existing provider's **model list** without a restart, provided all other provider settings remain unchanged. Changes to credentials, connection settings, or provider implementation require a daemon restart. Accepted model-list updates are available to sessions immediately.

Model lists are shared daemon-wide state. If extensions in two workspaces register different model lists for the same provider ID, the last registration wins. A model entry may also carry its own `baseUrl` and `headers`, which take precedence over the provider-level values for that model, so an accepted refresh can change where requests for those models are sent. Both are accepted trade-offs: a catalog is treated as a property of the provider rather than of the project, and Pi extensions are trusted daemon code.

#### Provider decisions in the daemon log

Provider decisions are recorded in daemon logs, not browser notifications. Entries omit provider configuration and credentials. See [提供方扩展排障](faq.html#provider-extension-no-effect) for ignored changes.

This prevents accidental provider, configuration, or credential contamination between projects; it is not a security boundary because Pi extensions remain trusted daemon code.

Configure providers before the daemon starts: use the active agent directory's `models.json`, or install the Pi extension globally in that agent directory. Project Pi extensions and project-level `models.json` files cannot add providers to PI STUDIO's shared baseline. After updating PI STUDIO—or after installing, removing, or updating a global Pi extension that registers providers—manually restart `pi-studio-sessiond.service` (`systemctl --user restart pi-studio-sessiond`). Restarting only the web/API service and running `/reload` do not rebuild the baseline.

### Background model catalog refresh

PI STUDIO shares one model runtime across all sessions, and provider model catalogs are refreshed over the network only on the session daemon's own background schedule. Requests never start a catalog fetch of their own, so a slow or unreachable provider cannot stall opening the model selector, starting a session, or the auth dialogs on its own account.

A refresh that is *already* in flight can still briefly delay starting or opening a session, because the shared runtime is read while that refresh is running. PI STUDIO says so while you wait: the session's activity line names the startup step it is on and adds `provider model lists are refreshing` when a background refresh is running at the same time. That note reports what is happening concurrently, not a proven cause.

The session daemon runs the refresh:

- **15 seconds after the daemon starts**, then **hourly**. Pi treats stored catalogs as fresh for four hours, so most hourly ticks make no network request at all; the shorter tick only makes sure a due refresh is not delayed to the next tick.
- **Immediately after a provider login or logout**, bypassing that freshness window, because the cached catalog is known to be wrong.

Each run is bounded: it is aborted after **60 seconds**, and a run that times out or cannot reach a provider earns **one retry after five minutes**; a provider that answers with an error status is retried on the next scheduled refresh instead. Failures never clear the stored catalogs — the last successfully fetched models stay in use and the daemon log records what failed. A refresh in flight is also aborted when the daemon shuts down.

Models fetched by a background refresh appear the next time a client asks for the model list, so a model selector left open across a refresh may need to be reopened.

To turn the background refresh off entirely, set `PI_STUDIO_OFFLINE` or `PI_OFFLINE` in the session daemon's environment and restart it. In offline mode PI STUDIO performs no provider catalog network requests, including after logins, and sessions use the catalogs already stored in the agent directory. The `PI_STUDIO_SKIP_VERSION_CHECK` and `PI_SKIP_VERSION_CHECK` keys do **not** affect this refresh; they only suppress PI STUDIO release checks.

### Project trust for project-local resources

PI STUDIO always honors Pi's project-trust settings before loading a workspace's project-local `.pi/` resources — `.pi/extensions/*`, the `packages` declared in `.pi/settings.json`, and the other `.pi/` settings and resources. There is no opt-out config key: trust applies at every session start, the way `pi` itself applies it.

A project-local `.pi/extension` is arbitrary code that runs inside the agent process on every session for that workspace, so an untrusted workspace must not load one.

Trust is resolved the way `pi` resolves it with no trust prompt to show:

- A workspace with no trust-requiring `.pi/` resources is always loaded (there is nothing to gate).
- User/global extensions (loaded before the decision, exactly as `pi` does) may decide trust through the `project_trust` extension event, and may request `remember` to persist their decision to the agent directory's `trust.json`. When the event decides, it wins — the same order `pi` uses.
- Otherwise a saved decision in the agent directory's `trust.json` (from the Pi CLI's trust prompt, the workspace trust toggle, or a `remember`-ing extension) wins.
- Otherwise the agent's `defaultProjectTrust` setting decides: `always` loads the project resources, and `never` skips them. `ask` skips them too, because PI STUDIO has no browser trust prompt yet and a non-interactive `pi` also treats `ask` as untrusted.

This mirrors the Pi CLI: with `defaultProjectTrust: "never"`, an opened workspace's `.pi/` extensions and packages are ignored rather than loaded silently.

### Session daemon tools

`spawnSessions` controls whether agents receive the `spawn_session` tool. It defaults to `true`; set it to `false` if you do not want an agent to start independent PI STUDIO sessions.

`subsessions` controls whether agents receive the tracked-subsession tools: `spawn_subsession`, `list_subsessions`, `check_subsession`, `read_subsession`, and `yield_to_subsessions`. It defaults to `true` and also requires `spawnSessions` to be enabled.

Tracked subsessions are join-oriented. Calling `spawn_subsession` returns immediately, so the parent can continue independent work while the child runs. Work whose result the parent does not need to join belongs in the fire-and-forget `spawn_session` tool instead.

A tracked subsession always runs in the spawning session's working directory, so it stays in that workspace's session tree next to its parent. `spawn_subsession` takes no `cwd`. To get work done elsewhere, instruct the child to work there from this workspace, or use `spawn_session`, which still targets any workspace of the project, for an independent session there.

The parent can continue independent work or wait for its tracked children. Completion notices arrive automatically and wake an idle parent; no polling is needed. Child output is available to the parent when the child stops.

Both `spawn_session` and `spawn_subsession` accept an optional `model` parameter, given as an exact `provider/model-id` such as `anthropic/claude-sonnet-4-5`. When set, the new session starts on that model instead of inheriting the dispatching session's model. The match is strict: an unknown or malformed value is rejected with an error. A `#provider/model-id` reference in the prompt (see [Prompt completions](#prompt-completions)) is how users ask for a specific model; agents forward that reference as this parameter. The new session also inherits the dispatching session's thinking level, clamped to its model's capabilities.

In **Settings → Session daemon**, these keys are saved on the selected machine. Restart the session daemon on that machine after changing them.

#### `askUser` and `ask_user`

`askUser` controls whether agents receive the core `ask_user` tool. It defaults to `true`; set it to `false`, or set `PI_STUDIO_ASK_USER=false`, to remove the tool. The environment override accepts `0|1|true|false` and takes precedence over the config file.

Use **Settings → Session daemon → Allow agents to ask questions** to change `askUser` on the selected machine. An environment override makes the toggle read-only.

Agents can post a form with 1–20 questions, with free-text answers or up to 12 choices per question. Some questions allow multiple selections. A **Custom** free-text answer is always available, and you may leave any question unanswered.

Calling `ask_user` posts the whole set as one browser form and ends the current agent run instead of waiting for the user. The open form is owned by the session daemon, so it survives a browser disconnect, browser reload, or web/API restart while that daemon keeps running. When the user submits, the answers arrive as a follow-up that wakes the session; each question is reported with its selected option values or free text, or explicitly as unanswered.

PI STUDIO confirms a partial submission before sending it and names the unanswered questions. Only one ask can be open per session: a later `ask_user` call supersedes the earlier one, reports that fact and its unanswered questions to the model, and turns the earlier card into a read-only transcript record. Submitted and cancelled asks likewise remain readable in the transcript.

Sending an ordinary chat message while a form is open voids the form: the card closes as cancelled and the model is told its questions went unanswered as part of the turn the message itself starts.

Restart the session daemon after changing `askUser` or after upgrading PI STUDIO to a version that introduces this tool. For the systemd user service, run `systemctl --user restart pi-studio-sessiond`.

### Extension dialogs

Pi extensions can show confirmation, selection, and text-input dialogs inline in the session transcript, including while a session starts or a tool runs. Dialog support is always on; there is no enable flag. See [Pi 扩展对话框](plugins.md#pi-extension-dialogs) for details.

`extensionDialogsTimeoutMs` is the unattended-dialog safety valve: how long the session daemon waits for an answer before settling the dialog with its kind's cancel value (`false` for confirm, `undefined` for select and input). It defaults to `300000` (5 minutes); set it to `0` to wait forever. An extension's own `timeout` option still applies, and the effective deadline is the sooner of the two.

The key is edited directly in the global config file. Restart the session daemon after changing it — for the systemd user service, run `systemctl --user restart pi-studio-sessiond`.

### PI STUDIO plugin config and recovery

The `plugins` key controls desired enablement and JSON settings for PI STUDIO browser-only, server-only, and dual-entry plugins on the machine whose config you are editing. It does not install, remove, or update Pi packages; use **Settings → Pi packages** or Pi's package manager for package operations.

```json
{
  "plugins": {
    "git": { "enabled": true, "settings": {} },
    "workspace-tasks": { "enabled": true },
    "updates": { "enabled": false }
  }
}
```

Plugins are enabled by default unless their package metadata declares `defaultEnabled: false`, as Captain's Log does. Explicit `plugins.<id>.enabled` config overrides the package default. `plugins.<id>.enabled: false` hides a browser-only entry on the next page load. For a server-backed entry, desired disablement takes effect on the next sessiond start; its paired browser entry continues to follow the still-active server entry until that restart. The bundled `pi-studio.terminal` plugin is required during normal startup: ordinary config cannot disable it, and Settings renders it non-editable. Server settings take effect at daemon startup; diagnostics do not expose their values.

#### Desired versus active plugin state

Saving `plugins` config or replacing package files changes **desired** state, not the running server code. A disabled server plugin and its paired UI may remain active until the session daemon restarts. PI STUDIO withholds a paired UI when its package/settings no longer match the running server code or the server plugin is unhealthy or incompatible.

**Settings → PI STUDIO plugins** distinguishes desired from active state and shows failures, compatibility problems, safe mode, and required restarts. If the daemon is unavailable, desired config may still be editable, but active state is unavailable.

In Fleet, this panel targets the selected machine. Unsupported or incompatible remote plugin features report errors rather than using gateway config or code.

Mixed-version plugin operation is unsupported in either upgrade order. Remote plugins, including Git, may be unavailable or return `404`. Upgrade gateway and target together, restart their updated web/API processes and the target session daemon, then reload the browser. Other selected-machine features may report their own compatibility errors.

Apply changes in this order:

1. Install or update the package on the target machine.
2. Save desired enablement/settings.
3. For a browser-only plugin, reload the browser tab.
4. For a server-backed plugin, manually restart the target session daemon, wait for it, then reload the browser tab.

> **Manual restart warning:** for the native user service, run `systemctl --user restart pi-studio-sessiond` (unit `pi-studio-sessiond.service`). Restarting sessiond may interrupt active sessions and runtime ownership. A browser reload, web/UI autoreload, restarting only web/API, and Pi's `/reload` do not activate server-plugin state.

#### Offline disable and safe start

The recovery CLI edits global config offline. It does not contact sessiond, discover packages, import plugin modules, or include machine credentials. Run it directly on the affected machine; for a custom service config, add `--config /path/to/config.json`.

```bash
pi-studio plugins disable <plugin-id> --restart
pi-studio plugins safe-start show
pi-studio plugins safe-start set bundled-only --restart
pi-studio plugins safe-start set none --restart
pi-studio plugins safe-start clear --restart
```

`disable` persists `plugins.<id>.enabled: false`, but rejects required `pi-studio.terminal` with no-plugin safe-start recovery guidance. Safe-start state is stored under `serverPlugins.safeStart`: `bundled-only` filters external server packages before discovery/import while still requiring bundled Terminal, whereas `none` imports no server plugins and retains the kernel project-folder and diagnosis/settings surfaces without Terminal or Terminal-backed commands. `clear` restores ordinary configured discovery on the next start. An unsupported `serverPlugins.safeStart` shape or value in otherwise valid JSON fails closed as effective `none`; use `safe-start show`, then `set` or `clear`, to repair it offline.

`--restart` performs a restart only for a recognized safe installed-service plan; otherwise it prints manual instructions. The config mutation is durable before PI STUDIO attempts the restart. If the service-manager command itself fails, restart sessiond manually.

Ordinary import/activation/start/health failures are quarantined when possible, but server plugins are trusted in-process code, share sessiond's event loop, and are not crash-isolated. `bundled-only` bypasses external plugin failures; `none` is the emergency level that also bypasses bundled server plugins. Setting, clearing, or disabling takes effect for server code only after sessiond restarts, and that restart may interrupt active sessions/runtime ownership.

### Theme default and device choices

In **Settings → General → Theme**, choose a theme and whether **Auto** should follow the device's light/dark preference when that theme has a pair. Then choose one of three actions:

- **Use on this device** saves the theme and Auto choice in this browser. Other browsers are unchanged.
- **Set as default** saves the theme and Auto choice to the global PI STUDIO config. Browsers using the default pick it up after a page reload or config refresh; existing device choices are unchanged.
- **Use the default** removes this browser's saved override and follows the configured default.

The action palette's **Select theme** action opens these settings too. Existing browser-local choices remain device overrides; they are not copied into shared config.

```json
{
  "defaultTheme": {
    "themeId": "themes:pi-studio-dark",
    "auto": true
  }
}
```

`themeId` must be a qualified theme contribution ID (`<plugin-id>:<theme-id>`), not its display name or a theme-pair ID. Built-in IDs are `themes:pi-studio-dark`, `themes:pi-studio-light`, and `themes:classic`; installed gateway plugins may provide additional themes. `auto` must be a boolean. With Auto off, the selected theme stays fixed. Without a pair, Auto leaves the selected theme unchanged.

Precedence is **device choice → configured default → built-in default**. The built-in default is PI STUDIO Dark with Auto on. A missing or disabled plugin theme temporarily falls back to Classic without erasing the requested choice, so it can return when the plugin is available again. Applying a configured default does not create a device override.

The theme default belongs to the browser-facing gateway, even when a remote machine is selected. It is not a project-local `.pi-studio/config.json` setting; remote plugins cannot change the app-wide theme. No session-daemon or web service restart is needed for a theme preference change.

### Shortcut config

Shortcut values are keyed by action id. Values are shortcut strings such as `mod+k`, `g p`, or `shift+enter`; `null` disables that action's shortcut.

```json
{
  "shortcuts": {
    "core:view.chat": "mod+1",
    "core:session.stop": null,
    "app.navigation.focus-projects": "g p",
    "composer.send.desktop": "mod+enter",
    "composer.send.mobile": "shift+enter"
  }
}
```

Prefer Settings → Keyboard for editing, recording, disabling, or resetting shortcuts. `mod` accepts Ctrl or ⌘. Browsers and operating systems may reserve some combinations.

App shortcuts can be single keys or sequences. Unmodified and Shift-only shortcuts do not start inside inputs, textareas, selects, or contenteditable editors. Sequences expire after 1.2 seconds; Escape or a focus change cancels them. Custom bindings win over defaults; ties resolve by action id. A shorter binding shadows sequences with that prefix (for example, `g` shadows `g p`).

The two **Chat composer** send bindings accept one key combination each, not sequences. **Send message — desktop** defaults to Enter; **Send message — touch or narrow screen** defaults to Shift+Enter. The latter applies when the browser reports a coarse primary pointer (typically touch) or a viewport at most 760px wide; otherwise, desktop applies. Its config key remains `composer.send.mobile`. Enter and Shift+Enter insert newlines when not assigned to send. Composer send bindings take priority over app shortcuts only inside the message editor, even when the draft is empty or sending is unavailable. Plain Enter accepts a selected completion first. `null` disables keyboard submission for that context; the send button remains available.

Existing browser-local Enter preferences remain the fallback until the corresponding composer binding is configured. Reset removes the override and returns to that fallback. New bindings are saved in the gateway config, like other shortcuts; the old preference is not copied into shared configuration. Automatic touch-keyboard capitalization is ignored when interpreting Shift+Enter.

## Prompt completions

The chat composer opens completion menus on three trigger characters:

- `/` at the very start of the draft completes session commands.
- `@` completes file paths: `@` for tracked files, `@ ` (at, then space) or `!@` for all files. Picking one inserts an `@path` reference into the draft, quoted automatically when the path contains spaces.
- `#` completes the models available to the session, filtered case-insensitively as you type (at most 12 entries). Picking one inserts a `#provider/model-id` reference into the draft, which tells agents the request should run on that model — for example as the `model` parameter of `spawn_session`.

## Optional completion tools

File and path `@` completions work without extra tools. If `fzf` is available on the PI STUDIO server's `PATH`, PI STUDIO uses it to improve completion filtering/ranking; otherwise it falls back to built-in ranking.
