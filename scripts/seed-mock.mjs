// Popula o banco local com jogadores e partidas de mock, para dar o que olhar
// no ranking do menu e no perfil de cada jogador durante o desenvolvimento.
//
//   npm run db:seed
//
// Só roda em banco local: se a URL apontar para o Turso, aborta. E é
// idempotente — apaga as contas/partidas de mock anteriores (identificadas
// pelo prefixo `mock-` no id) antes de recriar tudo.
//
// As contas de mock existem só nas tabelas `user`/`matches`: não têm linha em
// `account`, então não é possível fazer login com elas — servem para aparecer
// no ranking e ter perfil visitável, não para jogar.
//
// As contas reais que já existem no banco local (a sua, criada pelo cadastro)
// também entram no sorteio de partidas contra os jogadores de mock, para o
// perfil de quem está logado não ficar vazio. Toda partida gerada tem ao menos
// um lado de mock, então a limpeza pelo prefixo `mock-` sempre dá conta de
// desfazer o seed.

import { db, isRemoteDatabase, describeDatabase } from '../src/server/db.js';
import { applyAppSchema } from '../src/server/schema.js';
import { CLASSES } from '../shared/classes.js';

if (isRemoteDatabase()) {
  console.error(`Recusando popular mock no banco ${describeDatabase()}: só em banco local.`);
  process.exit(1);
}

const PREFIXO_ID = 'mock-';
const CLASS_IDS = Object.keys(CLASSES);

// `forca` decide quem ganha o confronto (o mais forte leva), então também
// define a ordem esperada no ranking. Empates e zebras vêm de uma regra fixa
// mais abaixo, para o seed ser sempre igual.
const JOGADORES = [
  { nome: 'Nyx', forca: 9 },
  { nome: 'Valquíria', forca: 8 },
  { nome: 'BolhaDeSabao', forca: 7 },
  { nome: 'Cascavel', forca: 6 },
  { nome: 'Zé da Arena', forca: 5 },
  { nome: 'Pipoca', forca: 4 },
  { nome: 'Tio Bill', forca: 3 },
  { nome: 'novato123', forca: 2 },
  { nome: 'AFK Master', forca: 1 },
];

function idDe(nome) {
  const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${PREFIXO_ID}${slug}`;
}

// A classe varia por partida (como na vida real, em que o jogador troca de
// classe entre partidas), em rodízio determinístico pelas classes existentes.
function classeDe(...numeros) {
  const soma = numeros.reduce((total, n) => total + n, 0);
  return CLASS_IDS[soma % CLASS_IDS.length];
}

const UM_MINUTO_MS = 60 * 1000;
const INTERVALO_ENTRE_PARTIDAS_MIN = 70;

// created_at das partidas: da mais antiga para a mais recente, uma a cada ~70
// minutos para trás a partir de agora. O formato é o mesmo do DEFAULT da tabela.
function timestamp(indiceDaPartida, totalDePartidas) {
  const minutosAtras = (totalDePartidas - indiceDaPartida) * INTERVALO_ENTRE_PARTIDAS_MIN;
  return new Date(Date.now() - minutosAtras * UM_MINUTO_MS).toISOString();
}

// Quantas vezes cada par de jogadores se enfrenta. Com 9 jogadores cada um
// enfrenta 8 adversários, então isso dá 8 × CONFRONTOS_POR_PAR partidas no
// histórico de cada perfil (+ as contra convidado e contra as contas reais).
// Precisa ficar bem acima do tamanho da página do histórico (20) para dar para
// testar o carregamento por scroll do perfil: com 8, são ~64 por perfil, ou
// seja umas 4 páginas.
const CONFRONTOS_POR_PAR = 8;
const CONVIDADOS = ['Anônimo', 'guest_42', 'PassavaPorAqui', 'xX_dark_Xx'];

// Quem ganha: o mais forte, exceto quando a conta dá empate (múltiplo de 7) ou
// zebra (múltiplo de 5). `rodada` entra na conta para os confrontos repetidos
// do mesmo par não terem todos o mesmo resultado.
function decidirVencedor(i, j, rodada) {
  const soma = i + j + rodada * 3;
  if (soma % 7 === 0) return null;
  if (soma % 5 === 0) return JOGADORES[i].forca > JOGADORES[j].forca ? 1 : 0;
  return JOGADORES[i].forca > JOGADORES[j].forca ? 0 : 1;
}

// Round-robin entre os jogadores de mock, repetido CONFRONTOS_POR_PAR vezes,
// mais partidas contra convidados (player2_id nulo) e contra as contas reais
// que já existem no banco local.
function montarPartidas(contasReais) {
  const partidas = [];

  for (let rodada = 0; rodada < CONFRONTOS_POR_PAR; rodada += 1) {
    for (let i = 0; i < JOGADORES.length; i += 1) {
      for (let j = i + 1; j < JOGADORES.length; j += 1) {
        // Alterna quem entra como player1 entre as rodadas, para o histórico
        // não mostrar sempre o mesmo lado da partida.
        const anfitriaoEhOPrimeiro = (i + rodada) % 2 === 0;
        const vencedor = decidirVencedor(i, j, rodada);
        partidas.push({
          p1: anfitriaoEhOPrimeiro ? i : j,
          p2: anfitriaoEhOPrimeiro ? j : i,
          vencedor: vencedor === null || anfitriaoEhOPrimeiro ? vencedor : 1 - vencedor,
          rodada,
        });
      }
    }
  }

  // Partidas contra convidado (sem conta): exercita o caso de player2_id nulo
  // no histórico, que também acontece em produção.
  CONVIDADOS.forEach((nomeConvidado, indice) => {
    for (let rodada = 0; rodada < 2; rodada += 1) {
      partidas.push({
        p1: (indice * 2 + rodada) % JOGADORES.length,
        convidado: nomeConvidado,
        vencedor: (indice + rodada) % 3 === 2 ? null : (indice + rodada) % 2,
        rodada,
      });
    }
  });

  // Partidas das contas reais do banco local contra os jogadores de mock —
  // senão o perfil de quem está logado fica praticamente vazio. Nunca conta
  // real x conta real: toda partida precisa de um lado de mock para a limpeza
  // do seed conseguir apagá-la depois.
  contasReais.forEach((conta, indiceDaConta) => {
    JOGADORES.forEach((_, indiceDoMock) => {
      const soma = indiceDaConta + indiceDoMock;
      const contaEhOPrimeiro = soma % 2 === 0;
      let vencedorDaConta;
      if (soma % 6 === 0) vencedorDaConta = null;
      else vencedorDaConta = soma % 3 === 0 ? 1 : 0;
      partidas.push({
        p1: contaEhOPrimeiro ? null : indiceDoMock,
        p2: contaEhOPrimeiro ? indiceDoMock : null,
        contaReal: conta,
        contaRealEhOPrimeiro: contaEhOPrimeiro,
        vencedor: vencedorDaConta === null
          ? null
          : (contaEhOPrimeiro ? vencedorDaConta : 1 - vencedorDaConta),
        rodada: indiceDoMock,
      });
    });
  });

  // Intercala as partidas das contas reais no meio das outras, para os
  // created_at (que seguem a ordem do array) não deixarem todas elas juntas
  // no fim da linha do tempo.
  return partidas.sort((a, b) => chaveDeOrdem(a) - chaveDeOrdem(b));
}

// Ordem determinística e "embaralhada" o suficiente: o resto por um número
// primo espalha as partidas sem depender de Math.random.
function chaveDeOrdem(partida) {
  const base = (partida.p1 ?? 0) * 31 + (partida.p2 ?? 0) * 17 + partida.rodada * 7;
  return (base * 13) % 997;
}

async function limparMockAnterior() {
  await db.execute({
    sql: `DELETE FROM matches
           WHERE player1_id LIKE ?
              OR player2_id LIKE ?`,
    args: [`${PREFIXO_ID}%`, `${PREFIXO_ID}%`],
  });
  await db.execute({ sql: 'DELETE FROM user WHERE id LIKE ?', args: [`${PREFIXO_ID}%`] });
}

async function inserirJogadores() {
  const agora = new Date().toISOString();
  for (const [indice, jogador] of JOGADORES.entries()) {
    await db.execute({
      sql: `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
            VALUES (?, ?, ?, 1, ?, ?)`,
      args: [idDe(jogador.nome), jogador.nome, `${idDe(jogador.nome)}@exemplo.local`, agora, agora],
    });
    jogador.id = idDe(jogador.nome);
  }
}

// Contas de verdade já existentes no banco local (criadas pelo cadastro), para
// dar histórico a quem faz login em desenvolvimento.
async function buscarContasReais() {
  const { rows } = await db.execute({
    sql: 'SELECT id, name FROM user WHERE id NOT LIKE ?',
    args: [`${PREFIXO_ID}%`],
  });
  return rows.map((linha) => ({ id: linha.id, nome: linha.name }));
}

// Resolve um lado da partida para { id, nome }: jogador de mock (por índice),
// convidado (sem id) ou conta real do banco local.
function ladoDaPartida(partida, ehOPrimeiro) {
  if (partida.contaReal && partida.contaRealEhOPrimeiro === ehOPrimeiro) {
    return partida.contaReal;
  }
  if (partida.convidado && !ehOPrimeiro) {
    return { id: null, nome: partida.convidado };
  }
  return JOGADORES[ehOPrimeiro ? partida.p1 : partida.p2];
}

async function inserirPartidas(partidas) {
  for (const [indice, partida] of partidas.entries()) {
    const jogador1 = ladoDaPartida(partida, true);
    const jogador2 = ladoDaPartida(partida, false);
    const classe1 = classeDe(indice, partida.rodada);
    const classe2 = classeDe(indice, partida.rodada, 1);
    await db.execute({
      sql: `INSERT INTO matches
              (player1_id, player1_name, player1_class, player2_id, player2_name, player2_class,
               winner_index, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        jogador1.id, jogador1.nome, classe1,
        jogador2.id ?? null, jogador2.nome, classe2,
        partida.vencedor, timestamp(indice, partidas.length),
      ],
    });
  }
}

await applyAppSchema();
await limparMockAnterior();
await inserirJogadores();
const contasReais = await buscarContasReais();
const partidas = montarPartidas(contasReais);
await inserirPartidas(partidas);

const nomesReais = contasReais.map((conta) => conta.nome).join(', ') || 'nenhuma';
console.log(`Mock inserido no banco ${describeDatabase()}:`
  + ` ${JOGADORES.length} jogadores e ${partidas.length} partidas.`);
console.log(`Contas reais que também ganharam histórico: ${nomesReais}.`);
