import { db } from './db.js';

// Ranking global de contas por vitórias — lista todo mundo que tem conta,
// do que mais venceu ao que menos venceu (inclui quem ainda não venceu
// nenhuma partida). Partidas de convidado e contra bot não entram no
// histórico (ver matchHistory.js), então nem afetam o ranking.

const LIMITE_PADRAO = 50;

export async function getRanking(limite = LIMITE_PADRAO) {
  const { rows } = await db.execute({
    sql: `SELECT u.name AS name, COALESCE(SUM(v.win), 0) AS wins
            FROM user u
            LEFT JOIN (
              SELECT player1_id AS user_id, 1 AS win FROM matches WHERE winner_index = 0
              UNION ALL
              SELECT player2_id AS user_id, 1 AS win FROM matches WHERE winner_index = 1
            ) v ON v.user_id = u.id
           GROUP BY u.id, u.name
           ORDER BY wins DESC, LOWER(u.name) ASC
           LIMIT ?`,
    args: [limite],
  });
  return rows.map((linha) => ({ name: linha.name, wins: Number(linha.wins) }));
}
