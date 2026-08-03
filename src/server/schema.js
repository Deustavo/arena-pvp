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

  // Histórico de partidas. Uma linha por jogador logado por partida — uma
  // partida entre dois logados gera duas linhas. Partidas contra bot não são
  // gravadas (ver Match.js).
  `CREATE TABLE IF NOT EXISTS match_history (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id          TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
     opponent_name    TEXT NOT NULL,
     opponent_user_id TEXT,
     player_class     TEXT NOT NULL,
     opponent_class   TEXT NOT NULL,
     result           TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
     created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,

  `CREATE INDEX IF NOT EXISTS idx_match_history_user
     ON match_history (user_id, created_at DESC)`,
];

export async function applyAppSchema() {
  for (const sql of COMANDOS) {
    await db.execute(sql);
  }
}
