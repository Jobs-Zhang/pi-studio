"use strict";

/**
 * PI Studio — optimized for fast startup.
 *
 * The startup page can reach a gateway either directly over HTTP(S) or through
 * a local SSH tunnel owned by this process (see tunnel.cjs). Recent connections
 * live in ~/.pi-studio-desktop/config.json; remembered SSH passwords are encrypted
 * with Electron safeStorage and never exposed to the renderer.
 */

// Askpass bootstrap: when ssh asks for a password it runs this executable with
// PI_STUDIO_ASKPASS=1. Print the password and exit before Electron starts. The
// write is synchronous so the output cannot be lost to process.exit().
if (process.env.PI_STUDIO_ASKPASS === "1") {
  try {
    require("node:fs").writeSync(1, `${process.env.PI_STUDIO_TUNNEL_PASSWORD ?? ""}\n`);
  } catch {}
  process.exit(0);
}

const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, dialog, safeStorage } = require("electron");
const { normalizeConfig, recordConnectionEntry, publicEntry } = require("./history.cjs");
const { loadSshConfigBlocks, listSshConfigAliases, expandHome } = require("./sshConfig.cjs");
const { createTunnel, detectSshClient } = require("./tunnel.cjs");

// Windows picks a native frame out of a multi-size ico for the taskbar, its
// context menus and the tray; a single 512px bitmap only gets rescaled there.
const ICON_ICO_PATH = path.join(__dirname, "icon.ico");
const ICON_PNG_PATH = path.join(__dirname, "icon.png");
const ICON_PATH = process.platform === "win32" && fs.existsSync(ICON_ICO_PATH) ? ICON_ICO_PATH : ICON_PNG_PATH;
const CONFIG_DIR = path.join(require("node:os").homedir(), ".pi-studio-desktop");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const SSH_CONFIG_FILE = path.join(require("node:os").homedir(), ".ssh", "config");

// Pre-load icon (small file, synchronous is fine)
let appIcon;
try {
  appIcon = nativeImage.createFromPath(ICON_PATH);
  if (appIcon.isEmpty()) appIcon = null;
} catch { appIcon = null; }

function targetUrl() {
  const flag = process.argv.find((a) => a.startsWith("--url="));
  if (flag) { const v = flag.slice(6); if (v) return v; }
  const fromEnv = process.env.PI_STUDIO_DESKTOP_URL;
  if (fromEnv) return fromEnv;
  return "";
}

// ---------------------------------------------------------------------------
// Config and recent connections
// ---------------------------------------------------------------------------

function ensureConfigDir() {
  try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch {}
}

function loadConfig() {
  let raw = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {}
  return normalizeConfig(raw);
}

function saveConfig(config) {
  try {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {}
}

/** Moves the entry to the front of the history; the stored entry owns the encrypted password. */
function recordConnection(entry) {
  const config = loadConfig();
  config.recentConnections = recordConnectionEntry(config.recentConnections, entry);
  saveConfig(config);
  refreshTray();
}

function publicHistory() {
  return loadConfig().recentConnections.map(publicEntry);
}

function encryptPassword(password) {
  try {
    if (!isPasswordStorageAvailable()) return undefined;
    return safeStorage.encryptString(password).toString("base64");
  } catch {
    return undefined;
  }
}

/** Passwords are only persisted through safeStorage; never fall back to plaintext. */
function isPasswordStorageAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function decryptPassword(stored) {
  try {
    return safeStorage.decryptString(Buffer.from(stored, "base64"));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Connection orchestration
// ---------------------------------------------------------------------------

function normalizeDirectUrl(input) {
  const url = input.trim();
  if (url === "") return undefined;
  return url.startsWith("http://") || url.startsWith("https://") ? url : `http://${url}`;
}

/** Parses the gateway URL as reachable from the SSH host into the -L target. */
function parseTunnelTarget(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  const port = parsed.port === "" ? (parsed.protocol === "https:" ? 443 : 80) : Number(parsed.port);
  return { host: parsed.hostname, port };
}

/** The URL the window opens once the tunnel is up: the gateway seen through 127.0.0.1. */
function tunnelDisplayUrl(targetUrl, localPort) {
  const parsed = new URL(targetUrl);
  parsed.hostname = "127.0.0.1";
  parsed.port = String(localPort);
  return parsed.toString();
}

/** Single active tunnel: the connect page opens one gateway at a time. */
let activeTunnel;
let activeDial;
let reconnecting = false;
let reconnectFailures = 0;

async function replaceActiveTunnel(spec, target) {
  const previous = activeTunnel;
  activeTunnel = undefined;
  if (previous !== undefined) await previous.close();
  const tunnel = await createTunnel(spec, target);
  activeTunnel = tunnel;
  activeDial = { spec, target, localPort: tunnel.localPort };
  reconnectFailures = 0;
  return tunnel;
}

async function closeActiveTunnel() {
  const tunnel = activeTunnel;
  activeTunnel = undefined;
  activeDial = undefined;
  if (tunnel !== undefined) await tunnel.close();
}

async function probeGateway(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入不含凭据和查询参数的 HTTP(S) 网关地址');
  const probe = new URL(`${url.pathname.replace(/\/$/, '')}/api/pi-studio/status`, url.origin);
  const response = await fetch(probe, { signal: AbortSignal.timeout(6000), redirect: 'manual' });
  if (![200, 401, 403].includes(response.status)) throw new Error(`网关返回 HTTP ${response.status}`);
  if (response.status === 200) {
    const body = await response.json();
    if (!body?.components?.web) throw new Error('该地址不是可识别的 Pi 工作台网关');
  }
}

async function connectDirect(entry) {
  const url = normalizeDirectUrl(entry.url);
  if (url === undefined) return { ok: false, error: "请输入 PI STUDIO 网关地址" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "网关地址无效，请填写 http(s)://host:port" };
  }
  if (parsed.hostname === "") return { ok: false, error: "网关地址无效，请填写 http(s)://host:port" };
  try {
    await probeGateway(url);
  } catch (error) {
    return { ok: false, error: `无法连接网关：${error.message}` };
  }
  await closeActiveTunnel();
  recordConnection({ type: "direct", url });
  return { ok: true, url };
}

async function connectSsh(entry, password, options = {}) {
  const host = typeof entry.host === "string" ? entry.host.trim() : "";
  if (host === "") return { ok: false, error: "请输入 SSH 主机" };
  const target = parseTunnelTarget(entry.targetUrl);
  if (target === undefined) return { ok: false, error: "远程网关地址无效，请填写 http(s)://host:port" };
  if (password !== undefined && password !== "" && process.platform === "win32" && !app.isPackaged) {
    // Unpackaged electron.exe cannot serve as the askpass program; fail closed
    // with an actionable message instead of a cryptic auth error.
    return { ok: false, error: "开发模式（未打包）暂不支持密码认证，请使用密钥认证或打包后的应用" };
  }

  // Config-driven connections pass the alias (or user@host) straight to ssh so
  // ~/.ssh/config keeps full authority over port, user and authentication.
  const split = splitUserHost(host);
  const spec = entry.via === "config"
    ? { host }
    : {
        host: split.host,
        ...(split.user === undefined ? {} : { user: split.user }),
        ...(entry.user !== undefined && entry.user !== "" ? { user: entry.user } : {}),
        ...(entry.port !== undefined ? { port: entry.port } : {}),
        ...(entry.identityFile !== undefined && entry.identityFile !== "" ? { identityFile: expandHome(entry.identityFile) } : {}),
        ...(password !== undefined && password !== "" ? { password } : {}),
      };

  let tunnel;
  try {
    tunnel = await replaceActiveTunnel(spec, { host: target.host, port: target.port });
  } catch (error) {
    return { ok: false, error: `SSH 隧道建立失败：${error instanceof Error ? error.message : String(error)}` };
  }

  try {
    await probeGateway(tunnelDisplayUrl(entry.targetUrl.trim(), tunnel.localPort));
  } catch (error) {
    await closeActiveTunnel();
    return { ok: false, error: `SSH 已连接，但网关不可用：${error.message}` };
  }
  if (password && entry.rememberPassword === true && !isPasswordStorageAvailable()) {
    await closeActiveTunnel();
    return { ok: false, error: '系统安全存储不可用，请取消安全保存密码后重试' };
  }

  // Secret handling: a fresh password persists only on request (and only
  // encrypted); reconnecting from history keeps the already-stored secret.
  const freshPassword = password !== undefined && password !== "";
  const rememberRequested = freshPassword && entry.rememberPassword === true;
  const encrypted = rememberRequested ? encryptPassword(password) : undefined;
  const storedPassword = options.preserveSecret === true
    ? (typeof entry.password === "string" && entry.password !== "" ? entry.password : undefined)
    : (freshPassword ? encrypted : undefined);
  recordConnection({
    type: "ssh",
    via: entry.via === "config" ? "config" : "manual",
    host: spec.host,
    ...(spec.port === undefined ? {} : { port: spec.port }),
    ...(spec.user === undefined ? {} : { user: spec.user }),
    ...(entry.identityFile === undefined || entry.identityFile === "" ? {} : { identityFile: entry.identityFile }),
    ...(storedPassword === undefined ? {} : { password: storedPassword }),
    targetUrl: entry.targetUrl.trim(),
  });
  return {
    ok: true,
    url: tunnelDisplayUrl(entry.targetUrl.trim(), tunnel.localPort),
    passwordSaved: rememberRequested && encrypted !== undefined,
    passwordSaveSkipped: rememberRequested && encrypted === undefined,
  };
}

async function connectRecent(index) {
  const entry = loadConfig().recentConnections[index];
  if (entry === undefined) return { ok: false, error: "连接不存在" };
  if (entry.type === "direct") return connectDirect(entry);
  // Config-driven entries authenticate through ssh config/agent and never ask
  // for a password; manual entries fall back to the form when no secret is stored.
  if (entry.via === "config") return connectSsh(entry, undefined, { preserveSecret: true });
  const password = entry.password === undefined ? undefined : decryptPassword(entry.password);
  if (entry.password !== undefined && password === undefined) return { ok: false, needsPassword: true, error: "保存的密码无法解密，请重新输入" };
  if (password === undefined && (entry.identityFile === undefined || entry.identityFile === "")) return { ok: false, needsPassword: true };
  return connectSsh(entry, password, { preserveSecret: true });
}

/** `user@host` splits into -l user + host so ssh config matching still works. */
function splitUserHost(host) {
  const at = host.lastIndexOf("@");
  return at === -1 ? { host } : { host: host.slice(at + 1), user: host.slice(0, at) };
}

// ---------------------------------------------------------------------------
// SSH environment detection
// ---------------------------------------------------------------------------

async function detectEnvironment() {
  const client = await detectSshClient();
  let hosts = [];
  try {
    hosts = listSshConfigAliases(await loadSshConfigBlocks(SSH_CONFIG_FILE));
  } catch {}
  return { platform: process.platform, client, hosts };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle("show-window", () => {
  showWindow();
});

ipcMain.handle("get-history", () => ({
  history: publicHistory(),
  lastMode: loadConfig().lastMode,
  passwordStorageAvailable: isPasswordStorageAvailable(),
}));
ipcMain.handle("save-mode", (_e, mode) => {
  const config = loadConfig();
  config.lastMode = mode === "ssh" ? "ssh" : "direct";
  saveConfig(config);
  return config.lastMode;
});
ipcMain.handle("connect", (_e, payload) => {
  if (payload?.type === "direct") return connectDirect(payload);
  if (payload?.type === "ssh") return connectSsh(payload, typeof payload.password === "string" ? payload.password : undefined);
  return Promise.resolve({ ok: false, error: "未知的连接类型" });
});
ipcMain.handle("connect-recent", (_e, index) => connectRecent(index));
ipcMain.handle("delete-connection", (_e, index) => {
  const config = loadConfig();
  config.recentConnections.splice(index, 1);
  saveConfig(config);
  refreshTray();
  return publicHistory();
});
ipcMain.handle("clear-history", () => {
  const config = loadConfig();
  config.recentConnections = [];
  saveConfig(config);
  refreshTray();
  return [];
});
ipcMain.handle("ssh-detect", () => detectEnvironment());
ipcMain.handle('detect-local', async () => {
  const url = 'http://127.0.0.1:8504';
  try { await probeGateway(url); return { ok: true, url }; }
  catch { return { ok: false }; }
});

// ---------------------------------------------------------------------------
// Window and tray
// ---------------------------------------------------------------------------

let mainWindow;
let tray;

// 同一端口恢复隧道，已加载页面的 WebSocket 自身负责恢复订阅。
const tunnelWatchdog = setInterval(async () => {
  if (!activeDial || activeTunnel?.alive || reconnecting || !mainWindow) return;
  reconnecting = true;
  const dial = activeDial;
  try {
    const tunnel = await createTunnel(dial.spec, dial.target, { localPort: dial.localPort });
    if (activeDial !== dial) { await tunnel.close(); return; }
    activeTunnel = tunnel;
    reconnectFailures = 0;
  } catch (error) {
    console.error('SSH 自动重连失败', error.message);
    if (activeDial === dial && ++reconnectFailures >= 3) {
      await closeActiveTunnel();
      mainWindow?.loadFile(path.join(__dirname, 'connect.html'), { query: { manual: '1' } });
    }
  } finally { reconnecting = false; }
}, 10000);
tunnelWatchdog.unref();

// History writes refresh the tray menu so its recent list stays current.
function refreshTray() {
  if (tray !== undefined && tray !== null) tray.setContextMenu(buildTrayMenu());
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    title: "PI Studio",
    backgroundColor: "#fafbfc",
    show: false, // Show when ready for smoother startup
    icon: appIcon || undefined,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 || win.isDestroyed()) return;
    console.error('Pi 工作台页面加载失败', code, description);
    win.loadFile(path.join(__dirname, 'connect.html'), { query: { manual: '1' } });
  });
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });

  // Show when ready for smoother appearance
  win.once("ready-to-show", () => { win.show(); });

  if (url) win.loadURL(url);
  else win.loadFile(path.join(__dirname, "connect.html"));

  return win;
}

function showWindow() {
  if (!mainWindow) { mainWindow = createWindow(targetUrl()); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (mainWindow?.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
  else showWindow();
}

async function openRecentFromTray(index) {
  const result = await connectRecent(index);
  if (result.ok) {
    if (mainWindow) mainWindow.loadURL(result.url);
    else mainWindow = createWindow(result.url);
    return;
  }
  showWindow();
  dialog.showErrorBox("PI Studio", result.error ?? "连接失败");
}

function buildTrayMenu() {
  const history = publicHistory().slice(0, 5);
  const items = [
    { label: "Show Window", click: showWindow },
    { type: "separator" },
  ];

  history.forEach((entry, index) => {
    const label = entry.type === "ssh"
      ? `SSH ${entry.user === undefined ? "" : `${entry.user}@`}${entry.host}:${String(entry.port ?? 22)}`
      : entry.url.replace(/^https?:\/\//, "").substring(0, 35);
    items.push({ label, click: () => { void openRecentFromTray(index); } });
  });
  if (history.length > 0) items.push({ type: "separator" });

  items.push({ label: "Quit", click: () => { app.quit(); } });

  return Menu.buildFromTemplate(items);
}

function createTray() {
  if (!appIcon) return null;
  tray = new Tray(appIcon);
  tray.setToolTip("PI Studio");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", toggleWindow);
  return tray;
}

// Windows needs the AppUserModelID before ready, and the NSIS installer writes
// the same ID into the Start Menu shortcut so toast notifications can show.
if (process.platform === "win32") app.setAppUserModelId("dev.pi.studio.desktop");

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(() => {
    mainWindow = createWindow(targetUrl());
    createTray();

    app.on("activate", () => { if (!mainWindow) mainWindow = createWindow(targetUrl()); });
    app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  }).catch((err) => {
    console.error("PI Studio failed to start", err);
    app.exit(1);
  });

  // Tear the tunnel down with the app so no orphaned ssh process is left.
  app.on("will-quit", () => { void closeActiveTunnel(); });
}
