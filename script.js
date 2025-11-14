// script.js
// Full game with loading, menu, profile, settings, leaderboard (localStorage)
// Uses assets in /assets/: Bomb.png, Life.png, Shild.png
// Paste as replacement for your script.js

// ----- DOM helpers -----
const $ = id => document.getElementById(id);
function show(el){ el && el.classList.remove('hidden'); }
function hide(el){ el && el.classList.add('hidden'); }

// ----- elements -----
const canvas = $('game');
const ctx = canvas.getContext('2d');
const loadingOverlay = $('loadingOverlay');
const mainMenu = $('mainMenu');
const profilePanel = $('profilePanel');
const settingsPanel = $('settingsPanel');
const leaderPanel = $('leaderPanel');
const walletLabel = $('walletLabel');

// HUD
const scoreEl = $('score');
const livesEl = $('lives');
const shieldEl = $('shield');
const statusEl = $('status');
const levelEl = $('level');
const levelTimeEl = $('levelTime');

// Buttons
const btnRestart = $('btnRestart');
const btnPause = $('btnPause');
const btnLeaderboard = $('btnLeaderboard');
const btnConnect = $('btnConnect');
const btnMenu = $('btnMenu');

// menu buttons
$('menuStart').addEventListener('click', ()=>{ hide(mainMenu); resetGame(); });
$('menuProfile').addEventListener('click', ()=>{ hide(mainMenu); show(profilePanel); });
$('menuSettings').addEventListener('click', ()=>{ hide(mainMenu); show(settingsPanel); });

// profile actions
$('closeProfile').addEventListener('click', ()=> hide(profilePanel));
$('saveProfile').addEventListener('click', ()=> {
  const name = $('profileName').value || 'Player';
  localStorage.setItem('dodge_name', name);
  alert('Profile saved: ' + name);
  hide(profilePanel);
});

// settings actions
$('closeSettings').addEventListener('click', ()=> hide(settingsPanel));

// leaderboard actions
$('closeLeader').addEventListener('click', ()=> hide(leaderPanel));
btnLeaderboard.addEventListener('click', ()=> { populateLeaderboard(); show(leaderPanel); });

// menu toggle
btnMenu.addEventListener('click', ()=> show(mainMenu));

// wallet
btnConnect.addEventListener('click', ()=> {
  if(walletLabel.textContent.includes('Not connected')){
    walletLabel.textContent = 'Wallet: demo_user';
  } else {
    walletLabel.textContent = 'Wallet: Not connected';
  }
});

// pause/restart
btnRestart.addEventListener('click', ()=> resetGame());
let paused = false;
btnPause.addEventListener('click', ()=> {
  paused = !paused;
  btnPause.textContent = paused ? 'Resume' : 'Pause';
});

// ----- canvas resize -----
function resizeCanvas(){
  const padH = 140;
  let W = Math.min(window.innerWidth - 24, 900);
  let H = Math.min(window.innerHeight - padH, 1600);
  if(window.innerWidth < 600) W = window.innerWidth - 20;
  canvas.width = Math.max(320, W);
  canvas.height = Math.max(600, H);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ----- game state & assets -----
const LANES = 4;
const MAX_ENEMIES = 12;
const POWERUP_CHANCE = 0.06;
const MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 160;

let player = { w:48, h:48, x:0, y:0, vx:0, maxSpeed:12, accel:1.8, friction:0.86, shield:0 };
let enemies = [], powerups = [], particles = [], stars = [];
let score = 0, lives = 3, running = true;
let levelIndex = 0, levelTimer = 0;
let spawnInterval = 820, fallbackTimer = 0, lastFrame = Date.now();
let assets = { bomb:null, life:null, shild:null };
let assetsReady = false;

// levels
const LEVELS = [
  {duration:12, spawnInterval:900, speedMul:1.0},
  {duration:15, spawnInterval:780, speedMul:1.15},
  {duration:18, spawnInterval:640, speedMul:1.30},
  {duration:22, spawnInterval:520, speedMul:1.55},
  {duration:9999, spawnInterval:380, speedMul:1.9}
];
function setLevel(i){
  levelIndex = Math.min(i, LEVELS.length-1);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  levelTimer = LEVELS[levelIndex].duration * 1000;
  if(levelEl) levelEl.textContent = levelIndex+1;
  if(statusEl) statusEl.textContent = 'Status: Level ' + (levelIndex+1);
}

// ----- preload images & show loading -----
function loadImg(src){ return new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => { console.warn('img fail',src); res(null); }; img.src = src; }); }

async function preloadAll(){
  show(loadingOverlay);
  const base = 'assets/';
  const [bomb, life, shild] = await Promise.all([
    loadImg(base + 'Bomb.png'),
    loadImg(base + 'Life.png'),
    loadImg(base + 'Shild.png')
  ]);
  assets.bomb = bomb; assets.life = life; assets.shild = shild;
  assetsReady = true;
  hide(loadingOverlay);
  show(mainMenu); // open main menu at start
  resetGame();
}
preloadAll();

// ----- stars -----
function initStars(){
  stars = [];
  const n = Math.max(40, Math.floor(canvas.width * 0.06));
  for(let i=0;i<n;i++){
    stars.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:Math.random()*1.6+0.6, alpha:0.2+Math.random()*0.8, speed:0.02+Math.random()*0.07 });
  }
}
initStars();

// ----- lanes -----
function computeLanes(){
  const lanes = []; const margin = 28; const usable = canvas.width - margin*2;
  for(let i=0;i<LANES;i++) lanes.push(margin + usable*(i + 0.5)/LANES);
  return lanes;
}

// ----- spawn enemy/powerup (smart) -----
let lastSpawnLane=-1, laneLastTime = new Array(LANES).fill(0);
function spawnEnemy(preferNearPlayer=false){
  if(enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();
  const playerLaneGuess = findClosestLane(player.x + player.w/2);
  let lane;
  if(preferNearPlayer && Math.random() < 0.7) lane = playerLaneGuess;
  else {
    lane = Math.floor(Math.random()*LANES);
    let tries = 0;
    while(tries < 8 && lane === lastSpawnLane){ lane = Math.floor(Math.random()*LANES); tries++; }
  }
  const now = Date.now();
  if(now - laneLastTime[lane] < 300 && Math.random() < 0.6){
    const alt = (lane + 1 + Math.floor(Math.random()*(LANES-1))) % LANES;
    lane = alt;
  }
  lastSpawnLane = lane; laneLastTime[lane] = now;
  const laneX = lanes[lane];
  const jitter = (Math.random()-0.5) * Math.min(34, canvas.width*0.04);
  const x = Math.max(12, Math.min(laneX - 22 + jitter, canvas.width - 48));
  const base = 2.4 + Math.random()*2.4;
  const speed = base * LEVELS[levelIndex].speedMul;
  const size = 20 + Math.random()*42;
  const r = Math.random();
  let type = 'red';
  if(r < 0.08) type = 'big';
  else if(r < 0.28) type = 'zig';
  else if(r < 0.44) type = 'home';
  enemies.push({ lane, x, y: -size - Math.random()*80, w:size, h:size, speed, ay:0.01 + Math.random()*0.04, type, phase:Math.random()*Math.PI*2, oscAmp:6 + Math.random()*20, oscSpeed:0.004 + Math.random()*0.012, trail:[]});
}
function findClosestLane(cx){ const lanes = computeLanes(); let best=0,bestD=Math.abs(cx-lanes[0]); for(let i=1;i<lanes.length;i++){ const d=Math.abs(cx-lanes[i]); if(d<bestD){best=i;bestD=d;} } return best; }

function spawnPowerupAt(x,y){
  if(powerups.length >= MAX_POWERUPS) return;
  for(const p of powerups){ const dx=(p.x + p.w/2)-x; const dy=(p.y + p.h/2)-y; if(Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return; }
  const types = ['shild','life','bomb','score'];
  const t = types[Math.floor(Math.random()*types.length)];
  const size = Math.floor(Math.max(44, Math.min(canvas.width*0.095, 72)));
  powerups.push({ x: Math.max(8, Math.min(x, canvas.width - size - 8)), y, w:size, h:size, type: t, dy:1.8, created:Date.now() });
}

// ----- trails/particles -----
function addTrail(e){ e.trail = e.trail||[]; const tsize = Math.max(6, Math.round(e.w/4)); e.trail.push({x:e.x+e.w/2,y:e.y+e.h/2,age:0,life:420,col:(e.type==='big'?'#9fb0ff': e.type==='zig'?'#c77bff': e.type==='home'?'#ffb86b':'#ff6b6b'), size:tsize}); if(e.trail.length>14) e.trail.shift(); }
function spawnParticles(x,y,col,count=14){ for(let i=0;i<count;i++){ particles.push({ x,y,vx:(Math.random()-0.5)*3, vy:(Math.random()-1.2)*-2.5, age:0, life:200 + Math.random()*420, col }); } }

// ----- input touch/keys -----
let touchTarget = null;
canvas.addEventListener('touchstart', e => { const t = e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchmove', e => { const t = e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchend', ()=> touchTarget = null);

const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

// ----- fallback spawn -----
function fallbackStep(dt){
  fallbackTimer += dt;
  if(fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    const bias = Math.random() < 0.5;
    spawnEnemy(bias);
    if(Math.random() < POWERUP_CHANCE){
      const lanes = computeLanes();
      const lx = lanes[Math.floor(Math.random()*lanes.length)];
      spawnPowerupAt(Math.max(16, Math.min(lx + (Math.random()-0.5)*40, canvas.width-40)), -28);
    }
    spawnInterval = Math.max(340, spawnInterval - 0.25);
  }
}

// ----- update -----
function update(dt){
  for(const s of stars){ s.y += s.speed * dt * 0.02; if(s.y > canvas.height + 10) s.y = -10; }

  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    const lanes = computeLanes();
    const targetX = Math.max(8, Math.min(lanes[e.lane] - e.w/2, canvas.width - e.w - 8));
    e.x += (targetX - e.x) * 0.06 + (Math.sin(e.phase*1.3) * 0.02 * (e.w*0.25));
    e.phase += e.oscSpeed * dt;
    const vOsc = Math.sin(e.phase) * e.oscAmp * 0.02;
    e.speed += e.ay * (dt/16);
    e.y += e.speed * (dt/16) + vOsc;
    if(Math.random() < 0.6) addTrail(e);
    if(e.trail) for(const t of e.trail) t.age += dt;

    if(rectIntersect(player, e) && running){
      onPlayerHit(e);
      enemies.splice(i,1);
      continue;
    }
    if(e.y > canvas.height + 140){ enemies.splice(i,1); score++; setText(scoreEl, score); }
  }

  for(let i=powerups.length-1;i>=0;i--){
    const p = powerups[i]; p.y += p.dy * (dt/16);
    if(rectIntersect(player, {x:p.x,y:p.y,w:p.w,h:p.h})){ applyPowerup(p.type); powerups.splice(i,1); continue; }
    if(p.y > canvas.height + 140) powerups.splice(i,1);
  }

  for(let i=particles.length-1;i>=0;i--){
    const t = particles[i]; t.age += dt; t.x += t.vx * dt * 0.02; t.y += t.vy * dt * 0.02; if(t.age > t.life) particles.splice(i,1);
  }

  if(levelTimer > 0){
    levelTimer -= dt;
    setText(levelTimeEl, Math.max(0, Math.ceil(levelTimer/1000)));
    if(levelTimer <= 0){
      const next = Math.min(levelIndex + 1, LEVELS.length-1);
      setLevel(next); score += 8; setText(scoreEl, score);
    }
  }
}

// ----- collisions & powerups -----
function rectIntersect(a,b){ const pad=6; return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad); }
function onPlayerHit(e){
  if(player.shield > 0){ player.shield--; setText(shieldEl, player.shield); spawnParticles(player.x+player.w/2, player.y+player.h/2, '#9be7ff', 18); return; }
  lives--; setText(livesEl, lives); spawnParticles(player.x+player.w/2, player.y+player.h/2, '#ff6b6b', 26);
  if(lives <= 0){ running = false; setText(statusEl, 'GAME OVER'); saveScoreToLocal(score); }
}
function applyPowerup(t){
  if(t==='shild'){ player.shield = Math.min(3, player.shield+1); setText(shieldEl, player.shield); spawnParticles(player.x+player.w/2, player.y+player.h/2, '#f0f8ff', 30); }
  else if(t==='life'){ lives = Math.min(5, lives+1); setText(livesEl, lives); }
  else if(t==='bomb'){ enemies = enemies.filter(x=> x.type === 'big'); spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 60); }
  else if(t==='score'){ score += 12; setText(scoreEl, score); }
}

// ----- drawing helpers -----
function drawBackground(){ const g = ctx.createLinearGradient(0,0,0,canvas.height); g.addColorStop(0,'#020216'); g.addColorStop(0.55,'#061028'); g.addColorStop(1,'#041226'); ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height); for(const s of stars){ ctx.globalAlpha = Math.max(0.12, s.alpha * 0.9); ctx.fillStyle = '#eaf6ff'; ctx.fillRect(s.x,s.y,s.r,s.r); } ctx.globalAlpha = 1; }
function roundRect(x,y,w,h,r,fill,stroke){ if(typeof r==='undefined') r=6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

// ----- draw main -----
function draw(){
  drawBackground();
  for(const p of particles){ const a = 1 - (p.age / p.life); if(a<=0) continue; ctx.globalAlpha = Math.max(0,a); ctx.fillStyle = p.col; ctx.fillRect(p.x,p.y,3,3); } ctx.globalAlpha = 1;

  for(const e of enemies){
    if(e.trail) for(const t of e.trail){
      const a = 1 - (t.age / t.life); if(a<=0) continue;
      ctx.save(); ctx.globalAlpha = Math.min(0.85, a*0.9); ctx.fillStyle = t.col; ctx.shadowBlur = Math.max(6, Math.round(e.w*0.6)); ctx.shadowColor = t.col; const w = t.size*1.6, h = t.size*1.6; roundRect(t.x - w/2, t.y - h/2, w, h, Math.max(4, t.size/4), true); ctx.restore();
    }
  }

  for(const e of enemies){
    ctx.save(); const blur = Math.max(14, Math.round(e.w*0.6)); ctx.shadowBlur = blur;
    if(e.type==='big'){ ctx.fillStyle='#33f3c2'; ctx.shadowColor='#33f3c2'; }
    else if(e.type==='zig'){ ctx.fillStyle='#c377ff'; ctx.shadowColor='#c377ff'; }
    else if(e.type==='home'){ ctx.fillStyle='#ffb86b'; ctx.shadowColor='#ffb86b'; }
    else { ctx.fillStyle='#ff6b6b'; ctx.shadowColor='#ff6b6b'; }
    roundRect(e.x, e.y, e.w, e.h, Math.max(6, e.w/6), true);
    ctx.restore();
  }

  const now = Date.now();
  for(const p of powerups){
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.max(12, p.w * 0.4);
    let img = null;
    if(p.type === 'life') img = assets.life;
    else if(p.type === 'shild') img = assets.shild;
    else if(p.type === 'bomb') img = assets.bomb;
    else img = assets.life;
    if(img){
      if(p.type === 'life'){ const angle = Math.sin(now * 0.0026) * 0.22; ctx.translate(cx, cy); ctx.rotate(angle); const s = Math.min(canvas.width*0.12, p.w*1.05); ctx.drawImage(img, -s/2, -s/2, s, s); }
      else { const s = Math.min(canvas.width*0.12, p.w*1.05); ctx.drawImage(img, cx - s/2, cy - s/2, s, s); }
    }
    ctx.restore();
  }

  ctx.save();
  if(player.shield>0){ ctx.shadowBlur=28; ctx.shadowColor='#7fe8ff'; } else { ctx.shadowBlur=12; ctx.shadowColor='rgba(0,0,0,0.45)'; }
  ctx.fillStyle = '#6bd7ff'; roundRect(player.x, player.y, player.w, player.h, 12, true);
  ctx.restore();

  ctx.fillStyle='#eaf6ff'; ctx.font='14px sans-serif';
  ctx.fillText('Time Lvl: ' + Math.max(0, Math.round(levelTimer/1000)) + 's', 12, 20);
}

// ----- input movement -----
function applyInput(){
  if(touchTarget != null){
    const target = touchTarget - player.w/2;
    const diff = target - player.x;
    player.vx += diff * 0.048;
  } else {
    if(keys['ArrowLeft'] || keys['a']) player.vx -= player.accel * 1.2;
    else if(keys['ArrowRight'] || keys['d']) player.vx += player.accel * 1.2;
    else player.vx *= player.friction;
    if(Math.abs(player.vx) < 0.02) player.vx = 0;
  }
  if(player.vx > player.maxSpeed) player.vx = player.maxSpeed;
  if(player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;
  player.x += player.vx;
  if(player.x < 8){ player.x = 8; player.vx = 0; }
  if(player.x > canvas.width - player.w - 8){ player.x = canvas.width - player.w - 8; player.vx = 0; }
}

// ----- main loop -----
function loop(){
  const now = Date.now();
  const dt = Math.min(60, now - lastFrame);
  lastFrame = now;
  if(assetsReady && running && !paused){ applyInput(); fallbackStep(dt); update(dt); }
  draw();
  requestAnimationFrame(loop);
}

// ----- reset/start -----
function setText(el, v){ if(el) el.textContent = v; }
function resetGame(){
  resizeCanvas();
  player.x = canvas.width/2 - player.w/2; player.y = canvas.height - player.h - 18;
  player.vx = 0; player.shield = 0;
  enemies = []; powerups = []; particles = []; initStars();
  score = 0; lives = 3; running = true; paused = false;
  setText(scoreEl, score); setText(livesEl, lives); setText(shieldEl, player.shield); setText(statusEl, 'Status: Ready');
  setLevel(0);
  spawnInterval = LEVELS[levelIndex].spawnInterval; fallbackTimer = 0;
  // spawn initial enemies to show movement
  for(let i=0;i<2;i++) spawnEnemy(true);
}
function initStars(){ stars = []; const n = Math.max(40, Math.floor(canvas.width * 0.06)); for(let i=0;i<n;i++) stars.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:Math.random()*1.6+0.6, alpha:0.2+Math.random()*0.8, speed:0.02+Math.random()*0.07 }); }

// ----- score storage (local leaderboard) -----
function saveScoreToLocal(s){
  const name = localStorage.getItem('dodge_name') || 'Player';
  const data = JSON.parse(localStorage.getItem('dodge_scores') || '[]');
  data.push({ name, score: s, ts: Date.now() });
  data.sort((a,b)=> b.score - a.score);
  localStorage.setItem('dodge_scores', JSON.stringify(data.slice(0,20)));
}
function populateLeaderboard(){
  const list = JSON.parse(localStorage.getItem('dodge_scores') || '[]');
  const container = $('leaderList');
  container.innerHTML = '';
  if(!list.length) container.innerHTML = '<div class="infoSmall">No local scores yet (play to save)</div>';
  list.forEach((it,idx) => {
    const el = document.createElement('div'); el.className = 'leaderItem';
    el.innerHTML = `<strong>${idx+1}. ${it.name}</strong> — ${it.score} <div class="infoSmall">${new Date(it.ts).toLocaleString()}</div>`;
    container.appendChild(el);
  });
}

// ----- expose helpers for SDS/demo -----
window.spawnEnemyFromStream = spawnEnemy;
window.spawnPowerup = spawnPowerupAt;

// ----- start when assets ready -----
(function waitAssets(){
  if(!assetsReady){ setTimeout(waitAssets, 120); return; }
  lastFrame = Date.now(); loop();
})();
