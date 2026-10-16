---
"@jmfederico/pi-web": patch
---

Fix the Windows desktop build icons so the installed app, its shortcuts, the taskbar entries and the window/tray icons show the PI Desktop mark instead of Electron's default icon. Executable resource editing stays enabled while code signing is still skipped, and the build now ships a multi-size `icon.ico` that Windows can use at 16–20px instead of rescaling one 512px bitmap.
