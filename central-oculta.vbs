' Liga a Central de Bots em segundo plano (sem janela). O instalador troca __DIR__ pela pasta do projeto.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "__DIR__"
sh.Run "cmd /c (if not exist data\web mkdir data\web) & npm.cmd run web >> data\web\server.log 2>&1", 0, False
