Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
Set shortcut = shell.CreateShortcut(shell.SpecialFolders("Desktop") & "\Token info.lnk")
shortcut.TargetPath = root & "\Token info.exe"
shortcut.WorkingDirectory = root
shortcut.IconLocation = root & "\resources\app\assets\token-info.ico"
shortcut.Description = "Your automatic Codex usage overview"
shortcut.Save
