' Roda o reiniciar-central.bat sem abrir nenhuma janela (usado pelo botao Reiniciar a Central).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
bat = WScript.Arguments(0)
sh.CurrentDirectory = fso.GetParentFolderName(bat)
sh.Environment("Process")("ATLAS_NO_OPEN") = "1"
sh.Run "cmd /c """ & bat & """", 0, False
