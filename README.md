# TI · Token info

A Windows desktop app that shows where your Codex tokens go. TI updates automatically and breaks down local usage by project, conversation and model, alongside the account figures reported by Codex.

**[Download the latest Windows release](https://github.com/toffenloffen/ti/releases/latest)**

TI is an independent project, not an official OpenAI product. It currently reads **Codex data only**. Claude CLI logs are not supported.

## Get started

1. Download `Token-info-1.3.1-win-x64.zip` from Releases.
2. Extract the **entire** archive into a folder you want to keep.
3. Open **Token info.exe**. No separate Node, npm or API key is needed.
4. Optionally run **Create desktop shortcut.vbs** to create a desktop shortcut.

Requires Windows x64. Codex must be installed and signed in to show account data. Local history works offline; account figures require a connection. The executable is unsigned, so Windows may display a warning. Each release includes `SHA256SUMS.txt` for verifying the download.

To upgrade, close the old app and extract the new version into a new folder. Run the new shortcut script to update the shortcut. Your saved folders, language and window settings are retained.

Closing the window exits TI and its Codex connection. Minimize it to keep monitoring. Reopening reads the available history again, including activity recorded while TI was closed. Opening TI a second time focuses the existing window. It does not start automatically with Windows.

## Languages

Choose a language from the selector at the top of the app:

- English
- Norwegian Bokmål
- Swedish
- Danish
- German
- French
- Spanish

On first launch, TI always starts in English, regardless of the system or browser language. Your selection is saved in `%APPDATA%/Token info/language.json` and applies immediately to the dashboard, model details, folder controls and app-provided dialog text. Standard Windows file-picker controls follow Windows settings.

Dates and numbers follow the selected language. **Changing the language does not change the accounting time zone or move usage between days.** Local days use `Europe/Oslo` by default, configurable with `TOKEN_INFO_TIMEZONE`. Project names, conversation titles, model names and exact model IDs are preserved.

## Projects and custom folders

Registered Codex projects appear automatically. Use **Add project folder** to include a folder used with Codex CLI even if it is not registered in the Codex app. Existing and new local Codex logs are grouped by that folder, its subdirectories and associated Git worktrees. Empty projects are shown too.

Selections are stored in `%APPDATA%/Token info/projects.json`. **Manage custom folders → Remove from TI** removes only the selection, leaving your files and logs untouched. History is regrouped under other matching projects or **Recent**.

Explicit Codex project assignments take priority. Otherwise the most specific matching folder wins. A folder registered in both Codex and TI appears once. A deliberate TI selection can group conversations marked as projectless in Codex; unrelated conversations remain under Recent. Subagent usage is grouped with its parent task when the logs provide that relationship, without counting responses twice.

Folder selection is available in the Windows app. The development web server remains read-only. Choosing a folder does not scan its source files for tokens: TI reads Codex usage logs stored on this PC.

## Understanding the figures

- **Tokens today:** recorded input + output in local Codex logs. Cached input is already included in input; reasoning is already included in output. Neither is added a second time.
- **Account total and history:** figures returned by Codex. Daily history may lag behind. Missing days mean “not reported”, not zero. The source does not specify the time zone of account-day buckets. Account history is kept separate from local daily totals.
- **Projects, Recent and models:** local records from this PC. Deleted or moved logs, older activity and other devices may be missing. Projects + Recent sum to the local total.
- **Account limits:** remaining percentages and reset times reported by the account. They are not token balances and are never converted to tokens. Connection failures retain the last values with timestamps. A limit from a local log is marked as historical; expired limits are not presented as current.

Overview percentages use the total local token usage across all recorded days, regardless of search filters. Model cards use the selected conversation or project's total for the displayed period. These shares are not account quotas.

Click a project or conversation to see model totals, uncached input, cached input, output, response counts, time ranges and metadata sources. Task sections show the same usage grouped by main task and subagent; they are not additional usage. Parallel tasks have separate model timelines.

Historical model attribution prioritizes the response's own model field, then historical `turn_context` with the same `turn_id`. A missing match remains unknown. Older records without a turn ID may use previous log context, explicitly marked as less certain. The current model selection never fills gaps in historical data.

## Data, privacy and limitations

TI reads `sessions` and `archived_sessions` under `CODEX_HOME` or `%USERPROFILE%/.codex`, plus local project metadata, conversation titles and the model catalog. It does not modify Codex data. Conversation content is not sent to the renderer or an external service. TI does not read `auth.json` itself; authentication is handled by Codex.

Local files are checked every 10 seconds, account data every minute and the display every 5 seconds. Only changed logs are parsed again. Monitoring does not send model prompts or consume inference tokens, buy credits or reset account allowances.

The local log formats are internal and may change. Modern per-response records are deduplicated by response ID; mirrored cumulative events are ignored. Older logs use differences between cumulative counters and may be less precise around resets and branches. Mixed old/new logging in one file may omit older history. Older counter events cannot provide a reliable response count.

Claude CLI support remains a separate future feature. It requires a dedicated importer, response deduplication and normalization of its different cache-token fields. It is not included simply by selecting a Claude project folder.

## Development

Node 20+ is required for development. Run `node --test` for the test suite. Run `node server.mjs` for the read-only web dashboard at `http://127.0.0.1:43117`; stop with Ctrl+C. The web language preference is stored in the browser and is separate from the desktop setting.

The desktop shell uses Electron 44.3.0 with sandboxing, context isolation and no renderer Node access. `Install-Desktop.ps1` downloads and verifies Electron and creates a shortcut for a source checkout. The desktop app embeds its local data service on an automatically selected loopback port. Window settings are stored in `%APPDATA%/Token info/window.json`.

Account integration starts a local `codex app-server --listen stdio://`, completes initialization and reads `account/rateLimits/read` and `account/usage/read`. See [Codex App Server](https://learn.chatgpt.com/docs/app-server).

Optional environment variables: `CODEX_HOME`, `TOKEN_INFO_CODEX` (path to codex.exe), `TOKEN_INFO_TIMEZONE` and `TOKEN_INFO_PORT` (development web server).

Translations live in `public/translations.js`; `public/i18n.js` provides language resolution, interpolation and formatting. Tests check complete key sets, matching placeholders, English fallback, persistence, date boundaries, HTML escaping and localized detail views.

After building, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-Desktop.ps1` for the isolated Electron UI checks. They exercise all languages, account/error views and persistence, and save test screenshots under `.runtime/locale-qa/`. They do not read your real Codex data.

Build a Windows package with `powershell -NoProfile -ExecutionPolicy Bypass -File Build-Release.ps1`. The build verifies a pinned Electron SHA-256, includes only explicitly selected app files and writes a ZIP and checksum to `dist/`. It never bundles local logs, credentials or QA data. GitHub Actions runs Windows tests and creates a release draft for a matching version tag. `.runtime/` and `dist/` are ignored by Git.
