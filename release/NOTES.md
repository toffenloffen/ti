TI 1.3.0 adds seven interface languages and an English project guide.

- Choose English, Norwegian Bokmål, Swedish, Danish, German, French or Spanish from the language selector at the top of the app.
- TI starts in a supported system language, with English as its fallback. Your choice is remembered across restarts and upgrades.
- The dashboard, model and task details, project-folder controls, empty states, errors and app-provided dialog text follow your selection. Standard Windows file-picker controls follow Windows settings.
- Dates and numbers are localized. Changing languages does not change token totals, the accounting time zone or daily boundaries. Original project names, conversation titles and model IDs are preserved.
- The README, installation guide and repository description are now in English. The Windows package includes **READ-ME.txt** and **Create desktop shortcut.vbs**.

Download **Token-info-1.3.0-win-x64.zip**, extract the entire archive and open **Token info.exe**. Close the old version before upgrading. Extract into a new folder, then run the new shortcut script if you use a desktop shortcut. Existing TI folder selections and window settings are retained.

Requires Windows x64 and installed, signed-in Codex for account figures. No separate Node installation or API key is required. The executable is unsigned. The release includes a SHA-256 checksum and contains no personal logs or credentials.

**Data coverage remains Codex-only. Claude CLI logs are not supported.** Local usage reflects logs stored on this PC; account history may lag behind. Token totals are separate from account quotas.

Validation: 29 automated tests, plus real Electron renderer/IPC checks across all seven languages, saved-language restart tests, populated-account and connection-error views, and German/French layout checks at normal and narrow window sizes.
