# Agent Notes

## Project identity

PI Studio is the multi-platform product built from PI WEB. It provides one shared coding workspace experience across:

- Web browser
- Windows Desktop
- Android app

The product model is: machine → project → workspace → session. Keep behavior consistent across clients while allowing each shell to use platform-appropriate layout and integration.

## Runtime ownership

The project runs locally with split systemd user services:

- `pi-web-sessiond.service` runs `npm run start:sessiond` in non-autoreload, non-auto-restart mode.
- `pi-web-ui-dev.service` runs the web/API and Vite UI in development mode with `npm run dev:web` and `npm run dev:client`.

The session runtime owner is long-lived and separate from the autoreloading UI/API process. Browser disconnects and UI/API restarts must not stop active Pi sessions.

Changes affecting `src/server/sessiond.ts`, session runtime ownership, the session daemon protocol, or code loaded only by the session daemon require a manual session-daemon restart. UI/API changes normally use the autoreload path and do not require restarting sessiond.

## Branch and repository focus

The active development branch is `feat/desktop-and-app`. Do not use `main` as the integration base while this work is in flight, and do not create new work branches from `main` for this scope.

This branch keeps the following product work together:

- Shared web UI and API
- Windows Desktop packaging and shell integration
- Android WebView client and platform integration
- Remote machines, SSH connections, and SSH tunnels

The legacy repository and package names may remain in code during migration. Do not perform broad renames or package migrations unless explicitly requested.

## Clients

### Android

The Android client lives in `android/` and uses Kotlin, the Gradle wrapper, and the shared Desktop connection page.

- SDK: `~/Android/sdk`
- Build: `cd android && ./gradlew assembleDebug`
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Export `ANDROID_HOME=$HOME/Android/sdk` when needed.
- `adb` is at `$ANDROID_HOME/platform-tools/adb`.
- The emulator AVD is `piweb`.
- WebView inspection uses `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` and page-level WebSocket CDP. Playwright browser-level `connectOverCDP` does not work with this WebView.

### Windows Desktop

The Desktop client lives in `desktop/`. `desktop/electron-builder.yml` is the single packaging configuration source. `desktop/dist/` is never committed.

- Build: `cd desktop && npm run build`
- Installer: `desktop/dist/PI Desktop Setup.exe`
- The installer, not the portable executable, is the supported Windows deliverable.
- The Desktop shell owns connection setup, direct HTTP(S) connections, recent connections, SSH configuration, and SSH tunnels. The connected Gateway normally provides the web application UI.
- Do not assume the UI is bundled into the Desktop shell. The shell and Gateway are separate delivery boundaries.
- Preserve multi-size `icon.ico` usage for Windows resources, shortcuts, tray, and taskbar icons.

## UI and product conventions

- Keep the overall interface concise and low-noise, with Codex Desktop as the visual reference.
- Use simple monochrome line icons instead of colorful emoji for navigation.
- The navigation hierarchy is project → workspace → session.
- Expanding a project should expose its main workspace and sessions without changing the current conversation.
- Browsing projects or workspaces must not automatically select the first or previously selected session.
- Only an explicitly selected session receives selected-row background styling. Parent project and workspace rows must not become selected merely because they contain the active session.
- Clicking a project or workspace name, icon, or expander toggles expansion. Expanding one directory must not collapse other expanded directories.
- Session titles stay on one line with ellipsis; secondary metadata appears as smaller text below.
- Session action buttons stay compact and aligned to the right. Trailing menus should be transparent and share the row hover/selection surface rather than showing a detached white block.
- Preserve existing status indicators, menus, trust controls, cleanup, archive, restore, rename, multi-select, keyboard navigation, and machine switching.
- Keep classic theme behavior intact while supporting the current light, dark, and automatic themes.
- Keep composer model selection, thinking depth, and attachment controls independent and unchanged unless explicitly requested.

## Configuration and URL boundaries

- `$PI_WEB_DATA_DIR` contains PI Studio-managed state such as projects and machines; it is not the user-editable configuration API.
- Global user and machine configuration belongs in `$PI_WEB_CONFIG` or `~/.config/pi-web/config.json`.
- Project-local core configuration belongs in `<project>/.pi-web/config.json`.
- Plugin-owned project configuration may use separate files such as `.pi-web/tasks.json`.
- Client application paths must be application-relative without a leading slash, for example `api/...` and `pi-web-plugins/...`.
- Encode dynamic path segments with `encodeURIComponent` and query values with `URLSearchParams` where appropriate.
- Use the existing URL helpers at browser boundaries: `request()`, `resolveAppUrl()`, `resolveAppWebSocketUrl()`, and `resolvePluginModuleUrl()`.
- Do not introduce raw leading `/api` or `/pi-web-plugins` references in production client code.

## Verification policy

This project does not add automated test files or test-only fixtures. Do not introduce or restore unit, component, integration, or end-to-end test suites.

Verify behavior through:

1. Real functional checks using the local web service, browser, Electron client, Android emulator/device, or built artifacts.
2. Manual code review focused on behavior, boundaries, security, data integrity, and maintainability.
3. `npm run verify`, which runs typecheck, lint, and knip.
4. `git diff --check`.

Never report failed, incomplete, or skipped verification as passing. State what was not run and why.

## Git and release discipline

- Keep user-visible changes in a Changeset under `.changeset/`.
- Do not manually edit `CHANGELOG.md`; release tooling generates it.
- Include design documents with the related implementation rather than committing them alone.
- Use Conventional Commit style when committing.
- Do not merge or rebase `develop` into a working branch. Finish work on the working branch, then merge that branch into the target branch.
- Do not create Git worktrees unless the user explicitly requests one.

## Operational safety

Use the Linux toolchain in this environment. Do not read or echo secret files, password environment variables, access tokens, or private keys.

Production and staging data are read-only unless the user explicitly authorizes writes. Avoid restarting the session daemon unless the user explicitly requests or authorizes it; it owns active sessions.
