TI 1.2.0 adds manually selected project folders for local Codex usage.

- Choose **Legg til prosjektmappe** in the Windows app to add a folder used with Codex CLI, without registering it in the Codex app.
- TI remembers your folders, updates usage automatically and lets you remove a folder from TI without deleting files or logs.
- Existing history is regrouped immediately, including associated worktrees and subagents, without double-counting tokens. Explicit Codex assignments take priority; overlapping folders use the most specific match.

**Claude CLI logs are not supported yet.** This release addresses the Codex folder-selection part of [issue #1](https://github.com/toffenloffen/ti/issues/1); Claude import remains a separate future improvement.

Download **Token-info-1.2.0-win-x64.zip**, extract the entire archive, then open **Token info.exe**. When upgrading, close the old app first and extract the new version into a new folder. Run the included shortcut script to point your desktop shortcut at the new version. Saved TI folders and window settings are retained.

Requires Windows x64. Codex must be installed and signed in for account data. No separate Node installation or API key is needed. The executable is unsigned; Windows may show a warning. SHA256SUMS.txt is included. No personal logs or credentials are bundled.

Validation: 22 automated tests plus native Windows folder-selection and restart checks. Local token totals cover this PC and are separate from account quotas. Independent project, not an official OpenAI product.
