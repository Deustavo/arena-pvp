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

// Nome de conta é mais restrito que nickname de convidado: como ele é único,
// persistido e exibido no ranking/perfil, só aceitamos letras comuns (sem
// acento) e números — nada de espaço, pontuação, emoji ou caractere que
// permita dois nomes visualmente iguais.
const ACCOUNT_NAME_CHARS = 'A-Za-z0-9';

export const ACCOUNT_NAME_PATTERN = new RegExp(`^[${ACCOUNT_NAME_CHARS}]+$`);

export const ACCOUNT_NAME_ERROR = 'O nome do jogador só pode ter letras (sem acento) e números, sem espaços.';

export function isValidAccountName(raw) {
  const nome = sanitizeNickname(raw);
  return nome.length > 0 && ACCOUNT_NAME_PATTERN.test(nome);
}

// Remove o que `isValidAccountName` rejeitaria. Usado pelo campo de nome no
// formulário de cadastro para o jogador não conseguir nem digitar caractere
// proibido — a validação no envio continua existindo, aqui é só a UI.
export function filterAccountNameChars(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(new RegExp(`[^${ACCOUNT_NAME_CHARS}]`, 'g'), '');
}
