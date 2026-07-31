import {
  btnOnline, btnBot, btnHowToPlay, btnLeaveQueue, btnPlayAgain, btnBackToMenu,
} from './dom.js';
import { state } from './state.js';
import { initTutorialUI, comTutorialNaPrimeiraVez, openHowToPlay } from './tutorial/tutorial.js';
import { initInput } from './input.js';
import { leaveQueue as leaveNetworkQueue } from './network.js';
import { showMenu, startOnline, startBot, backToMenu } from './menu.js';
import { render } from './render.js';
import { initNicknameInput } from './nickname.js';
import { initClassSelect } from './classSelect.js';
import { initBotClassSelect, openBotClassSelect } from './botClassSelect.js';

initTutorialUI();
initInput();
initNicknameInput();
initClassSelect();
initBotClassSelect();

btnOnline.addEventListener('click', () => comTutorialNaPrimeiraVez(startOnline));
btnBot.addEventListener('click', () => openBotClassSelect(() => comTutorialNaPrimeiraVez(startBot)));
btnHowToPlay.addEventListener('click', openHowToPlay);
btnLeaveQueue.addEventListener('click', () => leaveNetworkQueue(backToMenu));
btnPlayAgain.addEventListener('click', () => {
  if (state.mode === 'online') startOnline();
  else if (state.mode === 'bot') startBot();
});
btnBackToMenu.addEventListener('click', () => backToMenu());

showMenu();
requestAnimationFrame(render);
