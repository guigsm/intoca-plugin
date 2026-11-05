// InToca Sala (a "Clássica"): a lista de Tocas e o que depende do proprietário, na raiz do localhost.
// Node puro, sem dependências. Uso: node server.mjs
// Só loopback. Porta: INTOCA_SALA_PORTA se definida; senão a 80 se livre; senão uma porta livre. A porta escolhida
// vai para ~/.intoca/sala.json. A sede vem de INTOCA_SEDE ou do ponteiro ~/.intoca/sede. Detalhes: README.md.
import { createServer } from 'node:http';
import { casaDe, desregistrarClassica, escolherPorta, registrarClassica } from './lib/estado.mjs';
import { criarApp } from './lib/app.mjs';

const casa = casaDe();
let porta;
try {
  porta = await escolherPorta({ explicita: process.env.INTOCA_SALA_PORTA });
} catch (e) {
  console.error(`InToca Sala: ${e.message}`);
  process.exit(1);
}

const app = criarApp({ casa });
const hosts = ['127.0.0.1', '::1'];
const servidores = [];

for (const host of hosts) {
  const servidor = createServer((req, res) => {
    app.handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'erro interno' }));
    });
  });
  servidor.once('error', (e) => {
    // O ::1 pode não existir nesta máquina; o 127.0.0.1 é obrigatório.
    if (host === '::1' && (e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT')) return;
    console.error(`InToca Sala: não consegui abrir a porta ${porta} (${host}): ${e.message}`);
    process.exit(1);
  });
  servidor.listen(porta, host, () => {
    if (host === '127.0.0.1') {
      try {
        registrarClassica(casa, { porta });
      } catch (e) {
        console.error(`InToca Sala: não consegui gravar ~/.intoca/sala.json (${e.message})`);
      }
    }
    console.log(`InToca Sala em ${porta === 80 ? 'http://localhost' : `http://localhost:${porta}`} (${host})`);
  });
  servidores.push(servidor);
}

function encerrar() {
  try {
    desregistrarClassica(casa);
  } catch {
    /* melhor esforço */
  }
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
