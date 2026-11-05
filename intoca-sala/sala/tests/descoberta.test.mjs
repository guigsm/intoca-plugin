import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  portFromEnv, launchConfig, launchCwd, portaDev, siteFrom, discoverSites, suiteInfo, gitBranch, parseManifesto, fold,
} from '../lib/descoberta.mjs';

function pasta(arquivos = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sala-teste-'));
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const alvo = join(dir, nome);
    mkdirSync(join(alvo, '..'), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return dir;
}
const limpar = (...dirs) => dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));

test('portFromEnv: PORT do .env vence o .env.example; aspas e espaços aceitos', () => {
  const d = pasta({ '.env': 'FOO=1\n  PORT = "5180"  \nSEGREDO=x', '.env.example': 'PORT=4000' });
  assert.equal(portFromEnv(d), 5180);
  limpar(d);
  const e = pasta({ '.env.example': "PORT='4000'" });
  assert.equal(portFromEnv(e), 4000);
  limpar(e);
});

test('portFromEnv: sem PORT, com PORT de 1 dígito ou comentado devolve undefined', () => {
  const d = pasta({ '.env': '# PORT=3000\nOUTRA_PORT=3000\nPORT=7\n' });
  assert.equal(portFromEnv(d), undefined);
  assert.equal(portFromEnv(join(d, 'nao-existe')), undefined);
  limpar(d);
});

test('launchConfig: primeira configuração; JSON quebrado ou ausente devolve undefined', () => {
  const d = pasta({ '.claude/launch.json': JSON.stringify({ configurations: [{ name: 'a', port: 3000 }, { name: 'b' }] }) });
  assert.equal(launchConfig(d).name, 'a');
  limpar(d);
  const q = pasta({ '.claude/launch.json': '{ quebrado' });
  assert.equal(launchConfig(q), undefined);
  assert.equal(launchConfig(join(q, 'x')), undefined);
  limpar(q);
});

test('launchCwd: sem campo, relativo, absoluto, inexistente e tipo errado', () => {
  const d = pasta({ 'sub/arq': '' });
  assert.deepEqual(launchCwd(d, undefined), {});
  assert.deepEqual(launchCwd(d, {}), {});
  assert.deepEqual(launchCwd(d, { cwd: '' }), {});
  assert.deepEqual(launchCwd(d, { cwd: null }), {});
  assert.deepEqual(launchCwd(d, { cwd: 'sub' }), { cwd: join(d, 'sub') });
  assert.deepEqual(launchCwd(d, { cwd: join(d, 'sub') }), { cwd: join(d, 'sub') });
  const faltando = launchCwd(d, { cwd: 'nada' });
  assert.equal(faltando.cwd, join(d, 'nada'));
  assert.match(faltando.cwdErro, /não é uma pasta existente/);
  assert.match(launchCwd(d, { cwd: 5 }).cwdErro, /deve ser texto/);
  limpar(d);
});

test('portaDev: inteiro de 1 a 65535, o resto é ignorado', () => {
  assert.equal(portaDev({ porta_dev: '4321' }), 4321);
  assert.equal(portaDev({ porta_dev: '0' }), undefined);
  assert.equal(portaDev({ porta_dev: '70000' }), undefined);
  assert.equal(portaDev({ porta_dev: 'abc' }), undefined);
  assert.equal(portaDev({}), undefined);
  assert.equal(portaDev(undefined), undefined);
});

test('gitBranch: ref, HEAD solto e ausência', () => {
  const a = pasta({ '.git/HEAD': 'ref: refs/heads/feature/x\n' });
  assert.equal(gitBranch(a), 'feature/x');
  const b = pasta({ '.git/HEAD': '0123456789abcdef\n' });
  assert.equal(gitBranch(b), '0123456');
  assert.equal(gitBranch(join(a, 'nada')), undefined);
  limpar(a, b);
});

test('siteFrom: ordem de prioridade da porta: .env > launch.json > porta_dev', () => {
  const launch = JSON.stringify({ configurations: [{ runtimeExecutable: 'pnpm', runtimeArgs: ['dev'], port: 3000 }] });
  const comEnv = pasta({ '.env': 'PORT=5180', '.claude/launch.json': launch });
  const soLaunch = pasta({ '.claude/launch.json': launch });
  const soManifesto = pasta();
  const item = { tipo: 'site', porte: 'medio', porta_dev: '4321', fabrica: 'core' };

  const a = siteFrom('a', comEnv, item);
  assert.equal(a.port, 5180);
  assert.equal(a.portaManifesto, undefined);
  assert.deepEqual(a.command, ['pnpm', 'dev']);
  assert.equal(a.fabrica, 'core');

  const b = siteFrom('b', soLaunch, item);
  assert.equal(b.port, 3000);
  assert.equal(b.portaManifesto, undefined);

  const c = siteFrom('c', soManifesto, item);
  assert.equal(c.port, 4321);
  assert.equal(c.portaManifesto, true);
  assert.equal(c.command, undefined);

  const d = siteFrom('d', soManifesto, { tipo: 'site' });
  assert.equal(d.port, undefined);
  assert.equal(d.portaManifesto, undefined);
  limpar(comEnv, soLaunch, soManifesto);
});

test('siteFrom: cwd do launch.json vira cwd do item', () => {
  const d = pasta({
    'app/arq': '',
    '.claude/launch.json': JSON.stringify({ configurations: [{ runtimeExecutable: 'node', cwd: 'app', port: 3001 }] }),
  });
  const s = siteFrom('x', d, {});
  assert.equal(s.cwd, join(d, 'app'));
  assert.equal(s.cwdErro, undefined);
  limpar(d);
});

test('discoverSites: só ativos com pasta existente, sem nome repetido', () => {
  const a = pasta();
  const b = pasta();
  const itens = [
    { nome: 'um', status: 'ativo', pasta_atual: a },
    { nome: 'UM', status: 'ativo', pasta_atual: b },
    { nome: 'dois', status: 'ativo', pasta_atual: join(a, 'nao-existe') },
    { nome: 'tres', status: 'planejado', pasta_atual: b },
    { nome: 'quatro', status: 'ativo', pasta_atual: null },
    { nome: 'cinco', status: 'ativo', pasta_atual: b },
  ];
  assert.deepEqual(discoverSites(itens).map((s) => s.name), ['um', 'cinco']);
  assert.deepEqual(discoverSites([]), []);
  limpar(a, b);
});

test('suiteInfo: membros da lista mais projetos com suite:, planejados com status', () => {
  const m = parseManifesto(`projetos:
  - nome: estudio
    status: planejado
    tipo: ferramenta
  - nome: extra
    suite: producao
    status: ativo
    porte: pequeno
suite:
  nome: S
  regra: R
  frentes:
    producao: {nome: P, membros: [estudio, fantasma], ferramentas: []}
`);
  const s = suiteInfo(m);
  assert.equal(s.nome, 'S');
  assert.deepEqual(s.frentes[0].membros, [
    { nome: 'estudio', status: 'planejado', tipo: 'ferramenta', porte: undefined },
    { nome: 'fantasma', status: undefined, tipo: undefined, porte: undefined },
    { nome: 'extra', status: 'ativo', tipo: undefined, porte: 'pequeno' },
  ]);
  assert.equal(suiteInfo({ projects: [], suite: undefined }), null);
});

test('parseManifesto: texto ausente devolve tudo vazio; fold ignora acento e caixa', () => {
  assert.deepEqual(parseManifesto(undefined), { projects: [], tools: [], suite: undefined });
  assert.equal(fold(' Mural de Publicação '), 'mural de publicacao');
});
