TI 1.3.1 makes English the default on every first launch.

- A fresh installation starts in English regardless of the Windows or browser language, including app-provided native dialog text.
- An explicitly selected language remains saved across restarts and upgrades. Existing preferences are preserved; missing or invalid preferences fall back to English.
- The previous version did not save its automatic system-language choice, so no settings migration is needed.

Download **Token-info-1.3.1-win-x64.zip**, extract the entire archive and open **Token info.exe**. Close the old app before upgrading. Saved project folders and window settings are retained.

Requires Windows x64 and installed, signed-in Codex for account figures. No separate Node installation or API key is required. The executable is unsigned. SHA256SUMS.txt is included.

Data coverage remains Codex-only; Claude CLI logs are not supported. Token accounting is unchanged.

Validation: 29 automated tests, plus real Electron first-launch, language selection and restart checks, browser fallback checks, and the existing seven-language renderer/IPC and layout checks.
