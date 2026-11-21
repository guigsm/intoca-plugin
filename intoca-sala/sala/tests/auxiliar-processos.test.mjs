// INT-24: provas do auxiliar de processos dos testes (`auxiliar-processos.mjs`). Tudo sobre listas sintéticas e executores de
// mentira, exceto as provas da porta e do PID, que usam um servidor e um processo de verdade criados aqui mesmo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analisarSaidaPs, analisarSaidaWindows, classicaReal, encerrarProcessosDe, ehAlvo, ehNode, executavelDe, folgaPadrao, listarProcessos, pidVivo, portaRecusada,
  guardar, provarSaida, registradosAusentes, restantes, scriptDe, selecionar, TETO_JANELA_HOOK_MS,
} from './auxiliar-processos.mjs';

const t0 = 1_800_000_000_000;
const pids = (lista, opcoes) => selecionar(lista, opcoes).map((p) => p.pid).sort((a, b) => a - b);
const casa = join(tmpdir(), 'sala-lancador-AbC123');

// ---------- PID reaproveitado (a ressalva forte da revisão da INT-23) ----------

test('PID reaproveitado: o PID do hook que já saiu foi herdado por um processo novo de outra suíte; os filhos dela NÃO são selecionados', () => {
  const outraSuite = (quando) => [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node --test sala/tests/lancador.test.mjs' }, // o próprio teste
    { pid: 777, ppid: 1, criado: t0 + quando, cmd: 'C:/node/node.exe C:/x/sala/lancador/inicio.mjs' }, // hook de OUTRA suíte, com o PID do nosso
    { pid: 780, ppid: 777, criado: t0 + quando + 10, cmd: 'C:/node/node.exe C:/x/sala/lancador/inicio.mjs --vigia' }, // vigia dela
    { pid: 781, ppid: 780, criado: t0 + quando + 300, cmd: 'C:/node/node.exe C:/x/sala/server.mjs' }, // sala dela
  ];
  // O nosso hook (PID 777) saiu e foi registrado em t0 + 450; o outro processo nasceu logo depois, dentro da janela do registro.
  const lista = outraSuite(460);
  assert.deepEqual(pids(lista, { casa, raizes: [{ pid: 777, saiu: true, ate: t0 + 450 }], desde: t0, proprio: 5 }), [], 'quem tem o PID da raiz hoje não é a raiz');
  // Mesmo registrada como número (sem hora nenhuma), a raiz com dono desconhecido e fora do teste não vale.
  assert.deepEqual(pids(lista, { casa, raizes: [777], desde: t0, proprio: 5 }), []);
  // Raiz viva registrada com a hora de criação do processo de verdade: o PID hoje pertence a outro processo, bem mais novo.
  assert.deepEqual(pids(outraSuite(5000), { casa, raizes: [{ pid: 777, criado: t0 + 100 }], desde: t0, proprio: 5 }), []);
});

test('PID reaproveitado: filho que nasceu antes do pai que aparece na lista é órfão de outro pai e fica de fora', () => {
  const lista = [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node teste' },
    { pid: 777, ppid: 5, criado: t0 + 900, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' }, // dono atual do PID: filho do próprio teste
    { pid: 790, ppid: 777, criado: t0 + 100, cmd: 'node C:/x/sala/server.mjs' }, // nasceu 800 ms antes do "pai": o PPID é de outro
  ];
  assert.deepEqual(pids(lista, { raizes: [{ pid: 777, saiu: true, ate: t0 + 500 }], desde: t0, proprio: 5 }), []);
  // Controle: com a ordem normal (pai antes do filho), o mesmo filho é selecionado.
  const normal = lista.map((p) => (p.pid === 790 ? { ...p, criado: t0 + 1000 } : p));
  assert.deepEqual(pids(normal, { raizes: [{ pid: 777, saiu: true, ate: t0 + 1100 }], desde: t0, proprio: 5 }), [790]);
});

test('o caso legítimo continua valendo: hook que saiu e ninguém reaproveitou o PID, órfãos do hook e neto são encontrados', () => {
  const lista = [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node teste' },
    { pid: 20, ppid: 999, criado: t0 + 100, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' }, // vigia solto (999 saiu)
    { pid: 21, ppid: 20, criado: t0 + 200, cmd: 'node C:/x/sala/server.mjs' }, // sala
    { pid: 22, ppid: 999, criado: t0 + 3000, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' }, // nasceu depois de o hook sair: não é dele
  ];
  assert.deepEqual(pids(lista, { raizes: [{ pid: 999, saiu: true, ate: t0 + 500 }], desde: t0, proprio: 5 }), [20, 21]);
});

test('raiz viva: vale quando a hora de criação é a registrada; o próprio teste e um descendente do teste que tomou o PID também valem', () => {
  const lista = [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node teste' },
    { pid: 30, ppid: 5, criado: t0 + 100, cmd: 'node C:/x/sala/lancador/inicio.mjs' }, // raiz viva, filha do teste
    { pid: 31, ppid: 30, criado: t0 + 200, cmd: 'node C:/x/sala/server.mjs' },
  ];
  assert.deepEqual(pids(lista, { raizes: [{ pid: 30, criado: t0 + 100 }], desde: t0, proprio: 5 }), [31]);
  assert.deepEqual(pids(lista, { raizes: [{ pid: 30, criado: t0 + 100_000 }], desde: t0, proprio: 5 }), [31], 'mesma hora: aceita; hora diferente cai na regra do descendente do teste');
  assert.deepEqual(pids(lista, { raizes: [5], desde: t0, proprio: 5 }), [30, 31]);
  // Hora diferente e dono que não descende do teste: recusa.
  const alheia = lista.map((p) => (p.pid === 30 ? { ...p, ppid: 1 } : p));
  assert.deepEqual(pids(alheia, { raizes: [{ pid: 30, criado: t0 + 100_000 }], desde: t0, proprio: 5 }), []);
});

test('a Clássica real (serviço e sala da porta 80) nunca é selecionada: não é descendente do teste nem tem a casa temporária na linha', () => {
  const lista = [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node teste' },
    { pid: 10, ppid: 1, criado: t0 - 900_000, cmd: 'C:/node/node.exe C:/checkout/intoca-sala/sala/lancador/inicio.mjs --servico' },
    { pid: 11, ppid: 10, criado: t0 - 899_000, cmd: 'C:/node/node.exe C:/checkout/intoca-sala/sala/server.mjs' },
  ];
  assert.deepEqual(pids(lista, { casa, raizes: [5, { pid: 999, saiu: true, ate: t0 }, { pid: 10, saiu: true, ate: t0 }], desde: t0, proprio: 5 }), [],
    'nem com a raiz errada apontando para o serviço real: ele é mais velho que o teste');
});

// ---------- filtros com fronteira ----------

test('ehAlvo: só `node` rodando um arquivo da sala pelo nome exato; nenhuma destas linhas casa', () => {
  const naoCasam = [
    'node C:/x/sala/lancador/sessao-inicio.mjs',
    'node C:/x/sala/webserver.mjs',
    'node C:/x/sala/lancador/inicio.mjs.bak',
    'node C:/x/sala/server.mjsx',
    'node C:/x/outra/server.mjs', // não é da sala
    'nodemon C:/x/sala/server.mjs',
    'python C:/x/sala/server.mjs',
    'C:/x/node_modules/.bin/ferramenta.exe C:/x/sala/server.mjs',
    '"C:/Program Files/WindowsApps/Claude_1/app/Claude.exe" --type=utility --utility-sub-type=node.mojom.NodeService C:/x/sala/server.mjs',
    'powershell -Command "node C:/x/sala/server.mjs"',
    'C:\\nvm\\nodejs\\node.exe C:\\x\\node_modules\\nodemon\\bin\\nodemon.js C:\\x\\sala\\server.mjs', // o arquivo é só argumento do script
    'node --import ./gancho.mjs outro.mjs C:/x/sala/server.mjs',
    '',
  ];
  for (const cmd of naoCasam) assert.equal(ehAlvo(cmd), false, `não deve casar: ${cmd}`);
  const casam = [
    'C:\\nvm\\nodejs\\node.exe C:\\x\\sala\\lancador\\inicio.mjs --servico',
    '"C:\\Program Files\\nodejs\\node.exe" "C:\\pasta com espaço\\sala\\server.mjs"',
    'node sala/server.mjs',
    'node.exe C:/x/sala/lancador/lancador.mjs',
    '/usr/bin/node /x/sala/lancador/servico.mjs mostrar',
    'node --no-warnings C:/x/sala/server.mjs', // opção antes do script
  ];
  for (const cmd of casam) assert.equal(ehAlvo(cmd), true, `deve casar: ${cmd}`);
});

test('scriptDe: o primeiro argumento que não é opção', () => {
  assert.equal(scriptDe('node --no-warnings "C:\\a b\\sala\\server.mjs" --x'), 'C:\\a b\\sala\\server.mjs');
  assert.equal(scriptDe('node'), '');
  assert.equal(scriptDe('node nodemon.js sala/server.mjs'), 'nodemon.js');
});

test('executavelDe e ehNode: primeiro item da linha, com ou sem aspas e caminho', () => {
  assert.equal(executavelDe('"C:\\Program Files\\nodejs\\node.exe" x.mjs'), 'C:\\Program Files\\nodejs\\node.exe');
  assert.equal(executavelDe('node x.mjs'), 'node');
  assert.equal(executavelDe(''), '');
  for (const ok of ['node', 'node.exe', 'NODE.EXE a', '/usr/local/bin/node a', '"C:\\a b\\node.exe" a']) assert.equal(ehNode(ok), true, ok);
  for (const no of ['nodemon a', 'node_modules/x a', 'C:/node_modules/x.exe a', 'xnode a', 'python node.exe', 'Claude.exe --utility-sub-type=node.mojom.NodeService']) assert.equal(ehNode(no), false, no);
});

test('selecionar com filtro largo: descendente do hook que não é alvo (nodemon, sessao-inicio.mjs, webserver.mjs) não é encerrado', () => {
  const lista = [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node teste' },
    { pid: 20, ppid: 999, criado: t0 + 100, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' },
    { pid: 21, ppid: 20, criado: t0 + 200, cmd: 'nodemon C:/x/sala/server.mjs' },
    { pid: 22, ppid: 20, criado: t0 + 210, cmd: 'node C:/x/sala/lancador/sessao-inicio.mjs' },
    { pid: 23, ppid: 20, criado: t0 + 220, cmd: 'node C:/x/sala/webserver.mjs' },
    { pid: 24, ppid: 20, criado: t0 + 230, cmd: 'C:/x/node_modules/.bin/x.exe C:/x/sala/server.mjs' },
  ];
  assert.deepEqual(pids(lista, { raizes: [{ pid: 999, saiu: true, ate: t0 + 500 }], desde: t0, proprio: 5 }), [20]);
});

// ---------- a listagem falha alto ----------

test('listarProcessos falha alto: status diferente de 0, estouro de tempo, saída vazia e lista sem o próprio teste lançam erro', () => {
  const eu = `${process.pid}\t1\t${(621355968000000000n + BigInt(t0) * 10000n)}\tnode teste`;
  const executor = (r) => () => r;
  assert.throws(() => listarProcessos('win32', executor({ status: 1, stdout: eu, stderr: 'acesso negado' })), /listagem de processos falhou.*status 1.*acesso negado/);
  assert.throws(() => listarProcessos('linux', executor({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' })), /listagem de processos falhou.*status null/);
  assert.throws(() => listarProcessos('win32', executor({ status: null, error: Object.assign(new Error('spawnSync powershell ETIMEDOUT'), { code: 'ETIMEDOUT' }) })), /estourou o tempo/);
  assert.throws(() => listarProcessos('win32', executor({ error: new Error('spawnSync powershell ENOENT') })), /ENOENT/);
  assert.throws(() => listarProcessos('win32', executor({ status: 0, stdout: '', stderr: '' })), /suspeita/);
  assert.throws(() => listarProcessos('linux', executor({ status: 0, stdout: '', stderr: '' })), /suspeita/);
  assert.throws(() => listarProcessos('win32', executor({ status: 0, stdout: `1\t0\t0\tSystem\n2\t1\t0\tnode x\n`, stderr: '' })), /nenhum é este teste/);
  const ok = listarProcessos('win32', executor({ status: 0, stdout: `${eu}\r\n8\t${process.pid}\t0\tfilho\r\n`, stderr: '' }));
  assert.deepEqual(ok.map((p) => p.pid), [process.pid, 8]);
  assert.equal(ok[0].criado, t0);
});

test('listarProcessos de verdade devolve este processo, com a hora de criação de agora', () => {
  const eu = listarProcessos().find((p) => p.pid === process.pid);
  assert.ok(eu, 'a lista inclui o próprio teste');
  assert.ok(ehNode(eu.cmd), 'o próprio teste é um node');
  assert.ok(eu.criado > 0 && eu.criado <= Date.now() + 2000, 'hora de criação plausível');
});

test('analisarSaidaWindows e analisarSaidaPs: ticks e tempo decorrido viram milissegundos desde 1970', () => {
  const ticks = 621355968000000000n + BigInt(t0) * 10000n;
  assert.deepEqual(analisarSaidaWindows(`10\t4\t${ticks}\t"C:\\a b\\node.exe" x\ttab\r\n11\t4\t0\t\r\nlixo\n`), [
    { pid: 10, ppid: 4, criado: t0, cmd: '"C:\\a b\\node.exe" x\ttab' },
    { pid: 11, ppid: 4, criado: 0, cmd: '' },
  ]);
  const ps = analisarSaidaPs('  10   1 1-02:03:04 /usr/bin/node /x/sala/server.mjs\n  11 10    05:06 sleep 1\n  12 10       07 mal\nlinha ruim\n', t0);
  assert.deepEqual(ps.map((p) => [p.pid, p.ppid, t0 - p.criado, p.cmd]), [
    [10, 1, ((1 * 24 + 2) * 3600 + 3 * 60 + 4) * 1000, '/usr/bin/node /x/sala/server.mjs'],
    [11, 10, (5 * 60 + 6) * 1000, 'sleep 1'],
  ]);
});

// ---------- provas independentes: a porta e o PID ----------

test('portaRecusada e pidVivo respondem pelo sistema operacional, não pela seleção', async () => {
  const servidor = createServer();
  const porta = await new Promise((r) => servidor.listen(0, '127.0.0.1', () => r(servidor.address().port)));
  assert.equal(await portaRecusada(porta), false, 'porta aberta não é recusada');
  await new Promise((r) => servidor.close(r));
  assert.equal(await portaRecusada(porta), true, 'porta fechada recusa a conexão');
  const filho = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const pidDoFilho = Number(filho.stdout);
  assert.equal(pidVivo(process.pid), true);
  assert.equal(pidVivo(pidDoFilho), false, 'processo que já saiu não existe');
  assert.deepEqual(await provarSaida({ porta, pids: [pidDoFilho] }), { portaRecusada: true, pidsVivos: [] });
  assert.deepEqual(await provarSaida({ porta: null, pids: [process.pid] }, { ms: 300 }), { portaRecusada: true, pidsVivos: [process.pid] }, 'PID vivo é apontado');
});

// ---------- segunda rodada (revisão independente da INT-24) ----------

const casaComRegistro = (arquivo, conteudo) => {
  const c = mkdtempSync(join(tmpdir(), 'sala-aux-'));
  mkdirSync(join(c, '.intoca'), { recursive: true });
  writeFileSync(join(c, '.intoca', arquivo), JSON.stringify(conteudo));
  return c;
};

test('A: hook de outra suíte herdou o PID da raiz logo depois que o nosso saiu; o vigia dele, criado depois do registro, NÃO é selecionado', () => {
  const lista = (criadoDoVigia) => [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node teste' },
    // O PID 777 (nosso hook) não está na lista: o hook de outra suíte que o herdou já saiu e deixou um vigia órfão com ppid 777.
    { pid: 780, ppid: 777, criado: criadoDoVigia, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' },
    { pid: 781, ppid: 780, criado: criadoDoVigia + 300, cmd: 'node C:/x/sala/server.mjs' },
  ];
  const raiz = { pid: 777, saiu: true, de: t0, ate: t0 + 500 };
  // A folga vai explícita, para a suíte dar o mesmo resultado em qualquer sistema: 250 ms é a do Windows, 1000 ms a do `ps`.
  const WINDOWS = { raizes: [raiz], desde: t0, proprio: 5, folga: 250 };
  const PS = { raizes: [raiz], desde: t0, proprio: 5, folga: 1000 };
  assert.deepEqual(pids(lista(t0 + 1500), WINDOWS), [], 'Windows: criado 1 s depois do registro é de outro');
  assert.deepEqual(pids(lista(t0 + 2000), PS), [], 'ps: 1 s e meio depois do registro passa da folga de 1 s: de outro');
  assert.deepEqual(pids(lista(t0 + 1500), PS), [780, 781], 'ps: 1 s depois do registro está na folga de 1 s (só há segundos): é o nosso');
  assert.deepEqual(pids(lista(t0 - 1000), { raizes: [raiz], desde: t0 - 5000, proprio: 5, folga: 250 }), [], 'criado antes de o hook começar: de outro');
  assert.deepEqual(pids(lista(t0 + 100), { raizes: [raiz], desde: t0, proprio: 5, folga: 250 }), [780, 781], 'criado enquanto o hook vivia: é o nosso');
  assert.deepEqual(pids(lista(t0 + 600), { raizes: [raiz], desde: t0, proprio: 5, folga: 250 }), [780, 781], 'até a folga depois do registro');
});

test('B: PID gravado em sala.json que hoje é de outro processo (de outra suíte, ou a Clássica real) não é selecionado', () => {
  const quando = t0 + 20_000;
  const casa1 = casaComRegistro('sala.json', { classica: { porta: 1234, pid: 900, iniciou_em: new Date(quando).toISOString() } });
  try {
    const base = [{ pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node teste' }];
    const servidor = (extra) => [...base, { pid: 900, ppid: 1, cmd: 'node C:/x/sala/server.mjs', ...extra }];
    const op = (casa, extra = {}) => ({ casa, desde: t0, proprio: 5, folga: 250, ...extra });
    // O PID do arquivo é hoje de um server.mjs criado muito depois do registro (outra suíte): nada.
    assert.deepEqual(pids(servidor({ criado: quando + 120_000 }), op(casa1)), []);
    // A Clássica real: mais velha que o teste, nem a janela nem `desde` a deixam passar.
    assert.deepEqual(pids(servidor({ criado: t0 - 900_000 }), op(casa1)), []);
    // A sala do teste: nasceu logo antes de gravar o registro.
    assert.deepEqual(pids(servidor({ criado: quando - 800 }), op(casa1)), [900]);
    assert.deepEqual(pids(servidor({ criado: quando - 4000 }), op(casa1)), [900], '4 s antes do registro: ainda dentro da janela de 5 s');
    // Outro server.mjs que herdou o PID, criado 10 s antes do registro: fora da janela.
    assert.deepEqual(pids(servidor({ criado: quando - 10_000 }), op(casa1)), [], '10 s antes do registro: fora da janela de 5 s');
    // Sem registro de hora, vale só se descende do teste.
    const sem = casaComRegistro('sala.json', { classica: { porta: 1234, pid: 900 } });
    try {
      assert.deepEqual(pids(servidor({ criado: quando + 120_000 }), op(sem)), []);
      assert.deepEqual(pids(servidor({ criado: quando + 120_000, ppid: 5 }), op(sem)), [900]);
    } finally { rmSync(sem, { recursive: true, force: true }); }
    // lancador.json: mesma regra, com `em`.
    const lanc = casaComRegistro('lancador.json', { em: new Date(quando).toISOString(), pid: 900, resultado: 'subindo' });
    try {
      assert.deepEqual(pids(servidor({ criado: quando + 120_000 }), op(lanc)), []);
      assert.deepEqual(pids(servidor({ criado: quando - 500 }), op(lanc)), [900]);
    } finally { rmSync(lanc, { recursive: true, force: true }); }
  } finally { rmSync(casa1, { recursive: true, force: true }); }
});

test('B: `desde` ausente (como em servico.test e animada-lancador.test) vale o início do teste e nunca desliga a guarda de idade', () => {
  const agora = Date.now();
  const lista = [
    { pid: 5, ppid: 1, criado: agora - 1000, cmd: 'node teste' },
    { pid: 10, ppid: 5, criado: agora - 3_600_000, cmd: 'node C:/x/sala/server.mjs' }, // mais velho que este teste: a Clássica real, por exemplo
    { pid: 11, ppid: 5, criado: agora, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' }, // nasceu durante o teste
  ];
  assert.deepEqual(pids(lista, { raizes: [5], proprio: 5 }), [11]);
  assert.deepEqual(pids(lista, { raizes: [5], proprio: 5, desde: 0 }), [11], '0 explícito vale o mesmo');
  const casa2 = casaComRegistro('sala.json', { classica: { porta: 80, pid: 10, iniciou_em: new Date(agora - 3_600_000).toISOString() } });
  try {
    assert.deepEqual(pids(lista, { casa: casa2, proprio: 5 }), [], 'PID de arquivo que é de um processo velho (a Clássica real) não vale sem `desde`');
  } finally { rmSync(casa2, { recursive: true, force: true }); }
});

test('C: hora de criação desconhecida (0) não abre guarda nenhuma: o processo não é selecionado', () => {
  const lista = [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node teste' },
    { pid: 20, ppid: 5, criado: 0, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' }, // filho do teste sem hora
    { pid: 21, ppid: 30, criado: t0 + 100, cmd: 'node C:/x/sala/server.mjs' }, // tem hora, mas o pai (30) existe sem hora
    { pid: 30, ppid: 1, criado: 0, cmd: 'node outro.js' },
  ];
  assert.deepEqual(pids(lista, { raizes: [5], desde: t0, proprio: 5 }), []);
  assert.deepEqual(pids(lista, { raizes: [30], desde: t0, proprio: 5 }), [], 'pai sem hora: dúvida, não seleciona');
  const casa3 = casaComRegistro('sala.json', { classica: { porta: 80, pid: 20, iniciou_em: new Date(t0).toISOString() } });
  try {
    assert.deepEqual(pids(lista, { casa: casa3, desde: t0, proprio: 5 }), [], 'PID de arquivo sem hora de criação não vale');
  } finally { rmSync(casa3, { recursive: true, force: true }); }
});

test('F: listagem parcial (PID registrado existe mas não está na lista) falha alto; lista completa passa', () => {
  const casa4 = casaComRegistro('sala.json', { classica: { porta: 1, pid: process.pid, iniciou_em: new Date().toISOString() } });
  try {
    const eu = { pid: process.pid, ppid: 1, criado: Date.now() - 5000, cmd: 'node teste' };
    assert.throws(() => restantes({ casa: casa4 }, { listar: () => [{ pid: 1, ppid: 0, criado: 1, cmd: 'System' }, { pid: 2, ppid: 1, criado: 1, cmd: 'x' }] }), /listagem parcial.*não aparece/);
    assert.doesNotThrow(() => restantes({ casa: casa4 }, { listar: () => [eu, { pid: 2, ppid: 1, criado: 1, cmd: 'x' }] }));
    assert.deepEqual(registradosAusentes([eu], [process.pid, 4242, 4242], (pid) => pid === 4242), [4242], 'PID registrado que não existe mais não conta');
    assert.deepEqual(registradosAusentes([eu], [4243], () => false), [], 'PID registrado que não existe mais não conta');
  } finally { rmSync(casa4, { recursive: true, force: true }); }
});

test('a Clássica real continua viva depois da limpeza (pula se a máquina não tem Clássica real)', (t) => {
  const real = classicaReal();
  if (!real || !pidVivo(real.pid)) { t.skip('não há Clássica real viva registrada em ~/.intoca/sala.json nesta máquina'); return; }
  const casa5 = mkdtempSync(join(tmpdir(), 'sala-aux-'));
  try {
    assert.deepEqual(encerrarProcessosDe({ casa: casa5 }), [], 'nada do teste vivo');
    assert.equal(pidVivo(real.pid), true, `a Clássica real (PID ${real.pid}) segue viva`);
  } finally { rmSync(casa5, { recursive: true, force: true }); }
});

// ---------- a guarda da Clássica real (terceira rodada) ----------

/** Um processo vivo qualquer, que faz o papel da Clássica real; quem chama o encerra no `finally`. */
const falsaClassica = () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
const homeComClassica = (pid) => {
  const home = casaComRegistro('sala.json', { classica: { porta: 80, pid, iniciou_em: new Date().toISOString() } });
  return { home, env: { ...process.env, INTOCA_HOME: home } };
};

test('a seleção que alcança a Clássica real lança erro e NÃO mata nada (lista injetada, Clássica de mentira)', () => {
  const falsa = falsaClassica();
  const { home, env } = homeComClassica(falsa.pid);
  const casa6 = mkdtempSync(join(tmpdir(), 'sala-aux-'));
  try {
    const lista = [
      { pid: process.pid, ppid: 1, criado: Date.now() - 5000, cmd: 'node teste' },
      { pid: falsa.pid, ppid: 1, criado: Date.now(), cmd: `node qualquer.js ${casa6}` }, // a casa na linha a faz ser selecionada
    ];
    assert.deepEqual(selecionar(lista, { casa: casa6 }).map((p) => p.pid), [falsa.pid], 'a seleção, de fato, a alcança');
    assert.throws(() => encerrarProcessosDe({ casa: casa6 }, { listar: () => lista, env }), /alcançou a Clássica real/);
    assert.equal(pidVivo(falsa.pid), true, 'nada foi encerrado');
  } finally {
    falsa.kill();
    rmSync(home, { recursive: true, force: true });
    rmSync(casa6, { recursive: true, force: true });
  }
});

test('se a Clássica real, viva ao começar, deixa de existir durante a limpeza, a limpeza lança erro', () => {
  const falsa = falsaClassica();
  const { home, env } = homeComClassica(falsa.pid);
  const casa7 = mkdtempSync(join(tmpdir(), 'sala-aux-'));
  try {
    const listarEMatar = () => { falsa.kill(); while (pidVivo(falsa.pid)) { /* espera sair */ } return [{ pid: process.pid, ppid: 1, criado: Date.now() - 5000, cmd: 'node teste' }]; };
    assert.throws(() => encerrarProcessosDe({ casa: casa7 }, { listar: listarEMatar, env }), /Clássica real \(PID \d+\) deixou de existir/);
    // Controle: Clássica viva até o fim, nada selecionado: sem erro.
    const viva = falsaClassica();
    const h2 = homeComClassica(viva.pid);
    try {
      assert.deepEqual(encerrarProcessosDe({ casa: casa7 }, { listar: () => [{ pid: process.pid, ppid: 1, criado: Date.now() - 5000, cmd: 'node teste' }], env: h2.env }), []);
    } finally { viva.kill(); rmSync(h2.home, { recursive: true, force: true }); }
  } finally {
    falsa.kill();
    rmSync(home, { recursive: true, force: true });
    rmSync(casa7, { recursive: true, force: true });
  }
});

test('a folga padrão: 250 ms no Windows (hora exata), 1 s onde só há segundos (ps)', () => {
  assert.equal(folgaPadrao('win32'), 250);
  for (const sistema of ['linux', 'darwin']) assert.equal(folgaPadrao(sistema), 1000, sistema);
});

// ---------- INT-25 (a): a raiz sem `de` é recusada ----------

test('INT-25 (a): guarda.raiz recusa o hook sem `de` (a janela do teste inteiro não é aceita), com ou sem `saiu`', () => {
  const guarda = guardar({ casa: join(tmpdir(), 'sala-int25-sem-de') });
  try {
    assert.throws(() => guarda.raiz(4242, { saiu: true }), /exige `de`/, 'saiu sem de');
    assert.throws(() => guarda.raiz(4242, { saiu: true, ate: Date.now() }), /exige `de`/, 'saiu com ate mas sem de');
    assert.throws(() => guarda.raiz(4242), /exige `de`/, 'raiz(pid) sem opções');
    assert.throws(() => guarda.raiz(4242, { de: 0 }), /exige `de`/, 'de zero');
    assert.deepEqual(guarda.opcoes.raizes, [], 'nada foi registrado');
    guarda.raiz(4242, { saiu: true, de: Date.now() - 500, ate: Date.now() });
    assert.equal(guarda.opcoes.raizes.length, 1, 'com `de` é aceita');
  } finally {
    guarda.encerrar();
  }
});

// ---------- INT-25 (b): `ate` tomado na saída do hook e janela com teto ----------

test('INT-25 (b): guarda.raiz({ saiu: true }) exige `ate` e limita a janela do hook ao teto, mesmo se o `ate` foi tomado tarde (carga)', () => {
  const guarda = guardar({ casa: join(tmpdir(), 'sala-int25-ate') });
  try {
    const de = Date.now() - 120_000;
    assert.throws(() => guarda.raiz(4243, { saiu: true, de }), /exige `ate`/, 'saiu sem ate');
    assert.throws(() => guarda.raiz(4243, { saiu: true, de, ate: de - 1 }), /exige `ate`/, 'ate antes de de');
    guarda.raiz(4243, { saiu: true, de, ate: de + 90_000 }); // `ate` tomado 90 s depois: o hook não viveu isso
    const r = guarda.opcoes.raizes[0];
    assert.equal(r.ate - r.de, TETO_JANELA_HOOK_MS, 'a janela nunca passa do teto');
    assert.ok(TETO_JANELA_HOOK_MS <= 30_000);
  } finally {
    guarda.encerrar();
  }
});

test('INT-25 (b): `selecionar` também aplica o teto: filho de outra suíte nascido depois do teto não é selecionado, mesmo com `ate` tardio', () => {
  const hook = { pid: 777, ppid: 1, criado: t0, cmd: 'node C:/x/sala/lancador/inicio.mjs' };
  const lista = [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node --test sala/tests/lancador.test.mjs' },
    { pid: 780, ppid: 777, criado: t0 + 100, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' }, // filho legítimo do hook que saiu (777 sumiu)
    { pid: 781, ppid: 777, criado: t0 + 60_000, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' }, // nasceu 60 s depois: é de outro dono do PID
  ].filter((p) => p.pid !== hook.pid);
  // `ate` tomado 90 s depois (sob carga): sem o teto a janela cobriria o 781; com o teto de 30 s só o 780 entra.
  assert.deepEqual(pids(lista, { raizes: [{ pid: 777, saiu: true, de: t0, ate: t0 + 90_000 }], desde: t0, proprio: 5 }), [780]);
  // com `ate` tomado na hora, o resultado é o mesmo
  assert.deepEqual(pids(lista, { raizes: [{ pid: 777, saiu: true, de: t0, ate: t0 + 500 }], desde: t0, proprio: 5 }), [780]);
});

test('INT-25 (item 4): raiz que saiu sem `ate` não fica sem janela: o filho nascido depois do teto não é selecionado', () => {
  const lista = [
    { pid: 5, ppid: 1, criado: t0 - 60_000, cmd: 'node --test sala/tests/lancador.test.mjs' },
    { pid: 780, ppid: 777, criado: t0 + 100, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' },
    { pid: 781, ppid: 777, criado: t0 + 60_000, cmd: 'node C:/x/sala/lancador/inicio.mjs --vigia' },
  ];
  assert.deepEqual(pids(lista, { raizes: [{ pid: 777, saiu: true, de: t0 }], desde: t0, proprio: 5 }), [780]);
});

