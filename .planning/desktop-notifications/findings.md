# Findings: PI WEB Desktop Notifications

**Last Updated**: 2026-10-09

## Current State Analysis

### Code Changes Summary
From handoff document:
- **Modified files**: 7 files (+127/−1)
- **New files**: 4 files
- **Pre-existing changes**: `package.json` and `package-lock.json` have unrelated `allowScripts` change

### Key Components
1. **Daemon side**: Added `ask.opened` and `dialog.opened` global events
2. **Client side**: `desktopNotifications.ts` module with opt-in, permission, deduplication
3. **Electron shell**: `desktop/` directory with main.cjs, package.json, README.md
4. **Release note**: `.changeset/desktop-notifications.md` (minor)

### Known Gaps (from handoff)
1. Activation only selects sessions in `state.sessions` for selected machine
2. Session labels for remote machines usually unknown ("Agent")
3. Notifications fire whether or not window is focused (except current session)
4. No OS notification for `session.error`
5. No signing, auto-update, or packaging/installer
6. No canonical user-facing docs

## Technical Details

### Electron Shell Implementation
- Uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Sets `app.setAppUserModelId("dev.pi-web.desktop")` for Windows notifications
- Tray with Show/Hide and Quit options
- Single instance lock
- External links open in default browser
- Window close exits app (no background running)

### Notification Flow
1. User enables notifications via action palette
2. Permission requested through user gesture
3. Events mapped to notifications with tag deduplication (limit 256)
4. Suppression for current session on screen
5. Activation focuses/selects session

### Testing Status
- **Passing**: typecheck, eslint, 1184 targeted tests
- **Baseline verified**: Terminal plugin tests pass on clean `main` (2 runs, 7/7 tests each)
- **Full suite**: 3 failures in `pi-web-plugins/terminal/server/server-plugin.test.ts` (same as handoff)
- **Not tested**: Electron shell on Windows, browser notification toggle

### Terminal Plugin Test Failures
The 3 failures are consistent in full suite but pass when run alone:
1. `reports a private host-composed command failure without exposing the intent on the run`
2. `reports a private host-composed command failure without exposing the intent on the run` (duplicate?)
3. `does not accept a failure-notice intent from the browser peer protocol`

Likely test order dependency or timing issue in the plugin, not related to desktop notifications work.

## Environment Constraints

### WSL Limitations
- No Electron installed in WSL
- No Windows toast verification possible
- Need real Windows machine for testing

### Service Architecture
- `pi-web-sessiond.service`: No autoreload, no auto-restart
- `pi-web-ui-dev.service`: Autoreload mode
- Windows not supported for service management

## Next Steps Analysis

### Baseline Verification
- Need to confirm if terminal plugin failures are pre-existing
- Should run tests twice for consistency
- Document results for handoff

### Windows Testing
- Need Windows machine with Node.js 22.19.0+
- Install Electron dependencies
- Test notification flow end-to-end

### Packaging Options
- electron-builder: Most common, supports NSIS installer
- electron-packager: Simpler, creates directory
- electron-forge: More comprehensive, but complex

### Documentation Location
- Per repo rules: platform/installation detail belongs in `docs/`
- `docs/install.html` is canonical install page
- Not root README

## Questions to Resolve
1. Which packaging tool to use?
2. Should we add auto-update capability?
3. How to handle notification permission on first run?
4. Should we add deep-linking for notifications?
5. How to handle remote machine session labels?