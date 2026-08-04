import { db } from './db.js';

// Histórico de partidas das contas — base do ranking global que virá depois.
//
// Uma linha por partida (não por jogador): o jogo é sempre 1x1, então
// `player1`/`player2` bastam, sem precisar de uma tabela de junção. Só é
// gravada se ao menos um dos dois tiver conta — partida entre dois
// convidados não gera nada, e partidas contra bot ficam de fora por
// completo (ver saveMatchResult).

const LIMITE_PADRAO = 20;
// Teto por requisição: o perfil só pede LIMITE_PADRAO, mas a rota é pública e
// o limite vem da query string, então ninguém puxa o histórico inteiro de uma vez.
const LIMITE_MAXIMO = 50;

// Paginação do histórico: o perfil abre com as últimas LIMITE_PADRAO partidas e
// pede as próximas conforme o jogador rola a lista. Pura para ser testável, e
// tolerante a valor inválido (vem da query string): qualquer coisa que não seja
// número cai no padrão, e o que é número é preso na faixa aceita.
export function parsePaginacao({ limit, offset } = {}) {
  return {
    limite: inteiroNaFaixa(limit, LIMITE_PADRAO, 1, LIMITE_MAXIMO),
    offset: inteiroNaFaixa(offset, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function inteiroNaFaixa(valor, padrao, min, max) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return padrao;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return padrao;
  return Math.min(Math.max(Math.trunc(numero), min), max);
}

// Parte pura: monta a linha a gravar. Separada do banco para ser testável.
// Retorna null se nenhum dos dois jogadores tiver conta.
export function buildMatchRow(players, winnerIndex) {
  const [jogador1, jogador2] = players;
  if (!jogador1.userId && !jogador2.userId) return null;

  return {
    player1Id: jogador1.userId ?? null,
    player1Name: jogador1.name,
    player1Class: jogador1.classId,
    player2Id: jogador2.userId ?? null,
    player2Name: jogador2.name,
    player2Class: jogador2.classId,
    winnerIndex: winnerIndex ?? null,
  };
}

// Partidas contra bot não entram no histórico — senão dava para inflar o
// ranking futuro ganhando do bot mais fácil. (O modo treino nem passa pelo
// servidor; isto cobre o bot de matchmaking.)
export function shouldRecordMatch(match) {
  return match?.bot !== true;
}

export async function saveMatchResult(match, winnerIndex) {
  if (!shouldRecordMatch(match)) return;

  const linha = buildMatchRow(match.players, winnerIndex);
  if (!linha) return;

  try {
    await db.execute({
      sql: `INSERT INTO matches
              (player1_id, player1_name, player1_class, player2_id, player2_name, player2_class, winner_index)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        linha.player1Id, linha.player1Name, linha.player1Class,
        linha.player2Id, linha.player2Name, linha.player2Class,
        linha.winnerIndex,
      ],
    });
  } catch (erro) {
    // Falhar ao gravar histórico nunca pode atrapalhar o fim da partida.
    console.error('[historico] falha ao gravar resultado:', erro.message);
  }
}

// Resolve o nome exibido (como aparece no ranking) para o id da conta. A
// comparação ignora maiúsculas, igual ao índice único de nome (schema.js).
// Devolve null se ninguém tiver esse nome.
export async function findUserIdByName(name) {
  if (typeof name !== 'string' || name.trim() === '') return null;
  const { rows } = await db.execute({
    sql: 'SELECT id FROM user WHERE LOWER(name) = LOWER(?) LIMIT 1',
    args: [name.trim()],
  });
  return rows[0]?.id ?? null;
}

// CASE compartilhado por getHistory/getSummary para decidir, por linha, qual
// resultado a partida teve do ponto de vista de `userId`.
const CASE_RESULTADO = `
  CASE
    WHEN winner_index IS NULL THEN 'draw'
    WHEN (player1_id = ? AND winner_index = 0) OR (player2_id = ? AND winner_index = 1) THEN 'win'
    ELSE 'loss'
  END`;

// Uma página do histórico, da mais recente para a mais antiga. Devolve
// `{ matches, hasMore }`: para saber se ainda há partidas depois desta página,
// pede uma linha a mais do que o limite e a descarta — mais barato que um
// COUNT(*) separado.
//
// A paginação é por OFFSET, então uma partida gravada entre dois pedidos
// desloca a janela e pode repetir uma linha na página seguinte. Para histórico
// (e no ritmo de uma partida por vez) isso é irrelevante.
export async function getHistory(userId, { limite = LIMITE_PADRAO, offset = 0 } = {}) {
  const { rows } = await db.execute({
    sql: `SELECT
            CASE WHEN player1_id = ? THEN player2_name ELSE player1_name END AS opponent_name,
            CASE WHEN player1_id = ? THEN player1_class ELSE player2_class END AS player_class,
            CASE WHEN player1_id = ? THEN player2_class ELSE player1_class END AS opponent_class,
            ${CASE_RESULTADO} AS result,
            created_at
          FROM matches
         WHERE player1_id = ? OR player2_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
    args: [userId, userId, userId, userId, userId, userId, userId, limite + 1, offset],
  });
  const matches = rows.slice(0, limite).map((linha) => ({
    opponentName: linha.opponent_name,
    playerClass: linha.player_class,
    opponentClass: linha.opponent_class,
    result: linha.result,
    createdAt: linha.created_at,
  }));
  return { matches, hasMore: rows.length > limite };
}

export async function getSummary(userId) {
  const { rows } = await db.execute({
    sql: `SELECT ${CASE_RESULTADO} AS result, COUNT(*) AS total
            FROM matches
           WHERE player1_id = ? OR player2_id = ?
           GROUP BY result`,
    args: [userId, userId, userId, userId],
  });
  const resumo = { wins: 0, losses: 0, draws: 0, total: 0 };
  const campo = { win: 'wins', loss: 'losses', draw: 'draws' };
  for (const linha of rows) {
    const total = Number(linha.total);
    resumo[campo[linha.result]] = total;
    resumo.total += total;
  }
  return resumo;
}
