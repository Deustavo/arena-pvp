// Referências centralizadas de elementos do DOM — evita repetir
// `document.getElementById` espalhado pelos módulos.

export const canvas = document.getElementById('game');
export const ctx = canvas.getContext('2d');

export const livesP0El = document.getElementById('livesP0');
export const livesP1El = document.getElementById('livesP1');
export const shieldsP0El = document.getElementById('shieldsP0');
export const shieldsP1El = document.getElementById('shieldsP1');
export const nameP0El = document.getElementById('nameP0');
export const nameP1El = document.getElementById('nameP1');
export const classNameP0El = document.getElementById('classNameP0');
export const classNameP1El = document.getElementById('classNameP1');
export const classIconP0El = document.getElementById('classIconP0');
export const classIconP1El = document.getElementById('classIconP1');
export const cooldownP0El = document.getElementById('cooldownP0');
export const cooldownP1El = document.getElementById('cooldownP1');

export const menuEl = document.getElementById('menu');
export const gameWrapEl = document.getElementById('game-wrap');
export const escHintEl = document.getElementById('escHint');
export const btnOnline = document.getElementById('btnOnline');
export const btnBot = document.getElementById('btnBot');
export const nicknameInput = document.getElementById('nicknameInput');
export const nicknameErrorEl = document.getElementById('nicknameError');
export const nicknameFieldEl = document.getElementById('nicknameField');

export const accountLoggedInEl = document.getElementById('accountLoggedIn');
export const accountLoggedOutEl = document.getElementById('accountLoggedOut');
export const accountNameEl = document.getElementById('accountName');
export const btnLogin = document.getElementById('btnLogin');
export const btnSignup = document.getElementById('btnSignup');
export const btnLogout = document.getElementById('btnLogout');
export const btnProfile = document.getElementById('btnProfile');

export const profileOverlayEl = document.getElementById('profileOverlay');
export const profileSummaryEl = document.getElementById('profileSummary');
export const profileBodyEl = document.getElementById('profileBody');
export const btnProfileClose = document.getElementById('btnProfileClose');

export const authOverlayEl = document.getElementById('authOverlay');
export const authTitleEl = document.getElementById('authTitle');
export const authFormEl = document.getElementById('authForm');
export const authFeedbackEl = document.getElementById('authFeedback');
export const authFieldNameEl = document.getElementById('authFieldName');
export const authFieldEmailEl = document.getElementById('authFieldEmail');
export const authFieldPasswordEl = document.getElementById('authFieldPassword');
export const authNameInput = document.getElementById('authName');
export const authEmailInput = document.getElementById('authEmail');
export const authPasswordInput = document.getElementById('authPassword');
export const btnAuthSubmit = document.getElementById('btnAuthSubmit');
export const btnAuthClose = document.getElementById('btnAuthClose');
export const authLinksEl = document.getElementById('authLinks');
export const btnAuthForgot = document.getElementById('btnAuthForgot');
export const btnAuthSwitch = document.getElementById('btnAuthSwitch');

export const gameOverOverlayEl = document.getElementById('gameOverOverlay');
export const gameOverMessageEl = document.getElementById('gameOverMessage');
export const btnPlayAgain = document.getElementById('btnPlayAgain');
export const btnBackToMenu = document.getElementById('btnBackToMenu');
export const btnSwapClasses = document.getElementById('btnSwapClasses');

export const waitingOverlayEl = document.getElementById('waitingOverlay');
export const btnLeaveQueue = document.getElementById('btnLeaveQueue');
export const noOpponentsMessageEl = document.getElementById('noOpponentsMessage');
export const btnTryTrainingMode = document.getElementById('btnTryTrainingMode');

export const countdownOverlayEl = document.getElementById('countdownOverlay');
export const countdownName1El = document.getElementById('countdownName1');
export const countdownName2El = document.getElementById('countdownName2');
export const countdownNumberEl = document.getElementById('countdownNumber');

export const btnHowToPlay = document.getElementById('btnHowToPlay');
export const howToPlayOverlayEl = document.getElementById('howToPlayOverlay');
export const tutCanvas = document.getElementById('tutCanvas');
export const tutCtx = tutCanvas.getContext('2d');
export const tutTitleEl = document.getElementById('tutTitle');
export const tutTextEl = document.getElementById('tutText');
export const tutDotsEl = document.getElementById('tutDots');
export const tutStepCountEl = document.getElementById('tutStepCount');
export const btnTutSkip = document.getElementById('btnTutSkip');
export const btnTutPrev = document.getElementById('btnTutPrev');
export const btnTutNext = document.getElementById('btnTutNext');
export const btnTutClose = document.getElementById('btnTutClose');

export const onlineCountValueEl = document.getElementById('onlineCountValue');

export const rankingListEl = document.getElementById('rankingList');

export const classListEl = document.getElementById('classList');
export const classPreviewEl = document.getElementById('classPreview');
export const classDetailsEl = document.getElementById('classDetails');

export const botClassOverlayEl = document.getElementById('botClassOverlay');
export const modalPlayerClassListEl = document.getElementById('modalPlayerClassList');
export const botClassListEl = document.getElementById('botClassList');
export const botDifficultyDropdownEl = document.getElementById('botDifficultyDropdown');
export const botDifficultyToggleEl = document.getElementById('botDifficultyToggle');
export const botDifficultyValueEl = document.getElementById('botDifficultyValue');
export const botDifficultyListEl = document.getElementById('botDifficultyList');
export const btnBotClassClose = document.getElementById('btnBotClassClose');
export const btnBotClassConfirm = document.getElementById('btnBotClassConfirm');

export const onlineClassOverlayEl = document.getElementById('onlineClassOverlay');
export const btnOnlineClassClose = document.getElementById('btnOnlineClassClose');
export const btnOnlineClassConfirm = document.getElementById('btnOnlineClassConfirm');
