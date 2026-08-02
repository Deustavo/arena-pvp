// Reposiciona um `.dropdown-menu` como `position: fixed`, ancorado ao seu
// `toggle`, escolhendo abrir para baixo ou para cima conforme o espaço
// disponível na viewport (independente de onde a modal esteja centralizada),
// e limita a altura ao espaço real restante para garantir que todos os
// itens fiquem alcançáveis por scroll em telas pequenas.
const VIEWPORT_MARGIN = 24;
const GAP = 6;
const MIN_USABLE_HEIGHT = 80;

export function positionDropdownMenu(toggle, menu) {
  const rect = toggle.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - VIEWPORT_MARGIN;

  menu.style.position = 'fixed';
  menu.style.left = `${rect.left}px`;
  menu.style.width = `${rect.width}px`;

  if (spaceBelow >= MIN_USABLE_HEIGHT || spaceBelow >= spaceAbove) {
    menu.style.top = `${rect.bottom + GAP}px`;
    menu.style.bottom = '';
    menu.style.maxHeight = `${Math.max(spaceBelow, MIN_USABLE_HEIGHT)}px`;
  } else {
    menu.style.top = '';
    menu.style.bottom = `${window.innerHeight - rect.top + GAP}px`;
    menu.style.maxHeight = `${Math.max(spaceAbove, MIN_USABLE_HEIGHT)}px`;
  }
}

export function resetDropdownMenu(menu) {
  menu.style.position = '';
  menu.style.left = '';
  menu.style.top = '';
  menu.style.bottom = '';
  menu.style.width = '';
  menu.style.maxHeight = '';
}
