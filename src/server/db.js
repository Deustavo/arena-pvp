import fs from 'fs';
import path from 'path';
import { createClient } from '@libsql/client';

// Banco libSQL (SQLite). Em produção aponta para o Turso (libsql://...);
// em desenvolvimento, para um arquivo local (file:./data/local.db).
// Mesmo driver e mesmo dialeto SQL nos dois casos — só a URL muda.
const url = process.env.TURSO_DATABASE_URL || 'file:./data/local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

export function isRemoteDatabase() {
  return url.startsWith('libsql://') || url.startsWith('https://');
}

// O client abre a conexão já na importação, e o diretório do arquivo local não
// é versionado (nem existe num checkout limpo ou no CI). Criar antes evita que
// só importar este módulo quebre — o que derrubaria `npm test` no build.
if (!isRemoteDatabase() && url.startsWith('file:')) {
  fs.mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });
}

export const db = createClient({ url, authToken });

export function describeDatabase() {
  return isRemoteDatabase() ? `Turso (${url})` : `local (${url})`;
}
