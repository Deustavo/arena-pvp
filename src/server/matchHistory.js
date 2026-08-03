import { db } from './db.js';

// Histórico de partidas das contas — base do ranking global que virá depois.
//
// Uma linha por jogador logado por partida: uma partida entre dois logados
// gera duas linhas (uma da perspectiva de cada um). Convidados não geram nada,
// e partidas contra bot ficam de fora por completo (ver saveMatchResult).

const LIMITE_PADRAO = 20;

// Parte pura: monta as linhas a gravar. Separada do banco para ser testável.
export function buildMatchHistoryRows(players, winnerIndex) {
  return players
    .filter((jogador) => jogador.userId)
    .map((jogador) => {
      const oponente = players.find((outro) => outro.index !== jogador.index);
      return {
        userId: jogador.userId,
        opponentName: oponente?.name ?? 'Desconhecido',
        opponentUserId: oponente?.userId ?? null,
        playerClass: jogador.classId,
        opponentClass: oponente?.classId ?? null,
        result: resultadoPara(jogador.index, winnerIndex),
      };
    });
}

function resultadoPara(index, winnerIndex) {
  if (winnerIndex === null || winnerIndex === undefined) return 'draw';
  return winnerIndex === index ? 'win' : 'loss';
}

// Partidas contra bot não entram no histórico — senão dava para inflar o
// ranking futuro ganhando do bot mais fácil. (O modo treino nem passa pelo
// servidor; isto cobre o bot de matchmaking.)
export function shouldRecordMatch(match) {
  return match?.bot !== true;
}

export async function saveMatchResult(match, winnerIndex) {
  if (!shouldRecordMatch(match)) return;

  const linhas = buildMatchHistoryRows(match.players, winnerIndex);
  if (linhas.length === 0) return;

  try {
    await db.batch(
      linhas.map((linha) => ({
        sql: `INSERT INTO match_history
                (user_id, opponent_name, opponent_user_id, player_class, opponent_class, result)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          linha.userId, linha.opponentName, linha.opponentUserId,
          linha.playerClass, linha.opponentClass, linha.result,
        ],
      })),
      'write',
    );
  } catch (erro) {
    // Falhar ao gravar histórico nunca pode atrapalhar o fim da partida.
    console.error('[historico] falha ao gravar resultado:', erro.message);
  }
}

export async function getHistory(userId, limite = LIMITE_PADRAO) {
  const { rows } = await db.execute({
    sql: `SELECT opponent_name, player_class, opponent_class, result, created_at
            FROM match_history
           WHERE user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
    args: [userId, limite],
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
    sql: `SELECT result, COUNT(*) AS total
            FROM match_history
           WHERE user_id = ?
           GROUP BY result`,
    args: [userId],
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
