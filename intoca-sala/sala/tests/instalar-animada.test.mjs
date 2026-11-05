// INT-09: o instalador da Animada com dependências injetadas (sem rede, sem uv de verdade, tudo em os.tmpdir()).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { instalarAnimada, itemDoManifesto, planejarInstalacao, textoDoPedido } from '../lib/instalar-animada.mjs';
import { conferirProgramas, ehAnimada, resolverAnimada } from '../lib/animada.mjs';
import { arquivoDeEstado, gravarConfigDaAnimada, lerEstado } from '../lib/estado.mjs';

const raizes = [];
after(() => raizes.forEach((r) => rmSync(r, { recursive: true, force: true })));
const novo = () => {
  const raiz = mkdtempSync(join(tmpdir(), 'sala-inst-'));
  raizes.push(raiz);
  const casa = join(raiz, 'casa');
  const sede = join(raiz, 'sede');
  mkdirSync(join(casa, '.intoca'), { recursive: true });
  mkdirSync(sede, { recursive: true });
  return { raiz, casa, sede, destino: join(sede, 'sala', 'app') };
};
const OK = { git: { ok: true }, uv: { ok: true }, python: { ok: true }, faltam: [] };
const url = 'https://exemplo.test/animada';
const barras = (p) => p.replace(/\\/g, '/');

/** `rodar` de mentira que registra o que foi pedido. `falhaEm` faz um comando devolver erro. */
function rodarFalso({ falhaEm, origem } = {}) {
  const chamadas = [];
  const rodar = async (cmd, args, o = {}) => {
    chamadas.push([cmd, ...args]);
    if (falhaEm === cmd + ' ' + args[0]) return { status: 1, stdout: '', stderr: `${falhaEm} deu erro`, erro: null };
    if (cmd === 'git' && args[0] === 'clone') {
      mkdirSync(args.at(-1), { recursive: true });
      writeFileSync(join(args.at(-1), 'pyproject.toml'), 'x');
    }
    if (cmd === 'git' && args.includes('get-url')) return origem ? { status: 0, stdout: `${origem}\n`, stderr: '', erro: null } : { status: 1, stdout: '', stderr: '', erro: null };
    if (cmd === 'uv' && args[0] === 'sync') mkdirSync(join(o.cwd, '.venv'), { recursive: true });
    return { status: 0, stdout: '', stderr: '', erro: null };
  };
  return { rodar, chamadas };
}
const deps = (extra = {}) => ({ programas: async () => OK, portaLivre: async () => true, url, tickMs: 60000, ...extra });

test('ehAnimada reconhece o nome do manifesto e o apelido, e só eles', () => {
  assert.equal(ehAnimada('AI Operations Room · InToca'), true);
  assert.equal(ehAnimada('Animada'), true);
  assert.equal(ehAnimada('animada'), true);
  assert.equal(ehAnimada('GeradorDeVideo'), false);
  assert.equal(ehAnimada(undefined), false);
});

test('conferirProgramas: git, uv e Python 3.12+ sem rede; o que falta vem em `faltam`', async () => {
  const feito = [];
  const rodar = async (cmd, args) => {
    feito.push([cmd, ...args].join(' '));
    if (cmd === 'git') return { status: 0, stdout: 'git version 2.50\n', stderr: '' };
    if (cmd === 'uv' && args[0] === '--version') return { status: 0, stdout: 'uv 0.9.0\n', stderr: '' };
    if (cmd === 'uv') return { status: 0, stdout: 'C:/py/python.exe\n', stderr: '' };
    return { status: 1, stdout: '', stderr: '' };
  };
  const ok = await conferirProgramas({ rodar });
  assert.deepEqual(ok.faltam, []);
  assert.equal(ok.git.versao, 'git version 2.50');
  assert.ok(feito.includes('uv python find >=3.12'), 'o Python vem do uv, que acha o da máquina');

  const semUv = await conferirProgramas({ rodar: async (cmd) => (cmd === 'uv' ? { status: null, stdout: '', stderr: '', erro: 'ENOENT' } : { status: 0, stdout: 'git\n', stderr: '' }) });
  assert.deepEqual(semUv.faltam, ['uv', 'python'], 'sem uv não há como conferir o Python');

  const semPython = await conferirProgramas({ rodar: async (cmd, args) => (cmd === 'uv' && args[0] === 'python' ? { status: 2, stdout: '', stderr: 'no interpreter' } : { status: 0, stdout: 'ok\n', stderr: '' }) });
  assert.deepEqual(semPython.faltam, ['python']);
});

test('instalação feliz: clona, sincroniza, grava pasta e porta, devolve o pedido; nada além do planejado roda', async () => {
  const { casa, sede, destino } = novo();
  const { rodar, chamadas } = rodarFalso();
  const eventos = [];
  const r = await instalarAnimada({ casa, sedeRaiz: sede, membroDe: 'intoca', suite: 'operacao', deps: deps({ rodar }), aoProgresso: (e) => eventos.push(e) });
  assert.equal(r.ok, true);
  assert.equal(r.destino, destino);
  assert.equal(r.porta, 8765);
  assert.deepEqual(chamadas.map((c) => c.slice(0, 2).join(' ')), ['git clone', 'uv sync'], 'nenhum comando de hooks nem de settings');
  assert.deepEqual(eventos.filter((e) => e.estado === 'feito').map((e) => e.passo), ['clonar', 'sincronizar', 'registrar']);
  assert.equal(lerEstado(casa).animada.pasta, destino);
  assert.equal(existsSync(join(destino, '.venv')), true);
  assert.match(r.pedido, /Pedido à Diretoria: registrar a sala animada no manifesto/);
  assert.ok(r.item.includes(`pasta: '${barras(destino)}'`));
  assert.ok(r.item.includes('membro_de: intoca'));
  assert.ok(r.item.includes("origem: https://exemplo.test/animada"));
  // reaproveita: o resolver acha a Animada instalada só pelo sala.json
  const achada = resolverAnimada({ env: {}, casa, itens: [] });
  assert.equal(achada.origem, 'sala.json');
  assert.equal(achada.pasta, destino);
  assert.equal(achada.command.at(-1), '8765');
});

test('falha no clone desfaz a pasta criada (inclusive as pais que ele criou) e não grava nada', async () => {
  const { casa, sede, destino } = novo();
  const { rodar } = rodarFalso({ falhaEm: 'git clone' });
  await assert.rejects(instalarAnimada({ casa, sedeRaiz: sede, deps: deps({ rodar }) }), (e) => e.codigo === 'clone-falhou' && e.extra.desfeito === true);
  assert.equal(existsSync(join(sede, 'sala')), false);
  assert.equal(existsSync(arquivoDeEstado(casa)), false);
  assert.equal(existsSync(destino), false);
});

test('destino já vazio: a falha limpa o conteúdo que o clone trouxe mas a pasta que já existia continua', async () => {
  const { casa, raiz } = novo();
  const vazia = join(raiz, 'vazia');
  mkdirSync(vazia);
  const { rodar } = rodarFalso({ falhaEm: 'uv sync' });
  await assert.rejects(instalarAnimada({ casa, pasta: vazia, deps: deps({ rodar }) }), (e) => e.codigo === 'sincronizar-falhou');
  assert.equal(existsSync(vazia), true, 'a pasta era da pessoa');
  assert.deepEqual(readdirSync(vazia), []);
});

test('destino que já é a Animada (mesmo origin): não clona de novo, só sincroniza, e uma falha NÃO apaga o que já existia', async () => {
  const { casa, sede, destino } = novo();
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, 'pyproject.toml'), 'ja estava aqui');
  const { rodar, chamadas } = rodarFalso({ origem: `${url}.git`, falhaEm: 'uv sync' });
  await assert.rejects(instalarAnimada({ casa, sedeRaiz: sede, deps: deps({ rodar }) }), (e) => e.codigo === 'sincronizar-falhou' && e.extra.desfeito === false);
  assert.equal(readFileSync(join(destino, 'pyproject.toml'), 'utf8'), 'ja estava aqui');
  assert.equal(chamadas.some((c) => c[0] === 'git' && c[1] === 'clone'), false);
});

test('destino com outro conteúdo é recusado sem tocar em nada', async () => {
  const { casa, sede, destino } = novo();
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, 'dele.txt'), 'meu');
  const { rodar, chamadas } = rodarFalso({ origem: 'https://github.com/outro/repo' });
  await assert.rejects(planejarInstalacao({ casa, sedeRaiz: sede, deps: deps({ rodar }) }), (e) => e.codigo === 'destino-ocupado');
  assert.equal(chamadas.some((c) => c[1] === 'clone' || c[1] === 'sync'), false);
  assert.equal(readFileSync(join(destino, 'dele.txt'), 'utf8'), 'meu');
});

test('o plano recusa programa faltando (sem instalar nada), porta fora da faixa e porta ocupada', async () => {
  const { casa, sede } = novo();
  for (const [quem, codigo] of [['git', 'sem-git'], ['uv', 'sem-uv'], ['python', 'sem-python']]) {
    const prog = { ...OK, [quem]: { ok: false }, faltam: [quem] };
    await assert.rejects(planejarInstalacao({ casa, sedeRaiz: sede, deps: deps({ programas: async () => prog }) }), (e) => e.codigo === codigo);
  }
  await assert.rejects(planejarInstalacao({ casa, sedeRaiz: sede, porta: 80, deps: deps() }), (e) => e.codigo === 'porta-invalida');
  await assert.rejects(planejarInstalacao({ casa, sedeRaiz: sede, porta: 'abc', deps: deps() }), (e) => e.codigo === 'porta-invalida');
  await assert.rejects(planejarInstalacao({ casa, sedeRaiz: sede, deps: deps({ portaLivre: async () => false }) }), (e) => e.codigo === 'porta-ocupada' && e.extra.portaSugerida === 8766);
  await assert.rejects(planejarInstalacao({ casa, deps: deps() }), (e) => e.codigo === 'destino-invalido', 'sem sede e sem pasta não há onde instalar');
});

test('a porta padrão é a que a pessoa já tinha escolhido em sala.json', async () => {
  const { casa, sede } = novo();
  gravarConfigDaAnimada(casa, { porta: 8801 });
  const p = await planejarInstalacao({ casa, sedeRaiz: sede, deps: deps() });
  assert.equal(p.porta, 8801);
});

test('pedido à Diretoria: manifesto que já tem a Animada nessa pasta e porta vira "nada a fazer"', async () => {
  const { casa, sede, destino } = novo();
  writeFileSync(join(sede, 'sede.yaml'), `ferramentas:\n  - nome: 'AI Operations Room · InToca'\n    pasta: '${barras(destino)}'\n    porta: 8765\n`);
  const { rodar } = rodarFalso();
  const r = await instalarAnimada({ casa, sedeRaiz: sede, deps: deps({ rodar }) });
  assert.equal(r.jaRegistrada, true);
  assert.equal(r.item, null);
  assert.match(r.pedido, /nada a fazer/);
  // com a pasta registrada mas a porta diferente, o pedido pede a troca do item
  const { casa: casa2, sede: sede2, destino: destino2 } = novo();
  writeFileSync(join(sede2, 'sede.yaml'), `ferramentas:\n  - nome: 'AI Operations Room · InToca'\n    pasta: '${barras(destino2)}'\n    porta: 9000\n`);
  const r2 = await instalarAnimada({ casa: casa2, sedeRaiz: sede2, deps: deps({ rodar: rodarFalso().rodar }) });
  assert.equal(r2.jaRegistrada, false);
  assert.match(r2.pedido, /troque-o por este/);
});

test('itemDoManifesto e textoDoPedido: texto pronto, sem hooks e sem segredo', () => {
  const item = itemDoManifesto({ destino: 'C:\\x\\sala', porta: 8765, url, membroDe: 'intoca', suite: 'operacao' });
  assert.match(item, /^ {2}- nome: 'AI Operations Room · InToca'\n {4}pasta: 'C:\/x\/sala'\n {4}porta: 8765\n {4}suite: operacao\n {4}membro_de: intoca\n/);
  assert.match(item, /command: \['C:\/x\/sala\/\.venv\/(Scripts\/python\.exe|bin\/python)', -m, backend\.cli, serve, --port, '8765'\]/);
  assert.match(textoDoPedido({ destino: 'C:\\x\\sala', porta: 8765, jaRegistrada: false, item }), /NÃO foram registrados/);
});
