// Hook de início de sessão do pacote `intoca-sala`: garante que a InToca Sala está no ar.
//
//   modo hook (padrão)  Não espera nada: confere se o lançador está desligado e entrega o trabalho a um vigia separado
//                       (este mesmo arquivo com --vigia), solto do chat. Sai com 0 e sem saída, sempre. NUNCA sobe a Animada.
//   --vigia             Espera com prazo generoso e sobe a Clássica se preciso. Veja lancador.mjs. Depois, se a pessoa marcou
//                       "Subir a sala animada junto com o sistema" (`animada.auto` em sala.json), sobe a Animada uma vez.
//   --servico           Para o serviço de logon (servico.mjs): igual ao vigia (inclusive a Animada), mas fica vivo enquanto a
//                       Clássica viver, para o agendador do sistema reiniciar se ela cair. A Animada não fica presa ao serviço.
//
// O hook nunca derruba nem atrasa o início do chat: qualquer erro termina em silêncio com código 0.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { casaDe } from '../lib/estado.mjs';
import { desligado, lancarServidor, registrar, subirAnimada, vigiar } from './lancador.mjs';

const ESTE = fileURLToPath(import.meta.url);

// Só a Clássica de pé justifica subir a Animada ao lado: 'no-ar' (já estava) ou 'subiu' (o vigia a subiu agora).
const CLASSICA_DE_PE = ['no-ar', 'subiu'];

/** O vigia: a Clássica e, depois dela, a Animada se pedida. `deps` troca o mundo nos testes. */
export async function rodarVigia(casa, deps = {}) {
  const r = await (deps.vigiar ?? vigiar)({ casa });
  if (!['no-ar', 'ocupado', 'desligado'].includes(r)) registrar(casa, `vigia: ${r}`); // o dia a dia não enche o log
  const a = CLASSICA_DE_PE.includes(r) ? await (deps.subirAnimada ?? subirAnimada)({ casa }) : null;
  return { classica: r, animada: a };
}

/** O serviço de logon: como o vigia, mas acompanha a Clássica (presa a este processo) e sai com erro se ela cair. */
export async function rodarServico(casa, deps = {}) {
  // Dentro do serviço o agendador do sistema cuida da vida deste processo: a sala sobe presa a ele, que a acompanha e,
  // se ela cair, sai com erro para o agendador reiniciar.
  let filho = null;
  const lancar = deps.lancarServidor ?? lancarServidor;
  const resultado = await (deps.vigiar ?? vigiar)({ casa, deps: { lancar: () => (filho = lancar({ casa, preso: true })) } });
  registrar(casa, `serviço: ${resultado}`);
  // A Animada sobe logo depois da Clássica e não entra na espera abaixo: se ela cair, o serviço não reinicia por ela.
  const a = CLASSICA_DE_PE.includes(resultado) ? await (deps.subirAnimada ?? subirAnimada)({ casa }) : null;
  let codigo = null;
  if (filho) {
    codigo = await filho.saiu;
    registrar(casa, `serviço: a sala saiu (código ${codigo})`);
  }
  return { classica: resultado, animada: a, codigo };
}

/** Modo hook: entrega a um vigia solto do chat e volta. Nunca chama a Animada. */
export function rodarHook(casa, deps = {}) {
  if ((deps.desligado ?? desligado)(casa)) return false;
  (deps.disparar ?? ((arg) => spawn(process.execPath, [ESTE, arg], { detached: true, stdio: 'ignore', windowsHide: true, env: process.env }).unref()))('--vigia');
  return true;
}

async function principal() {
  const casa = casaDe();
  const modo = process.argv[2];
  if (modo === '--vigia') {
    await rodarVigia(casa);
  } else if (modo === '--servico') {
    const { codigo } = await rodarServico(casa);
    if (codigo !== null) process.exitCode = codigo === 0 ? 0 : 1;
  } else {
    rodarHook(casa);
  }
}

function ehOPrograma() {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(ESTE);
  } catch {
    return false; // importado pelos testes (sem argv[1] igual a este arquivo): não roda
  }
}

if (ehOPrograma()) {
  try {
    await principal();
  } catch {
    /* hook de contexto: em qualquer erro, sai quieto */
  }
  process.exitCode ??= 0;
}
