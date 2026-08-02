import {
  btnOnline, btnBot, btnHowToPlay, btnLeaveQueue, btnTryTrainingMode, btnPlayAgain, btnBackToMenu, btnSwapClasses,
} from './dom.js';
import { state } from './state.js';
import { initTutorialUI, comTutorialNaPrimeiraVez, openHowToPlay } from './tutorial/tutorial.js';
import { initInput } from './input.js';
import { leaveQueue as leaveNetworkQueue } from './network.js';
import { showMenu, startOnline, startBot, backToMenu } from './menu.js';
import { render } from './render.js';
import { initNicknameInput, commitNickname } from './nickname.js';
import { initOnlineClassSelect, openOnlineClassSelect } from './onlineClassSelect.js';
import { initBotClassSelect, openBotClassSelect } from './botClassSelect.js';

initTutorialUI();
initInput();
initNicknameInput();
initOnlineClassSelect();
initBotClassSelect();

btnOnline.addEventListener('click', () => {
  if (!commitNickname()) return;
  openOnlineClassSelect(() => comTutorialNaPrimeiraVez(startOnline));
});
btnBot.addEventListener('click', () => openBotClassSelect(() => comTutorialNaPrimeiraVez(startBot)));
btnHowToPlay.addEventListener('click', openHowToPlay);
btnLeaveQueue.addEventListener('click', () => leaveNetworkQueue(backToMenu));
btnTryTrainingMode.addEventListener('click', () => {
  state.pendingTrainingRedirect = true;
  leaveNetworkQueue(backToMenu);
});
btnPlayAgain.addEventListener('click', () => {
  if (state.mode === 'online') startOnline();
  else if (state.mode === 'bot') startBot();
});
btnBackToMenu.addEventListener('click', () => backToMenu());
btnSwapClasses.addEventListener('click', () => openBotClassSelect(startBot));

showMenu();
requestAnimationFrame(render);
