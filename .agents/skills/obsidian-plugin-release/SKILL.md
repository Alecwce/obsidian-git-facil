---
name: obsidian-plugin-release
description: Comprehensive step-by-step procedure for building, testing, verifying, releasing to GitHub, and publishing updates to the official Obsidian Community Plugins directory. Use whenever preparing a new release of an Obsidian plugin, bumping versions, validating submission criteria (manifest.json, package.json, release assets), running submission-check scripts, publishing GitHub releases via gh CLI, updating plugins in obsidianmd/obsidian-releases, or hot-reloading plugin builds into a local testing vault.
---

# Obsidian Plugin Release & Community Store Publishing Guide

This skill documents the end-to-end lifecycle for validating, releasing, deploying, and publishing updates for Obsidian plugins to GitHub and the official Obsidian Community Plugins directory.

---

## 1. The Obsidian Community Store Lifecycle

Understanding how the Community Store works prevents common deployment mistakes:

```
┌────────────────────────────────────────────────────────┐
│  1. Local Development & Verification                   │
│     • pnpm biome check .                               │
│     • pnpm run typecheck                               │
│     • pnpm test                                        │
│     • pnpm run build (production esbuild)              │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│  2. Local Vault Testing & Hot Reload                   │
│     • node scripts/deploy.mjs <vault-path>             │
│     • obsidian plugin:reload id=<plugin-id>            │
│     • obsidian dev:errors                              │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│  3. GitHub Tag & Release Publication                   │
│     • git commit & push to origin/main                 │
│     • gh release create <version> main.js manifest.json│
│     • pnpm run validate:submission                     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  4. Community Store Update Delivery                    │
│                                                        │
│  A. Automatic User Updates (Existing Plugins):         │
│     Obsidian fetches GitHub Releases directly. Once a  │
│     valid release is published with matching semver,   │
│     all users receive the update automatically!        │
│                                                        │
│  B. Metadata / Description / New Plugin Submissions:   │
│     Submit a Pull Request to obsidianmd/obsidian-      │
│     releases editing community-plugins.json.           │
└────────────────────────────────────────────────────────┘
```

---

## 2. Pre-Flight Verification Checklist

Before bumping any versions or publishing releases, execute these quality gates in sequence:

```bash
# 1. Formatting and linting
pnpm biome check .

# 2. Strict TypeScript type check
pnpm run typecheck

# 3. Unit and integration tests
pnpm test
```

All 3 gates must pass with 0 errors and 0 warnings.

---

## 3. Version Bump Synchronization

Obsidian community scanners and submission checks enforce exact version consistency across files:

1. **`package.json`**:
   `"version": "1.8.x"`
2. **`manifest.json`**:
   `"version": "1.8.x"`
   - Version must strictly be `x.y.z` (semver without `v` prefix).
   - Ensure `"minAppVersion"` matches required Obsidian APIs (e.g. `1.13.0` for modern setting tab definitions).
3. **Build bundle**:
   Run production esbuild to regenerate `main.js`:
   ```bash
   pnpm run build
   ```

---

## 4. Local Vault Deployment & Hot-Reload

Always verify the compiled bundle in the live Obsidian application before publishing:

```bash
# 1. Deploy compiled files to the local testing vault
node scripts/deploy.mjs /home/alexwce/Documentos/Obsidian/ryukami-labs

# 2. Hot-reload the plugin in the running Obsidian desktop instance
obsidian plugin:reload id=git-facil

# 3. Check for any runtime exceptions in Obsidian console
obsidian dev:errors

# 4. Verify registered commands and version in live Obsidian
obsidian eval code="app.plugins.plugins['git-facil']?.manifest.version"
```

---

## 5. GitHub Release & Asset Publishing

Obsidian's community plugin scanner downloads individual binary assets from GitHub Releases.

### Step A: Commit and Push Source Code
```bash
git add -A
git commit -m "feat(scope): descriptive summary (v1.8.x)"
git push origin main
```

### Step B: Create GitHub Release with Standalone Assets
The release tag **must exactly match** `manifest.json.version` (e.g. `1.8.13`, without `v`).
Attach `main.js`, `manifest.json`, and `styles.css` as individual uncompressed root assets:

```bash
gh release create 1.8.13 main.js manifest.json styles.css \
  --title "GitFacil 1.8.13" \
  --notes "### What's New in v1.8.13 🚀
- Feature 1...
- Feature 2...
- Bug fixes..."
```

### Step C: Run Automated Submission Validation
Run the validator script to guarantee compliance with Obsidian's review bot:
```bash
pnpm run validate:submission
```
Expect output: `✅ Submission check OK: listo para community.obsidian.md`.

---

## 6. Official Community Store: Publishing & Updating

### Case A: Existing Published Plugin (Updates)
If your plugin is already published on `https://community.obsidian.md/plugins/<plugin-id>`:
- **No Pull Request is required for code updates!**
- Obsidian's servers periodically poll your GitHub repository's releases. When a new release tag is detected with valid `manifest.json` and `main.js`, Obsidian marks the new version available for all users.
- Within a few hours (or immediately upon manual update check), users can update directly inside Obsidian.

### Case B: Updating Metadata (Description, Name, Funding)
If you want to update the store listing description, display name, or add a donation link:
1. Fork `https://github.com/obsidianmd/obsidian-releases`.
2. Edit `community-plugins.json`.
3. Locate your plugin entry:
   ```json
   {
     "id": "git-facil",
     "name": "GitFacil",
     "author": "Alexwce",
     "description": "One-click commit & push for your vault...",
     "repo": "Alecwce/obsidian-git-facil"
   }
   ```
4. Update the fields (ensure no words like "Obsidian" or emoji in `name`).
5. Submit a Pull Request.

---

## 7. Submission Checklist Summary Table

| Requirement | Rule | Verification Command |
| :--- | :--- | :--- |
| **Manifest ID** | Lowercase letters, digits, hyphens only | `cat manifest.json \| grep id` |
| **Version Match** | `package.json` version === `manifest.json` version | `node -e "assert.equal(require('./package').version, require('./manifest').version)"` |
| **Assets in Release** | Individual `main.js`, `manifest.json`, `styles.css` | `gh release view <version> --json assets` |
| **Tag Format** | Exact semver `x.y.z` (no `v` prefix) | `git tag -l` |
| **No Node on Mobile** | Mobile paths have zero `child_process` / `node:*` | Biome & Vitest integration tests |
| **Dynamic Config** | Uses `app.vault.configDir` | `grep -rn "configDir" .` |
