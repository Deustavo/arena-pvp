// Aplica o schema da aplicação (índice único de nome + tabela de histórico).
// As tabelas do Better Auth são criadas separadamente pela CLI dele —
// ver o script "db:migrate" no package.json.
import { applyAppSchema } from '../src/server/schema.js';
import { describeDatabase } from '../src/server/db.js';

await applyAppSchema();
console.log(`Schema da aplicação aplicado no banco ${describeDatabase()}.`);
