// Agrupamento da lista de Tocas, feito no servidor para a página só desenhar.
//  1. Um grupo por frente da Suíte, na ordem do manifesto: os membros (projetos) e, sob cada um, as ferramentas
//     anexas (`membroDe`); depois as ferramentas da frente sem dono. Membro sem pasta ativa vem como `planejado`.
//  2. O que não é da Suíte, separado por `tipo` e pela fábrica: "Sites com <fábrica>" (tipo site com `fabrica`,
//     ou que é a fábrica de alguém; o nome vem do manifesto, ou "Sites com fábrica" se não houver um só nome),
//     "Sites sem <fábrica>" e "Clientes e outros projetos". Sem `tipo` em nenhum
//     item, vira uma lista só.
//  3. As ferramentas sem frente ficam em "Ferramentas".
// `eu` é o nome do projeto que hospeda a própria sala: ele não ganha cartão e as ferramentas anexas dele aparecem soltas.
// A frente que contém `eu` (a "Sala de Operações" desta sede) é o grupo FIXO: vem sempre em primeiro (`fixo: true`) e
// não entra no arrastar. O título continua vindo do manifesto. Sem frente com `eu`, nada é fixo. Os demais grupos
// seguem a ordem do manifesto, e `ordenar` aplica por cima a ordem que a pessoa escolheu.

export function agrupar(itens, suite, { eu } = {}) {
  const sites = itens.filter((s) => s.name !== eu);
  const usados = new Set();
  const pegar = (casa) => sites.filter((s) => !usados.has(s) && casa(s) && usados.add(s));
  const grupos = [];

  const temSuite = Array.isArray(suite?.frentes) && suite.frentes.length > 0;
  if (temSuite) {
    for (const f of suite.frentes) {
      const lista = [];
      for (const m of f.membros) {
        const anexas = pegar((s) => s.kind === 'tool' && s.membroDe === m.nome);
        if (m.nome === eu) {
          lista.push(...anexas.map((toca) => ({ toca, anexas: [] })));
          continue;
        }
        const cabeca = pegar((s) => s.kind === 'site' && s.name === m.nome)[0];
        lista.push(cabeca ? { toca: cabeca, anexas } : { planejado: m, anexas });
      }
      lista.push(...pegar((s) => s.kind === 'tool' && s.suite === f.id).map((toca) => ({ toca, anexas: [] })));
      const fixo = Boolean(eu) && f.membros.some((m) => m.nome === eu);
      grupos.push({ id: f.id, titulo: f.nome, descricao: f.descricao, tipo: 'frente', ...(fixo ? { fixo: true } : {}), itens: lista });
    }
  }

  const restoSites = sites.filter((s) => !usados.has(s) && s.kind !== 'tool');
  const fabricas = new Set(sites.map((s) => s.fabrica).filter(Boolean));
  // Título pelo manifesto: com uma só fábrica nomeada, o nome dela; senão, a palavra genérica.
  const nomeFabrica = fabricas.size === 1 ? [...fabricas][0] : 'fábrica';
  const comCore = (s) => Boolean(s.fabrica) || fabricas.has(s.name);
  const definicoes = restoSites.some((s) => s.tipo)
    ? [
        ['com-core', `Sites com ${nomeFabrica}`, (s) => s.tipo === 'site' && comCore(s)],
        ['sem-core', `Sites sem ${nomeFabrica}`, (s) => s.tipo === 'site' && !comCore(s)],
        ['outros', 'Clientes e outros projetos', (s) => s.tipo !== 'site'],
      ]
    : [['sites', temSuite ? 'Clientes e sites' : null, () => true]];
  for (const [id, titulo, casa] of definicoes) {
    const meus = restoSites.filter(casa);
    if (meus.length) grupos.push({ id, titulo, tipo: 'balde', itens: meus.map((toca) => ({ toca, anexas: [] })) });
  }

  const ferramentas = sites.filter((s) => !usados.has(s) && s.kind === 'tool');
  if (ferramentas.length) {
    grupos.push({ id: 'ferramentas', titulo: 'Ferramentas', tipo: 'balde', itens: ferramentas.map((toca) => ({ toca, anexas: [] })) });
  }
  // O grupo fixo sobe para o primeiro lugar, qualquer que seja a posição da frente no manifesto.
  return [...grupos.filter((g) => g.fixo), ...grupos.filter((g) => !g.fixo)];
}

/** Ids dos grupos que a pessoa pode reordenar (todos menos o fixo). */
export const idsMoveis = (grupos) => grupos.filter((g) => !g.fixo).map((g) => g.id);

/**
 * Aplica a `ordem` salva (lista de ids) aos grupos móveis: o fixo fica em primeiro; ids da ordem que não existem mais são
 * ignorados; grupo novo, que não está na ordem, entra no fim, na ordem em que o manifesto o traz. Função pura.
 */
export function ordenar(grupos, ordem) {
  const fixos = grupos.filter((g) => g.fixo);
  const moveis = grupos.filter((g) => !g.fixo);
  const vistos = new Set();
  const naOrdem = [];
  for (const id of Array.isArray(ordem) ? ordem : []) {
    const g = moveis.find((x) => x.id === id);
    if (g && !vistos.has(id)) {
      vistos.add(id);
      naOrdem.push(g);
    }
  }
  return [...fixos, ...naOrdem, ...moveis.filter((g) => !vistos.has(g.id))];
}
