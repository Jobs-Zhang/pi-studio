---
"@pi-studio/pi-studio": patch
---

Add opt-in desktop notifications for work that needs you: an agent waiting on an `ask_user` answer or an extension dialog, a finished run, a failed run, and a registered machine that stopped responding. Enable them from the action palette, where the same switch works in a browser and in the bundled Electron shell, and they still reach you while the window is hidden to the tray or unfocused. The Windows desktop build ships as an installer, because Windows only shows notifications for installed apps. The question and dialog events are now also mirrored on the per-machine realtime stream with their session id, so a cross-session consumer no longer has to subscribe to every session socket.
