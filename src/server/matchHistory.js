import { db } from './db.js';

// Histórico de partidas das contas — base do ranking global que virá depois.
//
// Uma linha por partida (não por jogador): o jogo é sempre 1x1, então
// `player1`/`player2` bastam, sem precisar de uma tabela de junção. Só é
// gravada se ao menos um dos dois tiver conta — partida entre dois
// convidados não gera nada, e partidas contra bot ficam de fora por
// completo (ver saveMatchResult).

const LIMITE_PADRAO = 20;

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

// CASE compartilhado por getHistory/getSummary para decidir, por linha, qual
// resultado a partida teve do ponto de vista de `userId`.
const CASE_RESULTADO = `
  CASE
    WHEN winner_index IS NULL THEN 'draw'
    WHEN (player1_id = ? AND winner_index = 0) OR (player2_id = ? AND winner_index = 1) THEN 'win'
    ELSE 'loss'
  END`;

export async function getHistory(userId, limite = LIMITE_PADRAO) {
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
         LIMIT ?`,
    args: [userId, userId, userId, userId, userId, userId, userId, limite],
  });
  return rows.map((linha) => ({
    opponentName: linha.opponent_name,
    playerClass: linha.player_class,
    opponentClass: linha.opponent_class,
    result: linha.result,
    createdAt: linha.created_at,
  }));
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
