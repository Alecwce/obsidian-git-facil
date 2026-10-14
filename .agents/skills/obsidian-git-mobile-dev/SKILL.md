---
name: obsidian-git-mobile-dev
description: Comprehensive architectural guide and checklist for developing, debugging, auditing, and reviewing Obsidian plugins with mobile (Android/iOS) compatibility and Git synchronization. Use whenever developing or modifying Obsidian plugins, implementing dual-engine git operations (isomorphic-git on mobile + native git on desktop), resolving mobile merge/checkout conflicts, auditing code against official Obsidian review guidelines (app.vault.configDir, popout windows, unhandled promises, node built-in guards), or preventing desync between mobile and desktop devices.
---

# Obsidian Git & Mobile Plugin Development Guide

This skill provides the architectural blueprints, coding standards, and safety checklists for developing robust Obsidian plugins that support both Desktop (Windows, macOS, Linux) and Mobile (Android, iOS) environments, with dual-engine Git synchronization.

---

## 1. Official Obsidian Review Guidelines & Code Safety

When developing Obsidian plugins for submission or updates to the official Community Plugins directory, adhere strictly to these rules:

### A. Dynamic Config Directory (`app.vault.configDir`)
- **NEVER hardcode `.obsidian`**. Users can customize their configuration folder (e.g., `.obsidian-mobile`).
- **Always use**: `this.app.vault.configDir` or pass `app.vault.configDir` into helper functions.
```ts
// ❌ WRONG
if (filepath.startsWith(".obsidian/")) { ... }

// ✅ CORRECT
const cfgDir = this.app.vault.configDir;
if (filepath.startsWith(`${cfgDir}/`)) { ... }
```

### B. Popout Window Compatibility (`window` vs `globalThis`)
- **NEVER use `globalThis`** for window-level objects or event listeners. Obsidian supports multi-window popouts where each window has its own `window` object.
- **Always use**: `window` or `activeWindow` from obsidian.
```ts
// ❌ WRONG
globalThis.setTimeout(() => { ... }, 1000);

// ✅ CORRECT
window.setTimeout(() => { ... }, 1000);
```

### C. No Unconditional Node.js Imports on Mobile
- Node.js built-ins (`child_process`, `fs`, `util`, `buffer`) **do not exist on Android and iOS**.
- **For desktop-only code**: Guard with `Platform.isDesktop` and load via dynamic `import()` or `window.require`.
- **For `Buffer`**: Use web-safe polyfills (e.g. `import { Buffer } from "buffer/";`) or `btoa` / `Uint8Array`.
```ts
// ❌ WRONG
import { execFile } from "node:child_process";

// ✅ CORRECT
if (!Platform.isDesktop) {
    throw new Error("Desktop only operation");
}
const electronRequire = (window as unknown as { require?: (mod: string) => unknown }).require;
const cp = electronRequire ? electronRequire("child_process") : await import("node:child_process");
```

### D. Unhandled Promises (`await` or `void`)
- Every Promise must be awaited, chained with `.catch()`, or explicitly marked with `void`.
```ts
// ❌ WRONG
this.refreshGitStatus();

// ✅ CORRECT
void this.refreshGitStatus();
```

### E. Safe Teardown & Registration
- Always register intervals, DOM events, and vault events through Obsidian's lifecycle methods so they are auto-cleaned when the plugin unloads:
  - `this.registerInterval(window.setInterval(...))`
  - `this.registerEvent(this.app.vault.on(...))`
  - `this.registerDomEvent(...)`

---

## 2. Dual-Engine Git Architecture

To achieve frictionless Git backups across all devices without requiring external terminals:

```
┌────────────────────────────────────────────────────────┐
│                   GitFacil Plugin                      │
└───────────────────────────────────┬────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌─────────────────────────┐                       ┌─────────────────────────┐
│     Desktop Engine      │                       │      Mobile Engine      │
│  (Windows, Mac, Linux)  │                       │      (Android, iOS)     │
├─────────────────────────┤                       ├─────────────────────────┤
│ • Native Git binary     │                       │ • Pure JS isomorphic-git│
│ • Child_process exec    │                       │ • Obsidian vault.adapter│
│ • High speed, full repo │                       │ • Obsidian requestUrl   │
│ • Credential helpers    │                       │ • Zero Termux / Node    │
└─────────────────────────┘                       └─────────────────────────┘
```

### A. HTTP Basic Authentication (`x-access-token:<pat>`)
Git Smart HTTP endpoints and GitHub reject raw `Authorization: Bearer <token>` in git clone/fetch/push requests.
- **Universal standard for both engines**: HTTP Basic Auth with username `x-access-token` and password `<PAT>`.
- In desktop Git: `["-c", `http.extraHeader=AUTHORIZATION: Basic ${btoa("x-access-token:" + token)}`]`
- In mobile `isomorphic-git`:
```ts
function getAuthCallback(token?: string) {
    return () => {
        if (!token?.trim()) return undefined;
        const clean = token.trim();
        const creds = btoa(`x-access-token:${clean}`);
        return {
            username: "x-access-token",
            password: clean,
            headers: { Authorization: `Basic ${creds}` },
        };
    };
}
```

### B. Mobile File System Adapter (`vault.adapter`)
Map `isomorphic-git`'s required Node-like `fs` interface to Obsidian's mobile `vault.adapter`:
- `readFile`, `writeFile`, `mkdir`, `rmdir`, `stat`, `unlink`, `readdir`.
- Convert between string UTF-8 and `Uint8Array` / `Buffer`.
- Paths must always be normalized (forward slashes, stripped leading/trailing slashes).

---

## 3. Resolving Mobile Sync & Conflict Scenarios

When syncing between desktop and mobile, conflicts commonly occur in configuration and auto-generated files.

### A. Smart Merge Driver (`smartMergeDriver`)
Provide a custom merge driver to `git.merge` in `isomorphic-git`:
```ts
export const smartMergeDriver = async ({ contents, path }: { contents: string[]; path: string }) => {
    const [_base, _ours, theirs] = contents;
    const normalized = path.replace(/\\/g, "/");

    // 1. Internal Obsidian & Git configs: remote version wins cleanly
    if (
        normalized === ".gitignore" ||
        normalized === ".stignore" ||
        normalized.startsWith(".obsidian/") ||
        normalized.startsWith(".obsidian\\")
    ) {
        return { cleanMerge: true, mergedText: theirs };
    }

    // 2. User Markdown notes: combine non-conflicting sections
    if (_ours && theirs && _ours !== theirs) {
        const combined = `${_ours.trim()}\n\n---\n<!-- 🔄 Sincronizado desde otro dispositivo -->\n${theirs.trim()}\n`;
        return { cleanMerge: true, mergedText: combined };
    }

    return { cleanMerge: true, mergedText: theirs || _ours };
};
```

### B. Forced Checkout Overwrite on Pull/Clone
Initial clone or pull on mobile often encounters `CheckoutConflictError` because Obsidian creates baseline config files (`app.json`, `plugins/`, etc.) before git finishes:
- Always call `git.checkout({ fs, dir: "", ref: current, force: true })` to align the working directory cleanly.

### C. Graceful Offline Detection (`isNetworkOrOfflineError`)
Never alarm the user with red error popups when there is no Wi-Fi or mobile data:
```ts
export function isNetworkOrOfflineError(msg: string): boolean {
    const m = msg.toLowerCase();
    return (
        m.includes("could not resolve host") ||
        m.includes("failed to connect") ||
        m.includes("network is unreachable") ||
        m.includes("enotfound") ||
        m.includes("err_internet_disconnected") ||
        m.includes("failed to fetch") ||
        m.includes("connection timed out") ||
        m.includes("timed out") ||
        m.includes("getaddrinfo") ||
        m.includes("socket hang up") ||
        m.includes("econnrefused") ||
        m.includes("econnreset")
    );
}
```
- When offline: commit locally in git history, show a reassuring notice (*"Saved locally; will sync once connected"*), and defer the push until online.

---

## 4. UI/UX Best Practices for Settings

- **Mask Secrets**: Use `inputEl.type = "password"` for GitHub tokens and add an extra button (`eye` / `eye-off`) to toggle visibility.
- **1-Click Generation Links**: Provide direct links prefilled with required scopes:
  `https://github.com/settings/tokens/new?description=Obsidian+GitFacil&scopes=repo`
- **Instant Connection Test**: Test credentials via `requestUrl` to `https://api.github.com/user` and display the authenticated `@username`.
