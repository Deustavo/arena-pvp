import { db } from './db.js';

// Schema da aplicação — o que não é gerenciado pelo Better Auth.
// Todos os comandos são idempotentes (IF NOT EXISTS), então rodar de novo
// em cima de um banco já migrado é seguro.
const COMANDOS = [
  // O nome da conta é o nome exibido em partida: único, ignorando maiúsculas.
  // Este índice é a garantia real da unicidade (o hook em auth.js só existe
  // para devolver uma mensagem de erro amigável).
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_name_unico
     ON user (LOWER(name))`,

  // Histórico de partidas. Uma linha por partida (não por jogador) — os dois
  // lados ficam em colunas próprias, já que o jogo é sempre 1x1. Ao menos um
  // dos dois precisa ter conta (senão a partida nem é gravada, ver
  // matchHistory.js); o outro lado pode ser convidado (*_id nulo). Partidas
  // contra bot não são gravadas (ver Match.js).
  `CREATE TABLE IF NOT EXISTS matches (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     player1_id    TEXT REFERENCES user(id) ON DELETE CASCADE,
     player1_name  TEXT NOT NULL,
     player1_class TEXT NOT NULL,
     player2_id    TEXT REFERENCES user(id) ON DELETE CASCADE,
     player2_name  TEXT NOT NULL,
     player2_class TEXT NOT NULL,
     winner_index  INTEGER,
     created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,

  `CREATE INDEX IF NOT EXISTS idx_matches_player1
     ON matches (player1_id, created_at DESC)`,

  `CREATE INDEX IF NOT EXISTS idx_matches_player2
     ON matches (player2_id, created_at DESC)`,
];

export async function applyAppSchema() {
  for (const sql of COMANDOS) {
    await db.execute(sql);
  }
}
