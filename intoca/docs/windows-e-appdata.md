# Windows, AppData e a pasta temporária dos hooks

Texto de apoio para quando um arquivo "some" no Windows ou um aviso se repete. Duas coisas pequenas, nenhuma é defeito
do plugin.

## 1. O app mostra ao chat uma cópia "virtual" de AppData

No Windows, o app de desktop empacotado mostra aos programas que ele inicia (o chat, os comandos que o chat roda) uma
visão **virtual** da pasta `%LOCALAPPDATA%`. A cópia sombra surge na **primeira vez em que o app grava** aquele arquivo:
daí em diante o app passa a ver só a cópia dele, e o programa **de fora** do app (uma tarefa agendada, um serviço, algo
que você abriu pelo Windows) continua gravando e lendo o arquivo real. Um arquivo que o app **nunca gravou** continua
visível normalmente, nos dois lados.

**Sintoma típico:** "o log parou". A tarefa agendada continua escrevendo no arquivo real, mas o chat lê a cópia sombra
e vê o arquivo parado. Antes de concluir que a tarefa travou, abra o arquivo por um programa de fora do app, por
exemplo o Explorador de Arquivos.

**Como conferir.** No PowerShell, rode `Get-Item <arquivo> | Format-List Target`. Se a linha `Target` mostrar um
caminho dentro de `Packages\...\LocalCache\Local\`, é a cópia sombra. Se `Target` vier vazio, o arquivo é o real.

**A saída.** Não grave, dentro de `AppData`, resultado que precisa ser lido por quem está de fora do app. Grave na
pasta da sede (ou na do projeto), fora de `AppData`: lá os dois lados enxergam o mesmo arquivo, e o Git o acompanha se
for o caso.

## 2. A pasta temporária `intoca-hooks`

Os hooks guardam um pouquinho de estado por sessão: quais avisos já deram (para não repetir) e se o relatório da OS já
foi cobrado. Esse estado fica na pasta **temporária** do usuário, numa subpasta chamada `intoca-hooks` (no Windows,
a que o sistema chama de `%TEMP%`). Nunca fica na pasta do plugin, que muda a cada versão.

**Perder esse estado é seguro.** O pior que acontece: o hook de parada deixa de cobrar o relatório daquela sessão e um
aviso já dado pode aparecer de novo. Nada de governança mora ali (OS, fila e relatórios ficam no Git). **Apagar a
pasta `intoca-hooks` também é seguro**, com o chat aberto ou fechado; ela se recria quando precisa.
