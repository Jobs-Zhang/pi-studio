# Development Guidelines

## Product and Engineering Principles

PI STUDIO is a coding workspace for Web, Windows Desktop, and Android. Its shared model is machine → project → workspace → session. Keep behavior consistent across clients while using platform-appropriate layouts and integrations.

- **Lightweight and performant first.** Lightweight applies to user experience, product design, and implementation: low-noise interfaces, direct workflows, responsive interaction, and low runtime overhead.
- Focus on core coding workflows. Do not accumulate features, entry points, or configuration options, or introduce complex technology, heavy dependencies, unnecessary abstractions, or infrastructure for speculative needs.
- New capabilities, dependencies, and background work must provide a clear benefit that justifies their cognitive and runtime costs.
- Base performance improvements on measurement. Do not trade correctness, security, or data integrity for speed.
- Do not write or introduce automated tests, test fixtures, or test frameworks. Verify behavior through real functional checks; static analysis is supplementary.

## Architecture and Runtime Ownership

- The session daemon owns long-lived sessions and terminals, separately from the Web/API process. Browser disconnects and Web/API restarts must not stop sessions.
- Changes to `src/server/sessiond.ts`, the daemon protocol, or daemon-only modules require a session-daemon restart. Ordinary UI/API changes do not.
- Restarting sessiond interrupts active sessions and terminals. Make that impact clear before a restart; when both processes need restarting, restart Web/API before sessiond.
- `main` integrates Web/API, clients, remote machines, and SSH support.
- Packages under `pi-packages/` ship with the project. Their names identify installation state; review callers and saved installation records before renaming them.

## Clients

### Android

- Source: `android/`, using Kotlin and the Gradle wrapper.
- Configure `ANDROID_HOME` for the installed Android SDK.
- Build: `cd android && ./gradlew assembleDebug`.
- Output: `android/app/build/outputs/apk/debug/app-debug.apk`; this is a debug build, not a signed release.
- The connection page is shared with Desktop through `desktop/connect.html`; platform differences use capability negotiation.
- Inspect WebView using `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` and page-level WebSocket CDP, not Playwright's browser-level `connectOverCDP`.

### Windows Desktop

- Source: `desktop/`; `desktop/electron-builder.yml` is the single packaging configuration source.
- Build: `cd desktop && npm run build`.
- Installer: `desktop/dist/PI Studio Setup.exe`. Do not commit `desktop/dist/`.
- The installer is the supported deliverable. A portable executable does not replace shortcut registration required for notifications.
- The shell owns connection setup, recent connections, SSH configuration, and tunnels. The connected Gateway normally serves the application UI; do not assume it is bundled with the shell.
- Preserve multi-size `icon.ico` usage for Windows resources, shortcuts, tray, and taskbar icons.

## UI Conventions

- Use Codex Desktop as the visual reference. Keep the interface concise and low-noise, with monochrome line icons for navigation.
- The hierarchy is project → workspace → session. Expanding directories must not change the conversation or collapse other directories.
- Project and workspace names, icons, and expanders toggle expansion. Browsing must not automatically select a session.
- Only an explicitly selected session receives selected-row styling; its parent project and workspace do not.
- Keep session titles on one line with ellipsis and secondary metadata below. Keep actions compact and right-aligned; trailing menus share the row surface.
- Preserve status indicators, trust controls, archive/restore, cleanup, rename, multi-select, keyboard navigation, and machine switching.
- Preserve Classic, light, dark, and automatic themes. Keep model selection, thinking depth, and attachment controls independent unless the task explicitly changes them.

## Configuration and URL Boundaries

- `$PI_STUDIO_DATA_DIR` stores managed state such as projects and machines; it is not the user configuration API.
- Global configuration uses `$PI_STUDIO_CONFIG` or `~/.config/pi-studio/config.json`, respecting `XDG_CONFIG_HOME`.
- Project configuration uses `<project>/.pi-studio/config.json`. Plugins may own separate files such as `.pi-studio/tasks.json`.
- Client application paths are relative without a leading slash, such as `api/...` and `pi-studio-plugins/...`.
- Encode dynamic path segments with `encodeURIComponent` and query values with `URLSearchParams`.
- Use `request()`, `resolveAppUrl()`, `resolveAppWebSocketUrl()`, and `resolvePluginModuleUrl()` at browser boundaries. Do not introduce raw `/api` or `/pi-studio-plugins` paths in production client code.

## Verification and Delivery

- Exercise affected workflows in a real Web service, browser, Electron client, Android emulator/device, or built artifact, including normal and critical failure paths.
- For performance changes, record reproducible steps and before/after measurements.
- Manually review behavior, boundaries, security, data integrity, and maintenance cost.
- Run `npm run verify` (typecheck, lint, and knip) and `git diff --check`.
- Build, packaging, and static-check success does not establish functional correctness. Report skipped, failed, and blocked verification explicitly.
- See [development and delivery checks](docs/development-checks.md) for delivery requirements.

## Documentation and Releases

- Keep `README.md` concise; place detailed guidance in the relevant documentation. Keep `AGENTS.md` and `README.md` in English and free of machine-specific setup or personal operating policies.
- Add user-visible changes to `.changeset/`. Do not edit generated `CHANGELOG.md` manually.
- Use Conventional Commits. Commit design documents with the related implementation, not on their own.
- npm publishing and website deployment are not configured for this project yet. Do not describe reserved endpoints as available release channels or enable publishing workflows without confirmed release configuration.
