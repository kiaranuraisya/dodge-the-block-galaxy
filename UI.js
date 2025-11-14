// ui.js  — Cartoon Casual UI layer for Dodge The Block
(function(){
  // elements
  const loadingScreen = document.getElementById('loadingScreen');
  const loaderProgress = document.getElementById('loaderProgress');
  const loaderText = document.getElementById('loaderText');
  const mainMenu = document.getElementById('mainMenu');
  const btnPlay = document.getElementById('btnPlay');
  const btnProfile = document.getElementById('btnProfile');
  const btnHow = document.getElementById('btnHow');
  const btnSettings = document.getElementById('btnSettings');
  const btnLeaderboard = document.getElementById('btnLeaderboard');
  const btnConnect = document.getElementById('btnConnect');

  const profilePanel = document.getElementById('profilePanel');
  const howPanel = document.getElementById('howPanel');
  const settingsPanel = document.getElementById('settingsPanel');
  const leaderboardPanel = document.getElementById('leaderboardPanel');

  const closeProfile = document.getElementById('closeProfile');
  const saveProfile = document.getElementById('saveProfile');
  const profileName = document.getElementById('profileName');
  const walletTopLabel = document.getElementById('walletTopLabel');
  const walletLabel = document.getElementById('walletLabel');
  const bestScoreEl = document.getElementById('bestScore');

  const closeHow = document.getElementById('closeHow');
  const closeSettings = document.getElementById('closeSettings');
  const closeLeaderboard = document.getElementById('closeLeaderboard');
  const btnPause = document.getElementById('btnPause');
  const btnRestart = document.getElementById('btnRestart');
  const btnLeaderboard2 = document.getElementById('btnLeaderboard2');
  const btnConnect2 = document.getElementById('btnConnect2');

  const loaderSteps = [
    'Loading assets...',
    'Preparing canvas...',
    'Applying styles...',
    'Almost ready...'
  ];

  // local storage keys
  const KEY_NAME = 'dtb_player_name';
  const KEY_BEST = 'dtb_best_score';
  const KEY_WALLET = 'dtb_wallet_addr';

  // variables
  let fakeProgress = 6;
  let progressIdx = 0;
  let walletAddr = localStorage.getItem(KEY_WALLET) || null;

  // show loading then menu
  function startLoading(){
    loadingScreen.classList.remove('hidden');
    loadingScreen.classList.add('visible');
    loaderProgress.style.width = fakeProgress + '%';
    loaderText.textContent = loaderSteps[0];
    const t = setInterval(()=>{
      fakeProgress += Math.random()*8;
      if(fakeProgress > 100) fakeProgress = 100;
      loaderProgress.style.width = fakeProgress + '%';
      if(fakeProgress > (progressIdx+1)*24 && progressIdx < loaderSteps.length-1){
        progressIdx++;
        loaderText.textContent = loaderSteps[progressIdx];
      }
      if(fakeProgress >= 100){
        clearInterval(t);
        setTimeout(()=>{ loadingScreen.classList.add('hidden'); openMainMenu(); }, 450);
      }
    },160);
  }

  // show/hide menu helpers
  function hideAllOverlays(){ [mainMenu,profilePanel,howPanel,settingsPanel,leaderboardPanel].forEach(el=>el.classList.add('hidden')); }
  function openMainMenu(){ hideAllOverlays(); mainMenu.classList.remove('hidden'); mainMenu.classList.add('visible'); }
  function openProfile(){ hideAllOverlays(); profilePanel.classList.remove('hidden'); profilePanel.classList.add('visible'); }
  function openHow(){ hideAllOverlays(); howPanel.classList.remove('hidden'); howPanel.classList.add('visible'); }
  function openSettings(){ hideAllOverlays(); settingsPanel.classList.remove('hidden'); settingsPanel.classList.add('visible'); }
  function openLeaderboard(){ hideAllOverlays(); leaderboardPanel.classList.remove('hidden'); leaderboardPanel.classList.add('visible'); populateLeaderboard(); }

  // profile
  function loadProfile(){
    const name = localStorage.getItem(KEY_NAME) || '';
    const best = localStorage.getItem(KEY_BEST) || '0';
    profileName.value = name;
    bestScoreEl.textContent = best;
    walletTopLabel.textContent = walletAddr ? walletAddr : 'Not connected';
    walletLabel.textContent = walletAddr ? walletAddr : 'Not connected';
  }
  saveProfile.addEventListener('click', ()=>{
    const v = profileName.value.trim();
    if(v) localStorage.setItem(KEY_NAME, v);
    alert('Profile saved');
    loadProfile();
    openMainMenu();
  });
  closeProfile.addEventListener('click', ()=> openMainMenu());

  // how
  closeHow.addEventListener('click', ()=> openMainMenu());

  // settings
  closeSettings.addEventListener('click', ()=> openMainMenu());

  // leaderboard placeholder (local)
  function populateLeaderboard(){
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';
    // show local best
    const localBest = localStorage.getItem(KEY_BEST) || 0;
    const name = localStorage.getItem(KEY_NAME) || 'You';
    const el = document.createElement('div');
    el.innerHTML = `<strong>1.</strong> ${name} — ${localBest}`;
    list.appendChild(el);
    // add some sample entries
    for(let i=2;i<=6;i++){
      const s = document.createElement('div');
      s.textContent = `${i}. Player${i} — ${Math.max(30, Math.floor(Math.random()*500))}`;
      list.appendChild(s);
    }
  }
  closeLeaderboard.addEventListener('click', ()=> openMainMenu());

  // connect wallet placeholder
  async function connectWalletFlow(){
    // placeholder: try to detect ethereum provider (metamask)
    if(window.ethereum){
      try{
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        walletAddr = accounts && accounts[0] ? accounts[0] : null;
        if(walletAddr) localStorage.setItem(KEY_WALLET, walletAddr);
        loadProfile();
        alert('Wallet connected: ' + (walletAddr || 'unknown'));
      }catch(err){
        alert('Wallet connect cancelled or failed');
      }
    } else {
      // no provider: fake connect flow
      const ask = prompt('No wallet detected. Enter an address to simulate connection (or Cancel).');
      if(ask){ walletAddr = ask.trim(); localStorage.setItem(KEY_WALLET, walletAddr); loadProfile(); alert('Wallet set (simulated)'); }
    }
  }

  // gameplay controls
  btnPlay.addEventListener('click', ()=>{
    hideAllOverlays();
    // start game: call existing resetGame if present
    if(typeof resetGame === 'function') resetGame();
    // ensure running true
    if(typeof window !== 'undefined') window.running = true;
  });

  btnProfile.addEventListener('click', ()=> { loadProfile(); openProfile(); });
  btnHow.addEventListener('click', ()=> openHow());
  btnSettings.addEventListener('click', ()=> openSettings());
  btnLeaderboard.addEventListener('click', ()=> openLeaderboard());
  btnConnect.addEventListener('click', ()=> connectWalletFlow());

  // top-right & bottom connect
  btnConnect2.addEventListener('click', ()=> connectWalletFlow());
  btnLeaderboard2.addEventListener('click', ()=> openLeaderboard());

  // pause / resume
  let paused = false;
  function doPause(){
    paused = true;
    // if the game manages running flag (most scripts do)
    if(typeof window !== 'undefined') window.running = false;
    document.getElementById('status').textContent = 'Paused';
    btnPause.textContent = 'Resume';
  }
  function doResume(){
    paused = false;
    if(typeof window !== 'undefined') window.running = true;
    document.getElementById('status').textContent = 'Ready';
    btnPause.textContent = 'Pause';
  }
  btnPause.addEventListener('click', ()=>{
    if(paused) doResume(); else doPause();
  });

  // restart
  btnRestart.addEventListener('click', ()=>{
    if(typeof resetGame === 'function') resetGame();
    if(typeof window !== 'undefined') window.running = true;
    doResume();
  });

  // other small handlers
  btnLeaderboard2.addEventListener('click', ()=> openLeaderboard());

  // when game updates score / lives, we update best
  function updateBestIfNeeded(){
    const cur = Number(document.getElementById('score').textContent || 0);
    const best = Number(localStorage.getItem(KEY_BEST) || 0);
    if(cur > best){
      localStorage.setItem(KEY_BEST, String(cur));
      bestScoreEl.textContent = cur;
    }
  }
  // periodic check
  setInterval(updateBestIfNeeded, 2000);

  // initial load
  startLoading();
  loadProfile();

  // expose helpers for game to call (if needed)
  window.UI = {
    openMainMenu,
    openProfile,
    openHow,
    openSettings,
    openLeaderboard,
    connectWalletFlow,
    updateProfileUI: loadProfile,
    pause: doPause,
    resume: doResume,
    isPaused: ()=> paused
  };

})();
