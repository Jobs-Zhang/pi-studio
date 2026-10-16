---
"@pi-studio/pi-studio": major
---

Rename PI WEB to PI STUDIO end to end, and add localized interface text.

The package is now `@pi-studio/pi-studio`, with `pi-studio`, `pi-studio-server`, and `pi-studio-sessiond` executables, `PI_STUDIO_*` environment variables, `~/.pi-studio` data and `~/.config/pi-studio` config locations, `.pi-studio` project configuration, `pi-studio-plugins/` module paths, `com.pi-studio.*` service labels, and `dev.pi.studio` Android application id. No compatibility aliases are kept: existing installations must migrate their data directory, config path, and service definitions before starting the renamed build.

Interface text is now localized. English stays the source catalog, with a new Simplified Chinese catalog, and the browser picks the language from the device language unless a device-local preference pins `en` or `zh-CN` in Settings, next to the theme. The shared runtime adds `t()` with `Intl`-based plural selection, locale-aware date and number formatting, and a `document.lang` tag. Browser plugins receive a new `context.i18n` service with `locale`, `t()`, and `registerCatalog()`, so a plugin's own strings resolve from its catalog under a host-owned namespace instead of leaking into host messages. Message keys are type-checked, so a missing or renamed key fails the build.
