import {
  btnOnline, btnBot, btnHowToPlay, btnLeaveQueue, btnTryTrainingMode, btnPlayAgain, btnBackToMenu, btnSwapClasses,
} from './dom.js';
import { state } from './state.js';
import { forceNextMatchTutorial, shouldStartMatchTutorial } from './tutorial/matchTutorial.js';
import { initInput } from './input.js';
import { leaveQueue as leaveNetworkQueue } from './network.js';
import { showMenu, startOnline, startBot, backToMenu } from './menu.js';
import { render } from './render.js';
import { initNicknameInput, commitNickname } from './nickname.js';
import { initOnlineClassSelect, openOnlineClassSelect } from './onlineClassSelect.js';
import { initBotClassSelect, openBotClassSelect } from './botClassSelect.js';
import { initAuthScreens, atualizarBarraDeConta } from './authScreens.js';
import { initProfile } from './profile.js';
import { initCredits } from './credits.js';
import { loadSession } from './auth.js';
import { initRanking, refreshRankingHighlight } from './ranking.js';
import { initLiveMatches } from './liveMatches.js';
import { initUiSounds } from './uiSounds.js';
import { initSoundSettings } from './soundSettings.js';
import { initMusicPlayer } from './music.js';
import { initParallax } from './parallax.js';
import { initFireCursor } from './fireCursor.js';
import { initTitleFire } from './titleFire.js';
import { ehDispositivoMobile, mostrarBloqueioMobile } from './mobileBlock.js';

// Celular/tablet: só o aviso de "jogue no computador". Nada mais é
// inicializado — em especial a música, que não deve tocar nessa tela.
if (ehDispositivoMobile()) {
  mostrarBloqueioMobile();
} else {
  iniciarJogo();
}

function iniciarJogo() {
  initInput();
  initUiSounds();
  initSoundSettings();
  initMusicPlayer();
  initParallax();
  initFireCursor();
  initTitleFire();
  initNicknameInput();
  initOnlineClassSelect();
  initBotClassSelect();
  initAuthScreens();
  initProfile();
  initCredits();
  initRanking();
  initLiveMatches();

  // Restaura a sessão do token guardado. Não bloqueia a tela: o menu já aparece
  // como convidado e troca para o estado logado quando a resposta chega.
  loadSession().then(() => {
    atualizarBarraDeConta();
    refreshRankingHighlight();
  });

  btnOnline.addEventListener('click', () => {
    if (!commitNickname()) return;
    // Primeiro acesso: pula a modal de seleção de classe e cai direto no
    // tutorial interativo (startOnline já redireciona pra partida de bot
    // nesse caso — ver shouldStartMatchTutorial em menu.js).
    if (shouldStartMatchTutorial()) {
      startOnline();
      return;
    }
    openOnlineClassSelect(startOnline);
  });
  btnBot.addEventListener('click', () => {
    if (shouldStartMatchTutorial()) {
      startBot();
      return;
    }
    openBotClassSelect(startBot);
  });
  btnHowToPlay.addEventListener('click', () => {
    forceNextMatchTutorial();
    startBot();
  });
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
  btnSwapClasses.addEventListener('click', () => {
    if (state.mode === 'online') openOnlineClassSelect(startOnline);
    else openBotClassSelect(startBot);
  });

  showMenu();
  requestAnimationFrame(render);
}
