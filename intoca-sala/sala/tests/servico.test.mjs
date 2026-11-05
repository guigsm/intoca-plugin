import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aplicar, montarPlano, textoDoPlano, NOME_DA_TAREFA, ROTULO, UNIDADE } from '../lancador/servico.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SERVICO = join(AQUI, '..', 'lancador', 'servico.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'sala-servico-'));
const limpar = (...d) => d.forEach((x) => rmSync(x, { recursive: true, force: true }));
const NODE = '/opt/meu node/bin/node';
const INICIO = '/pasta com espaço/intoca-sala/sala/lancador/inicio.mjs';

function gravador(falhaEm = null) {
  const chamadas = [];
  return {
    chamadas,
    exec: (cmd, args) => {
      chamadas.push([cmd, ...args].join(' '));
      if (falhaEm && chamadas.length === falhaEm) throw new Error('falhou de propósito');
    },
  };
}

test('planos das três plataformas apontam para o Node e o lançador dados, em modo --servico, sem caminho de máquina embutido no código', () => {
  const casa = tmp();
  const tmpDir = tmp();
  const win = montarPlano('win32', { node: 'C:\\Program Files\\nodejs\\node.exe', inicio: 'C:\\Users\\Fulano\\p\\inicio.mjs', usuario: 'PC\\Fulano', tmpDir });
  assert.match(win.conteudoPrevisto, /<Command>conhost\.exe<\/Command>/);
  assert.match(win.conteudoPrevisto, /--headless &quot;C:\\Program Files\\nodejs\\node\.exe&quot; &quot;C:\\Users\\Fulano\\p\\inicio\.mjs&quot; --servico/);
  assert.match(win.conteudoPrevisto, /<LogonTrigger>/);
  assert.match(win.conteudoPrevisto, /<RunLevel>LeastPrivilege<\/RunLevel>/);
  assert.match(win.conteudoPrevisto, /<MultipleInstancesPolicy>IgnoreNew</);
  const mac = montarPlano('darwin', { node: NODE, inicio: INICIO, casa, uid: 501 });
  assert.match(mac.conteudoPrevisto, new RegExp(`<string>${ROTULO}</string>`));
  assert.match(mac.conteudoPrevisto, /<string>--servico<\/string>/);
  assert.match(mac.conteudoPrevisto, /<key>RunAtLoad<\/key><true\/>/);
  assert.equal(mac.arquivos[0].caminho, join(casa, 'Library', 'LaunchAgents', `${ROTULO}.plist`));
  const lin = montarPlano('linux', { node: NODE, inicio: INICIO, casa });
  assert.match(lin.conteudoPrevisto, /ExecStart="\/opt\/meu node\/bin\/node" "\/pasta com espaço\/intoca-sala\/sala\/lancador\/inicio\.mjs" --servico/);
  assert.match(lin.conteudoPrevisto, /Restart=on-failure/);
  assert.equal(lin.arquivos[0].caminho, join(casa, '.config', 'systemd', 'user', UNIDADE));
  assert.equal(montarPlano('freebsd'), null);
  limpar(casa, tmpDir);
});

test('XML da tarefa do Windows escapa o que precisa e vai em UTF-16 com marca de ordem', () => {
  const tmpDir = tmp();
  const win = montarPlano('win32', { node: 'C:\\a&b\\node.exe', inicio: 'C:\\x<y>\\inicio.mjs', usuario: 'D\\U', tmpDir });
  assert.ok(win.conteudoPrevisto.includes('a&amp;b'));
  assert.ok(win.conteudoPrevisto.includes('x&lt;y&gt;'));
  const buf = win.arquivos[0].conteudo;
  assert.deepEqual([...buf.subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(buf.subarray(2).toString('utf16le'), win.conteudoPrevisto);
  limpar(tmpDir);
});

test('instalar SEM consentimento só mostra o plano: nenhum comando, nenhum arquivo', () => {
  for (const so of ['win32', 'darwin', 'linux']) {
    const casa = tmp();
    const g = gravador();
    const plano = montarPlano(so, { node: NODE, inicio: INICIO, casa, tmpDir: casa });
    for (const acao of ['instalar', 'desinstalar']) {
      const r = aplicar(plano, acao, { exec: g.exec });
      assert.equal(r.aplicou, false);
      assert.match(r.texto, /Nada foi alterado\. Para aplicar, repita o comando com --sim\./);
    }
    assert.deepEqual(g.chamadas, []);
    for (const a of plano.arquivos) assert.equal(existsSync(a.caminho), false);
    limpar(casa);
  }
});

test('o plano mostra antes o que vai mudar: arquivo, comandos, administrador, desfazer', () => {
  const casa = tmp();
  const t = textoDoPlano(montarPlano('linux', { node: NODE, inicio: INICIO, casa }), 'instalar');
  assert.match(t, /INSTALAR o serviço de logon da InToca Sala \(linux\)/);
  assert.match(t, /sem administrador/);
  assert.match(t, /nada é baixado/);
  assert.match(t, /Arquivo que será criado: .*intoca-sala\.service/);
  assert.match(t, /systemctl --user enable --now intoca-sala\.service/);
  assert.match(t, /"desinstalar"/);
  const d = textoDoPlano(montarPlano('darwin', { node: NODE, inicio: INICIO, casa, uid: 501 }), 'desinstalar');
  assert.match(d, /DESINSTALAR/);
  assert.match(d, /o arquivo .*br\.intoca\.sala\.plist/);
  limpar(casa);
});

test('linux: instalar com sim cria a unidade e liga; desinstalar desliga, remove o arquivo e recarrega; desfazer é completo', () => {
  const casa = tmp();
  const g = gravador();
  const plano = montarPlano('linux', { node: NODE, inicio: INICIO, casa });
  const arq = plano.arquivos[0].caminho;
  const i = aplicar(plano, 'instalar', { consentimento: true, exec: g.exec });
  assert.equal(i.aplicou, true);
  assert.equal(readFileSync(arq, 'utf8'), plano.conteudoPrevisto);
  assert.deepEqual(g.chamadas, ['systemctl --user daemon-reload', `systemctl --user enable --now ${UNIDADE}`]);
  g.chamadas.length = 0;
  const d = aplicar(plano, 'desinstalar', { consentimento: true, exec: g.exec });
  assert.equal(d.aplicou, true);
  assert.equal(existsSync(arq), false);
  assert.deepEqual(g.chamadas, [`systemctl --user disable --now ${UNIDADE}`, 'systemctl --user daemon-reload']);
  limpar(casa);
});

test('macOS: bootout tolerante antes do bootstrap; desinstalar tira o agente e o arquivo', () => {
  const casa = tmp();
  const g = gravador();
  const plano = montarPlano('darwin', { node: NODE, inicio: INICIO, casa, uid: 501 });
  assert.equal(aplicar(plano, 'instalar', { consentimento: true, exec: g.exec }).aplicou, true);
  assert.deepEqual(g.chamadas, [`launchctl bootout gui/501/${ROTULO}`, `launchctl bootstrap gui/501 ${plano.arquivos[0].caminho}`]);
  assert.ok(existsSync(plano.arquivos[0].caminho));
  assert.equal(aplicar(plano, 'desinstalar', { consentimento: true, exec: g.exec }).aplicou, true);
  assert.equal(existsSync(plano.arquivos[0].caminho), false);
  limpar(casa);
});

test('Windows: grava o XML temporário, chama schtasks /Create e apaga o temporário; desinstalar chama /Delete e tolera "não existia"', () => {
  const tmpDir = tmp();
  const g = gravador();
  const plano = montarPlano('win32', { node: 'C:\\n\\node.exe', inicio: 'C:\\p\\inicio.mjs', usuario: 'D\\U', tmpDir });
  const xml = plano.arquivos[0].caminho;
  let vistoDuranteOComando = false;
  const exec = (cmd, args) => {
    vistoDuranteOComando = existsSync(xml);
    g.exec(cmd, args);
  };
  assert.equal(aplicar(plano, 'instalar', { consentimento: true, exec }).aplicou, true);
  assert.ok(vistoDuranteOComando, 'o XML existe quando o schtasks roda');
  assert.equal(existsSync(xml), false, 'e não fica no disco depois');
  assert.deepEqual(g.chamadas, [`schtasks /Create /TN ${NOME_DA_TAREFA} /XML ${xml} /F`]);
  const falha = aplicar(plano, 'desinstalar', { consentimento: true, exec: () => { throw new Error('não existe'); } });
  assert.equal(falha.aplicou, true, 'desfazer o que não existe não é erro');
  limpar(tmpDir);
});

test('falha no meio do instalar não deixa meia instalação: o arquivo criado é removido e o erro é dito', () => {
  const casa = tmp();
  const g = gravador(2);
  const plano = montarPlano('linux', { node: NODE, inicio: INICIO, casa });
  const r = aplicar(plano, 'instalar', { consentimento: true, exec: g.exec });
  assert.equal(r.aplicou, false);
  assert.equal(r.erros.length, 1);
  assert.match(r.texto, /Falhou:/);
  assert.equal(existsSync(plano.arquivos[0].caminho), false);
  limpar(casa);
});

test('linha de comando: mostrar e instalar/desinstalar sem --sim não alteram nada e saem com 0; ação inválida sai com 2', () => {
  for (const args of [['mostrar'], ['instalar'], ['desinstalar'], ['instalar', '--so=linux'], ['mostrar', '--so=darwin']]) {
    const r = spawnSync(process.execPath, [SERVICO, ...args], { encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0, args.join(' '));
    assert.doesNotMatch(r.stdout, /Feito\./);
  }
  assert.equal(spawnSync(process.execPath, [SERVICO, 'mexer'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [SERVICO, 'mostrar', '--so=freebsd'], { encoding: 'utf8' }).status, 1);
});
