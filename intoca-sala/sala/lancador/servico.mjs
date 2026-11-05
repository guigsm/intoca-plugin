// Serviço de logon opcional da InToca Sala: sobe a Clássica quando a pessoa entra no computador, sem esperar um chat.
// Node puro. Três ações:
//   node servico.mjs mostrar     [--so=win32|darwin|linux]   diz o que mudaria; não muda nada
//   node servico.mjs instalar    [--sim]                     sem --sim só mostra o plano (nada é criado nem executado)
//   node servico.mjs desinstalar [--sim]                     idem; desfaz o que `instalar` fez
// É opcional e nunca roda sozinho: nenhum hook o chama e instalar o plugin não o aciona. Só com consentimento explícito
// (`--sim`, depois de a pessoa ter visto o plano). Cada plataforma usa o agendador do próprio sistema, no nível do usuário,
// sem administrador: tarefa agendada do Windows, `launchd` (agente de usuário) no macOS, `systemd --user` no Linux.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOME_DA_TAREFA = 'InToca Sala';
export const ROTULO = 'br.intoca.sala';
export const UNIDADE = 'intoca-sala.service';
const ESTE = fileURLToPath(import.meta.url);
const INICIO = join(dirname(ESTE), 'inicio.mjs');

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Argumento de linha de comando do Windows entre aspas (o caminho nunca tem aspas, mas pode ter espaço). */
const aspas = (s) => `"${String(s).replace(/"/g, '')}"`;

// ---------- o plano de cada plataforma (dado puro: arquivos a criar e comandos a rodar) ----------

export function planoWindows({ node, inicio = INICIO, usuario = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`, tmp }) {
  const tarefa = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Sobe a InToca Sala (a página das Tocas) quando você entra no computador. Opcional: remova com "desinstalar".</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${xml(usuario)}</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>${xml(usuario)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>false</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
    <Hidden>true</Hidden>
  </Settings>
  <Actions Context="Author"><Exec><Command>conhost.exe</Command><Arguments>--headless ${xml(aspas(node))} ${xml(aspas(inicio))} --servico</Arguments></Exec></Actions>
</Task>
`;
  return {
    plataforma: 'win32',
    descricao: [
      `Cria a tarefa agendada "${NOME_DA_TAREFA}" no Windows, só para o seu usuário e sem administrador.`,
      'Quando: a cada logon. O que roda: o Node deste computador, escondido, com o lançador da InToca Sala (nada é baixado).',
      'Se a sala cair, o Windows tenta de novo 3 vezes, de minuto em minuto. Para desfazer: "desinstalar".',
    ],
    arquivos: [{ caminho: tmp, conteudo: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tarefa, 'utf16le')]), temporario: true }],
    instalar: [['schtasks', ['/Create', '/TN', NOME_DA_TAREFA, '/XML', tmp, '/F']]],
    desinstalar: [['schtasks', ['/Delete', '/TN', NOME_DA_TAREFA, '/F'], { tolerar: true }]],
    remover: [],
    conteudoPrevisto: tarefa,
  };
}

export function planoMac({ node, inicio = INICIO, casa = homedir(), uid = process.getuid?.() ?? 501 }) {
  const arq = join(casa, 'Library', 'LaunchAgents', `${ROTULO}.plist`);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(ROTULO)}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(node)}</string><string>${xml(inicio)}</string><string>--servico</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>60</integer>
</dict>
</plist>
`;
  return {
    plataforma: 'darwin',
    descricao: [
      `Cria o agente de usuário do launchd "${ROTULO}" (${arq}), sem administrador.`,
      'Quando: a cada logon. O que roda: o Node deste computador com o lançador da InToca Sala (nada é baixado).',
      'Se a sala cair, o launchd sobe de novo (no mínimo de minuto em minuto). Para desfazer: "desinstalar".',
    ],
    arquivos: [{ caminho: arq, conteudo: plist }],
    instalar: [
      ['launchctl', ['bootout', `gui/${uid}/${ROTULO}`], { tolerar: true }],
      ['launchctl', ['bootstrap', `gui/${uid}`, arq]],
    ],
    desinstalar: [['launchctl', ['bootout', `gui/${uid}/${ROTULO}`], { tolerar: true }]],
    remover: [arq],
    conteudoPrevisto: plist,
  };
}

export function planoLinux({ node, inicio = INICIO, casa = homedir() }) {
  const arq = join(casa, '.config', 'systemd', 'user', UNIDADE);
  const unidade = `[Unit]
Description=InToca Sala (a página das Tocas)

[Service]
ExecStart="${node}" "${inicio}" --servico
Restart=on-failure
RestartSec=60

[Install]
WantedBy=default.target
`;
  return {
    plataforma: 'linux',
    descricao: [
      `Cria o serviço de usuário do systemd "${UNIDADE}" (${arq}), sem administrador, e o liga.`,
      'Quando: a cada logon. O que roda: o Node deste computador com o lançador da InToca Sala (nada é baixado).',
      'Se a sala cair, o systemd sobe de novo. Para desfazer: "desinstalar".',
    ],
    arquivos: [{ caminho: arq, conteudo: unidade }],
    instalar: [
      ['systemctl', ['--user', 'daemon-reload']],
      ['systemctl', ['--user', 'enable', '--now', UNIDADE]],
    ],
    desinstalar: [['systemctl', ['--user', 'disable', '--now', UNIDADE], { tolerar: true }]],
    remover: [arq],
    depoisDeRemover: [['systemctl', ['--user', 'daemon-reload'], { tolerar: true }]],
    conteudoPrevisto: unidade,
  };
}

export function montarPlano(plataforma = process.platform, opcoes = {}) {
  const node = opcoes.node ?? process.execPath;
  if (plataforma === 'win32') return planoWindows({ node, ...opcoes, tmp: opcoes.tmp ?? join(opcoes.tmpDir ?? process.env.TEMP ?? homedir(), 'intoca-sala-tarefa.xml') });
  if (plataforma === 'darwin') return planoMac({ node, ...opcoes });
  if (plataforma === 'linux') return planoLinux({ node, ...opcoes });
  return null;
}

// ---------- texto para a pessoa ----------

const comando = ([c, a]) => [c, ...a].join(' ');

export function textoDoPlano(plano, acao) {
  const linhas = [`${acao === 'desinstalar' ? 'DESINSTALAR' : 'INSTALAR'} o serviço de logon da InToca Sala (${plano.plataforma})`, ''];
  if (acao === 'desinstalar') {
    linhas.push('Vai remover:');
    if (plano.plataforma === 'win32') linhas.push(`  - a tarefa agendada "${NOME_DA_TAREFA}"`);
    for (const a of plano.remover) linhas.push(`  - o arquivo ${a}`);
    linhas.push(`Comandos que serão executados: ${plano.desinstalar.map(comando).join(' ; ')}`);
    linhas.push('A sala que estiver rodando agora continua rodando até você fechá-la ou reiniciar o computador.');
  } else {
    linhas.push(...plano.descricao, '');
    linhas.push('Se na tela das Tocas estiver marcado "Subir a sala animada junto com o sistema", o serviço também sobe a sala animada, uma vez, logo depois da InToca Sala.');
    linhas.push('Para parar isso: desmarque a caixa na tela, ou ponha "auto": false dentro de "animada" em ~/.intoca/sala.json. Desmarcar não derruba a sala animada que já está de pé.', '');
    for (const a of plano.arquivos.filter((x) => !x.temporario)) linhas.push(`Arquivo que será criado: ${a.caminho}`);
    linhas.push(`Comandos que serão executados: ${plano.instalar.map(comando).join(' ; ')}`);
  }
  return linhas.join('\n');
}

// ---------- aplicar ----------

const executarDeVerdade = (cmd, args) => execFileSync(cmd, args, { stdio: 'ignore', windowsHide: true, timeout: 30000 });

/**
 * Aplica o plano SÓ com `consentimento: true`. Sem ele devolve o texto e não toca em nada (nem arquivo, nem comando).
 * `exec` é injetável para o teste. Devolve { aplicou, texto, erros }.
 */
export function aplicar(plano, acao, { consentimento = false, exec = executarDeVerdade } = {}) {
  const texto = textoDoPlano(plano, acao);
  if (!consentimento) return { aplicou: false, texto: `${texto}\n\nNada foi alterado. Para aplicar, repita o comando com --sim.`, erros: [] };
  const erros = [];
  const rodar = ([cmd, args, opc]) => {
    try {
      exec(cmd, args);
    } catch (e) {
      if (!opc?.tolerar) erros.push(`${cmd} ${args.join(' ')}: ${e?.message ?? e}`);
    }
  };
  if (acao === 'instalar') {
    for (const a of plano.arquivos) {
      mkdirSync(dirname(a.caminho), { recursive: true });
      writeFileSync(a.caminho, a.conteudo);
    }
    for (const c of plano.instalar) if (!erros.length) rodar(c);
    for (const a of plano.arquivos.filter((x) => x.temporario)) rmSync(a.caminho, { force: true });
    if (erros.length) for (const a of plano.arquivos.filter((x) => !x.temporario)) rmSync(a.caminho, { force: true }); // sem meia instalação
  } else {
    for (const c of plano.desinstalar) rodar(c);
    for (const a of plano.remover) rmSync(a, { force: true });
    for (const c of plano.depoisDeRemover ?? []) rodar(c);
  }
  return { aplicou: erros.length === 0, texto: erros.length ? `${texto}\n\nFalhou: ${erros.join(' | ')}` : `${texto}\n\nFeito.`, erros };
}

// ---------- linha de comando ----------

export function principal(argv) {
  const [acao, ...resto] = argv;
  if (!['mostrar', 'instalar', 'desinstalar'].includes(acao)) {
    console.log('Uso: node servico.mjs mostrar|instalar|desinstalar [--sim]');
    return 2;
  }
  const so = resto.find((a) => a.startsWith('--so='))?.slice(5) ?? process.platform;
  const plano = montarPlano(so);
  if (!plano) {
    console.log(`Este sistema (${so}) não tem serviço de logon suportado. A sala continua subindo pelo início de cada sessão do Claude.`);
    return 1;
  }
  if (acao === 'mostrar') {
    console.log(`${textoDoPlano(plano, 'instalar')}\n\nPara ver o que "desinstalar" faria: node servico.mjs desinstalar`);
    return 0;
  }
  const r = aplicar(plano, acao, { consentimento: resto.includes('--sim') });
  console.log(r.texto);
  return r.erros.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === ESTE) process.exitCode = principal(process.argv.slice(2));
