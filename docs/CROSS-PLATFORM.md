# Cross-Platform Audit: macOS, Windows, Linux

This document summarizes how well the Nightshift codebase works on **macOS**, **Linux**, and **Windows** based on a full codebase review.

---

## Summary

| Area | macOS | Linux | Windows |
|------|--------|--------|--------|
| **Core (config, paths, run)** | ✅ | ✅ | ⚠️ Partial |
| **Bootstrap / install (opencode, uv, ripgrep)** | ✅ | ✅ | ❌ Not supported |
| **Sandbox** | ✅ (sandbox-exec) | ✅ (bwrap) | N/A (disabled) |
| **TUI (clipboard, etc.)** | ✅ | ✅ | ✅ |
| **PATH handling** | ✅ | ✅ | ❌ Wrong separator |
| **Tests** | ✅ | ✅ | ✅ (after path fixes) |

**Verdict:** The app is **fully supported on macOS and Linux**. On **Windows** it can run (config, CLI, TUI) but **bootstrap/install and run** assume Unix binaries and PATH, so native Windows is not fully supported unless used with WSL.

---

## 1. Platform detection

**Location:** `src/index.ts` – `detectPlatform()`

```ts
function detectPlatform(): Platform {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  return { os, arch };
}
```

- **macOS:** `os: "darwin"` ✅  
- **Linux:** `os: "linux"` ✅  
- **Windows:** `os: "linux"` (win32 is mapped to linux)

So on Windows, all download URLs are for **Linux** (opencode, uv, ripgrep). Native Windows binaries are not used. That matches a WSL-oriented design; native Windows would need a `win32` branch and Windows-specific URLs.

---

## 2. Paths and config

- **Config paths:** Use `path.join()` and `homedir()`. On Windows this yields `C:\Users\...\.config\nightshift\...` – correct.
- **expandHome(~):** Uses `homedir()` – works on all platforms.
- **XDG / UV env:** Implementations use `posixPath()` so values use forward slashes. Safe for WSL and for tools that accept POSIX-style paths; no Windows-specific handling.

---

## 3. PATH construction

**Locations:** `buildPath()`, `run()`, `bootstrap-prompt.ts`

```ts
const PATH = `${pathParts.join(":")}:${process.env.PATH ?? ""}`;
```

- **macOS / Linux:** `:` is correct.
- **Windows:** `process.env.PATH` uses `;`. Joining with `:` produces a mix of `:` and `;`, so the constructed PATH is wrong for native Windows processes.  
**Fix for Windows:** use `path.delimiter` (e.g. `pathParts.join(path.delimiter)`) when building PATH.

---

## 4. Bootstrap / install (download + extract + symlinks)

- **download():** Uses `curl`. Often available on Windows (e.g. Git for Windows, Windows 10+); not guaranteed.
- **extract():** Uses `unzip` and `tar`. On Windows, `tar` exists on recent Windows 10; `unzip` is often missing. So extraction can fail on native Windows.
- **installTool() / installToolForEval():**
  - `chmodSync(0o755)` – on Windows usually a no-op; generally safe.
  - `symlinkSync(relTarget, linkPath)` – on Windows often requires elevated rights or Developer Mode; can throw.
- **Binary choice:** opencode, uv, ripgrep URLs are darwin/linux only. On Windows we currently fetch Linux builds, which do not run natively.

So bootstrap/install is **not** reliable on native Windows; it is built for macOS/Linux (and WSL if you run the app there).

---

## 5. Sandbox

**Location:** `src/sandbox.ts`, `checkSandboxAvailability()` in `src/index.ts`

- **macOS:** sandbox-exec ✅  
- **Linux:** bwrap ✅  
- **Windows:** Explicitly unsupported (“Sandbox not supported on this platform”). No incorrect behavior; sandbox is simply disabled.

---

## 6. TUI and clipboard

**Location:** `src/cli/cmd/tui/tui/util/clipboard.ts`

- **darwin:** osascript, wl-copy / xclip / xsel where applicable.
- **linux:** wl-copy, xclip, xsel.
- **win32:** PowerShell for image and text clipboard. WSL is detected (`release().includes("WSL")`).

Clipboard is implemented for all three platforms.

---

## 7. Other platform-specific code

- **getGpuName():** Branches for darwin and linux only; on Windows returns `null` (no crash).
- **Upgrade flow:** Uses `~/.nightshift/bin/nightshift`, curl, unzip/tar, `chmodSync`. Same as bootstrap: fine on macOS/Linux, brittle on Windows.
- **Bird banner:** Uses `detectPlatform()`; on Windows shows “linux” as OS name (consistent with current mapping).

---

## 8. What works on Windows today

- Running the Nightshift CLI binary (when built for Windows, e.g. `script/build.ts`).
- Config file resolution and `expandHome`.
- TUI and clipboard (PowerShell path).
- Tests (with the recent path/POSIX fixes).
- Sandbox correctly reported as unavailable (no sandbox on Windows).

---

## 9. What does not work on native Windows

- **Bootstrap / install:** Relies on Linux binaries, Unix PATH, and often missing or restricted curl/tar/unzip/symlinks.
- **run:** Expects `opencode` (and tools) in prefix; those are Linux builds when running on Windows.
- **PATH:** Built with `:` instead of `;`, so child processes on Windows get an incorrect PATH.

---

## 10. Recommendations for full Windows support

1. **Platform type:** Extend `Platform` and `detectPlatform()` to include `win32` and use it in URL selection.
2. **Download URLs:** Add Windows variants for opencode, uv, ripgrep (if available) and select by `process.platform === "win32"`.
3. **PATH:** Build PATH with `path.delimiter` so Windows gets `;` and Unix gets `:`.
4. **Extract:** On Windows, prefer a JS-based extractor (e.g. `yauzl` / `tar-stream`) or detect `tar`/unzip and fall back to a Windows-friendly method.
5. **Symlinks:** On Windows, consider copying the binary (or using a .bat/.cmd shim) instead of symlinks when symlink creation fails or is not allowed.
6. **Binary names:** Use `opencode.exe` etc. when on Windows if the installed binaries have `.exe`.

---

*Generated from a full codebase review. Last audit: path normalization and test fixes for Windows test runs.*
