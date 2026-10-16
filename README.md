# PI STUDIO

[![CI](https://github.com/pi-studio/pi-studio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/pi-studio/pi-studio/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@pi-studio/pi-studio)](https://www.npmjs.com/package/@pi-studio/pi-studio)
[![Node.js](https://img.shields.io/node/v/@pi-studio/pi-studio)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**PI STUDIO is a web UI for [Pi Coding Agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) that keeps agent sessions running in real workspaces on your machine or server.**

Run agents where your code, tools, credentials, and build caches live. Supervise them from any browser.

Website and docs: <https://pi-studio.dev/>

![PI STUDIO](docs/assets/pi-studio-banner.png)

![PI STUDIO desktop screenshot](docs/assets/pi-studio-desktop.png)

## Why PI STUDIO?

Agentic development works better when the work environment is persistent.

PI STUDIO lets you:

- keep Pi Coding Agent sessions alive after browser disconnects;
- run agents inside real repositories and git worktrees;
- supervise multiple sessions in parallel;
- switch between laptop, phone, tablet, and desktop;
- use a server, workstation, or remote dev box as your agent runtime;
- manage projects, workspaces, files, terminals, sessions, and remote machines from one web UI.

Your browser is the control surface. The work stays where it can keep running.

## Quick start

Requirements:

- Node.js 22.19.0 or newer
- npm
- Pi Coding Agent 1.x, configured for your user
- git and the development tools your agents need

Install and start PI STUDIO as per-user services:

```bash
npm install -g @pi-studio/pi-studio --allow-scripts=node-pty
pi-studio install
pi-studio doctor
```

On npm 12, the scoped flag lets `node-pty` prepare its required native module without enabling install scripts for other dependencies.

Then open:

```text
http://127.0.0.1:8504
```

Useful commands:

```bash
pi-studio status
pi-studio logs
pi-studio restart
pi-studio doctor
pi-studio version
pi-studio uninstall
```

<!-- Keep README guidance concise. Put install variants, troubleshooting,
configuration, and operational details in docs/, then link from here. -->

For more install options, including one-line install, Pi package install, WSL/manual usage, and remote access, see the [installation guide](https://pi-studio.dev/install).

## Core model

PI STUDIO organizes work like this:

```text
Machine     a local or remote PI STUDIO runtime endpoint
Project     a folder on that machine
Workspace   a provider-owned working folder; bundled Git discovers worktrees, otherwise the project folder
Session     a Pi Coding Agent chat running inside a workspace
```

A typical flow:

1. Add a project.
2. Choose a workspace or git worktree.
3. Start a session.
4. Let the agent work.
5. Come back later from any browser.

## Remote-first development

PI STUDIO is designed for remote AI-driven development.

Instead of tying agent work to your laptop session, run PI STUDIO on a machine that stays available: a server, desktop, cloud VM, home lab machine, or remote dev box.

Use a private network, SSH tunnel, trusted reverse proxy, or federated PI STUDIO machine setup when accessing it remotely.

Read more: [Remote-first development](https://pi-studio.dev/remote-first)

## Machines and fleets

PI STUDIO can register other PI STUDIO runtimes as remote machines. One browser-facing PI STUDIO instance can proxy projects, files, git state, sessions, terminals, activity, Pi package management, and selected-machine settings from trusted remote machines.

When a remote machine is selected, Settings tabs label their target. Pi packages, PI STUDIO plugin enablement, session daemon toggles, external file access, and upload defaults target the selected machine. Gateway/server settings such as host, port, allowed hosts, registered machines/tokens, and keyboard shortcuts stay local to the gateway/browser.

Read more: [Fleet and machines guide](https://pi-studio.dev/machines)

## PI STUDIO plugins

Extend PI STUDIO with trusted plugins for panels, tools, and workspace workflows. Use **Settings → PI STUDIO plugins** to enable or disable them on the selected machine.

Pi packages are a separate Pi package-manager concept. A Pi package may include a PI STUDIO plugin, but installing a package and enabling it are different operations. Server-backed changes require a session-daemon restart; see the plugin guide for lifecycle and recovery details.

Read more: [PI STUDIO plugin guide](https://pi-studio.dev/plugins)

## Configuration

Global config lives at:

```text
$PI_STUDIO_CONFIG
~/.config/pi-studio/config.json
```

Project-local PI STUDIO config lives at:

```text
<project>/.pi-studio/config.json
```

Common configuration includes host/port, path access, uploads, PI STUDIO plugin enablement, shortcuts, and session daemon options. In Settings, machine-affecting config targets the selected machine; gateway host/port/allowed-hosts, remote machine registration, tokens, and keyboard shortcuts stay local.

Read more: [Configuration reference](https://pi-studio.dev/config)

## Development

Clone the repository and run:

```bash
npm install
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:8505
```

For the split development setup:

```bash
npm run dev:sessiond
npm run dev:web
npm run dev:client
```

Validate changes with:

```bash
npm run verify
```

## Security model

PI STUDIO assumes trusted users, trusted repositories, and trusted server paths.

It is not a sandbox, permission system, or multi-tenant platform. Do not expose it directly to the public internet without a trusted network, firewall, VPN, SSH tunnel, or authenticated reverse proxy.

## Documentation

- [Website](https://pi-studio.dev/)
- [Install](https://pi-studio.dev/install)
- [Remote-first development](https://pi-studio.dev/remote-first)
- [Machines / fleet](https://pi-studio.dev/machines)
- [Configuration](https://pi-studio.dev/config)
- [Plugins](https://pi-studio.dev/plugins)
- [FAQ](https://pi-studio.dev/faq)

## License

MIT © 2026 Federico Jaramillo Martinez. See [LICENSE](LICENSE).
