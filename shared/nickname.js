// Regras de validação/sanitização de nickname, compartilhadas entre cliente
// (formulário do menu) e servidor (parâmetro de conexão do WebSocket), para
// que as duas pontas concordem sobre o que é um nickname válido.

export const NICKNAME_MAX_LENGTH = 20;

export function sanitizeNickname(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, NICKNAME_MAX_LENGTH);
}

export function isValidNickname(raw) {
  return sanitizeNickname(raw).length > 0;
}
