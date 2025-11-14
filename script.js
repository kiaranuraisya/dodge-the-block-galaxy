// script.js — FULL (game + pause + connect wallet) — paste replace whole file
// Requires assets in /assets/: Bomb.png, Life.png, Shild.png

/* ---------------- canvas & resize ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas(){
  const padH = 90;
  let W = Math.min(window.innerWidth - 24, 900);
  let H = Math.min(window.innerHeight - padH, 2000);
  if(window.innerWidth < 600) W = window.innerWidth - 20;
  canvas.width = Math.max(360, W);
  canvas.height = Math.max(920, H); // taller play area
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ---------------- CONFIG & STATE ---------------- */
const LANES = 4;
const MAX_ENEMIES = 24;
const POWERUP_CHANCE = 0.045;
const MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 160;

let player = { w:48, h:40, x:0, y:0, vx:0, maxSpeed:14, accel:1.8, friction:0.84, shield:0, shieldPulse:0 };
let enemies = [], powerups = [], particles = [], stars = [];
let score = 0, lives = 3, running = true, levelIndex = 0, levelTimer = 0;
let spawnInterval = 720, fallbackTimer = 0, lastFrame = Date.now();
let assets = { bomb: null, life: null, shild: null };
let assetsReady = false;

/* ---------------- LEVELS ---------------- */
const LEVELS = [
  {duration:12, spawnInterval:820, speedMul:1.05},
  {duration:15, spawnInterval:700, speedMul:1.22},
  {duration:18, spawnInterval:580, speedMul:1.4},
  {duration:22, spawnInterval:460, speedMul:1.7},
  {duration:9999, spawnInterval:340, speedMul:2.0}
];
setLevel(0);

/* ---------------- ASSET PRELOAD ---------------- */
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>{ console.warn('img load fail',src); res(null); }; i.src=src; }); }
async function preloadAll(){
  const base = 'assets/';
  const [bomb, life, shild] = await Promise.all([
    loadImg(base + 'Bomb.png'),
    loadImg(base + 'Life.png'),
    loadImg(base + 'Shild.png')
  ]);
  assets.bomb = bomb; assets.life = life; assets.shild = shild;
  console.log('assets loaded:', { bomb: !!bomb, life: !!life, shild: !!shild });
  assetsReady = true;
  resetGame();
}
preloadAll();

/* ---------------- STARFIELD ---------------- */
function initStars(){ stars = []; const n = Math.max(48, Math.floor(canvas.width * 0.06)); for(let i=0;i<n;i++) stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*1.6+0.6, alpha: 0.12+Math.random()*0.88, speed: 0.02+Math.random()*0.06 }); }
initStars();

/* ---------------- LANES ---------------- */
function computeLanes(){ const lanes=[]; const margin = 32; const usable = canvas.width - margin*2; for(let i=0;i<LANES;i++) lanes.push(Math.round(margin + usable * (i + 0.5) / LANES)); return lanes; }

/* ---------------- HELPERS ---------------- */
function setLevel(i){
  levelIndex = Math.min(i, LEVELS.length-1);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  levelTimer = LEVELS[levelIndex].duration * 1000;
  const lvlEl = document.getElementById('level'); if(lvlEl) lvlEl.textContent = levelIndex+1;
  const lt = document.getElementById('levelTime'); if(lt) lt.textContent = Math.ceil(levelTimer/1000);
  const st = document.getElementById('status'); if(st) st.textContent = 'Status: Level ' + (levelIndex+1);
}

/* ---------------- SPAWN ENEMY (target player lane) ---------------- */
let lastSpawnLane = -1, laneLastTime = new Array(LANES).fill(0);
function getPlayerLaneIndex(){
  const lanes = computeLanes();
  const cx = player.x + player.w/2;
  let best = 0, bestd = Math.abs(cx - lanes[0]);
  for(let i=1;i<lanes.length;i++){ const d = Math.abs(cx - lanes[i]); if(d < bestd){ bestd = d; best = i; } }
  return best;
}
function spawnEnemy(){
  if(enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();
  const playerLane = getPlayerLaneIndex();
  const r = Math.random();
  let lane;
  if(r < 0.7) lane = playerLane;                  // 70% target player's lane
  else if(r < 0.9){                                // 20% adjacent
    if(playerLane === 0) lane = 1;
    else if(playerLane === LANES-1) lane = LANES-2;
    else lane = playerLane + (Math.random() < 0.5 ? -1 : 1);
  } else lane = Math.floor(Math.random() * LANES); // 10% random

  // avoid flooding same lane repeatedly
  let tries = 0;
  while(lane === lastSpawnLane && tries < 6){
    lane = Math.floor(Math.random() * LANES);
    tries++;
  }
  lastSpawnLane = lane; laneLastTime[lane] = Date.now();

  const laneX = lanes[lane];
  const jitter = (Math.random()-0.5) * Math.min(18, canvas.width*0.02);
  const x = Math.max(12, Math.min(laneX - 20 + jitter, canvas.width - 48));
  const base = 2 + Math.random()*2.8;
  const speed = base * LEVELS[levelIndex].speedMul * (0.9 + Math.random()*0.6);
  const size = 20 + Math.random()*46;
  const rt = Math.random();
  let type = 'red'; if(rt < 0.12) type = 'big'; else if(rt < 0.36) type = 'zig'; else if(rt < 0.52) type = 'home';
  enemies.push({ lane, x, y: -size, w: size, h: size, speed, ay: 0.01 + Math.random()*0.04, type, phase: Math.random()*Math.PI*2, oscAmp: 6 + Math.random()*18, oscSpeed: 0.004 + Math.random()*0.012, trail: [] });
}

/* ---------------- SPAWN POWERUPS ---------------- */
function spawnPowerupAt(x,y){
  if(powerups.length >= MAX_POWERUPS) return;
  for(const p of powerups){
    const dx = (p.x + p.w/2) - x; const dy = (p.y + p.h/2) - y;
    if(Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return;
  }
  const types = ['shild','life','bomb','score'];
  const t = types[Math.floor(Math.random()*types.length)];
  const size = Math.floor(Math.max(56, Math.min(canvas.width*0.12, 100)));
  const px = Math.max(8, Math.min(x, canvas.width - size - 8));
  powerups.push({ x: px, y, w: size, h: size, type: t, dy: 1.6, created: Date.now() });
}
function spawnPowerupOnRandomLane(){
  const lanes = computeLanes();
  const laneX = lanes[Math.floor(Math.random()*lanes.length)];
  spawnPowerupAt(laneX - 20 + (Math.random()-0.5)*20, -40);
}

/* ---------------- TRAILS & PARTICLES ---------------- */
function addTrail(e){ e.trail = e.trail || []; const tsize = Math.max(6, Math.round(e.w/3)); e.trail.push({ x: e.x + e.w/2, y: e.y + e.h/2, age:0, life: 360 + e.w*4, col: (e.type==='big'?'#89f3df': e.type==='zig'?'#c77bff': e.type==='home'?'#ffd59e':'#ff8a8a'), size: tsize }); if(e.trail.length > 14) e.trail.shift(); }
function spawnParticles(x,y,col,count=12){ for(let i=0;i<count;i++) particles.push({ x, y, vx: (Math.random()-0.5)*3, vy: (Math.random()-1.5)*-2, age:0, life: 220 + Math.random()*380, col }); }

/* ---------------- INPUT (touch & keyboard) ---------------- */
let touchTarget = null;
document.getElementById('left')?.style && (document.getElementById('left').style.display='none');
document.getElementById('right')?.style && (document.getElementById('right').style.display='none');
canvas.addEventListener('touchstart', e => { const t = e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchmove', e => { const t = e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchend', () => touchTarget = null);

/* ---------------- FALLBACK SPAWN ---------------- */
function fallbackStep(dt){
  fallbackTimer += dt;
  if(fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    const count = Math.random() < 0.12 ? 2 : 1;
    for(let i=0;i<count;i++) spawnEnemy();
    if(Math.random() < POWERUP_CHANCE) spawnPowerupOnRandomLane();
    spawnInterval = Math.max(240, spawnInterval - 0.9);
  }
}

/* ---------------- UPDATE ---------------- */
function update(dt){
  for(const s of stars){ s.y += s.speed * dt * 0.02; if(s.y > canvas.height + 10) s.y = -10; }

  // enemies
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    const lanes = computeLanes();
    const targetX = Math.max(8, Math.min(lanes[e.lane] - e.w/2, canvas.width - e.w - 8));
    e.x += (targetX - e.x) * 0.08 + (Math.sin(e.phase * 1.3) * 0.025 * (e.w*0.18));
    e.phase += e.oscSpeed * dt;
    const vOsc = Math.sin(e.phase) * e.oscAmp * 0.02;
    e.speed += e.ay * (dt/16);
    e.y += e.speed * (dt/16) + vOsc;
    if(Math.random() < 0.68) addTrail(e);
    if(e.trail) for(const t of e.trail) t.age += dt;
    if(rectIntersect(player, e) && running){ onPlayerHit(e); enemies.splice(i,1); continue; }
    if(e.y > canvas.height + 160){ enemies.splice(i,1); score++; const sc = document.getElementById('score'); if(sc) sc.textContent = score; }
  }

  // powerups
  for(let i=powerups.length-1;i>=0;i--){
    const p = powerups[i];
    p.y += p.dy * (dt/16);
    if(rectIntersect(player, { x: p.x, y: p.y, w: p.w, h: p.h })){ applyPowerup(p.type); powerups.splice(i,1); continue; }
    if(p.y > canvas.height + 160) powerups.splice(i,1);
  }

  // particles
  for(let i=particles.length-1;i>=0;i--){
    const t = particles[i];
    t.age += dt; t.x += t.vx * dt * 0.02; t.y += t.vy * dt * 0.02;
    if(t.age > t.life) particles.splice(i,1);
  }

  // shield pulse
  if(player.shield > 0) player.shieldPulse += 0.04 * (dt/16); else player.shieldPulse *= 0.92;

  // level timer
  if(levelTimer > 0){
    levelTimer -= dt;
    const lt = document.getElementById('levelTime'); if(lt) lt.textContent = Math.max(0, Math.ceil(levelTimer/1000));
    if(levelTimer <= 0){ const next = Math.min(levelIndex + 1, LEVELS.length-1); setLevel(next); score += 8; const sc = document.getElementById('score'); if(sc) sc.textContent = score; }
  }
}

/* ---------------- COLLISIONS & POWERUPS ---------------- */
function rectIntersect(a,b){ const pad = 6; return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad); }
function onPlayerHit(e){
  if(player.shield > 0){
    player.shield--; const sh = document.getElementById('shield'); if(sh) sh.textContent = player.shield;
    spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9be7ff', 18);
    player.vx += (Math.random() - 0.5) * 6;
    return;
  }
  lives--; const lv = document.getElementById('lives'); if(lv) lv.textContent = lives;
  spawnParticles(player.x + player.w/2, player.y + player.h/2, '#ff6b6b', 28);
  if(lives <= 0){ running = false; const st = document.getElementById('status'); if(st) st.textContent = 'GAME OVER'; }
}
function applyPowerup(t){
  if(t === 'shild'){ player.shield = Math.min(3, player.shield + 1); const sh = document.getElementById('shield'); if(sh) sh.textContent = player.shield; spawnParticles(player.x + player.w/2, player.y + player.h/2, '#d9f9ff', 22); }
  else if(t === 'life'){ lives = Math.min(5, lives + 1); const lv = document.getElementById('lives'); if(lv) lv.textContent = lives; spawnParticles(player.x + player.w/2, player.y, '#9ff4a1', 20); }
  else if(t === 'bomb'){ enemies = enemies.filter(x => x.type === 'big'); spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 56); }
  else if(t === 'score'){ score += 14; const sc = document.getElementById('score'); if(sc) sc.textContent = score; spawnParticles(canvas.width/2, 80, '#ffd36b', 28); }
}

/* ---------------- DRAW ---------------- */
function drawBackground(){
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#020215'); g.addColorStop(0.5,'#071028'); g.addColorStop(1,'#041226');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const s of stars){ ctx.globalAlpha = s.alpha * 0.8; ctx.fillStyle = '#eaf6ff'; ctx.fillRect(s.x, s.y, s.r, s.r); }
  ctx.globalAlpha = 1;
}

function draw(){
  drawBackground();

  // particles
  for(const p of particles){ const a = 1 - (p.age / p.life); ctx.globalAlpha = Math.max(0,a); ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 3, 3); ctx.globalAlpha = 1; }

  // enemy trails
  for(const e of enemies){
    if(e.trail) for(const t of e.trail){
      const a = 1 - (t.age / t.life); if(a <= 0) continue;
      ctx.save(); ctx.globalAlpha = Math.min(0.9, a*0.9); ctx.fillStyle = t.col; ctx.shadowBlur = Math.max(6, Math.round(e.w*0.45)); ctx.shadowColor = t.col;
      const w = t.size*1.6, h = t.size*1.6;
      roundRect(t.x - w/2, t.y - h/2, w, h, Math.max(4, t.size/4), true);
      ctx.restore();
    }
  }

  // enemies
  for(const e of enemies){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = Math.max(12, Math.round(e.w*0.6));
    const eg = ctx.createLinearGradient(e.x, e.y, e.x + e.w, e.y + e.h);
    if(e.type === 'big'){ eg.addColorStop(0, '#38f3d0'); eg.addColorStop(1, '#0ed0a0'); ctx.shadowColor = '#38f3d0'; }
    else if(e.type === 'zig'){ eg.addColorStop(0, '#d49bff'); eg.addColorStop(1, '#9046ff'); ctx.shadowColor = '#c377ff'; }
    else if(e.type === 'home'){ eg.addColorStop(0, '#ffdba0'); eg.addColorStop(1, '#ffb86b'); ctx.shadowColor = '#ffb86b'; }
    else { eg.addColorStop(0, '#ff9a9a'); eg.addColorStop(1, '#ff6b6b'); ctx.shadowColor = '#ff6b6b'; }
    ctx.fillStyle = eg;
    roundRect(e.x, e.y, e.w, e.h, Math.max(6, e.w/6), true);
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffffff'; roundRect(e.x + e.w*0.10, e.y + e.h*0.06, e.w*0.38, e.h*0.26, Math.max(4, e.w/12), true);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // powerups (images only)
  const now = Date.now();
  for(const p of powerups){
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.max(12, p.w * 0.36);
    let img = null;
    if(p.type === 'life') img = assets.life;
    else if(p.type === 'shild') img = assets.shild;
    else if(p.type === 'bomb') img = assets.bomb;
    else img = assets.shild;
    if(img){
      if(p.type === 'life'){
        const angle = Math.sin(now * 0.0016 + (p.created||0)*0.0001) * 0.28;
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        const s = Math.min(canvas.width*0.18, p.w*1.35);
        ctx.drawImage(img, -s/2, -s/2, s, s);
      } else if(p.type === 'shild'){
        const pulse = 1 + Math.sin(now * 0.003 + (p.created||0)*0.0002) * 0.04;
        const s = Math.min(canvas.width*0.17, p.w*1.25) * pulse;
        ctx.drawImage(img, cx - s/2, cy - s/2, s, s);
      } else {
        const s = Math.min(canvas.width*0.17, p.w*1.25);
        ctx.drawImage(img, cx - s/2, cy - s/2, s, s);
      }
    } else {
      if(!p._warned){ console.warn('missing asset for powerup type', p.type); p._warned = true; }
    }
    ctx.restore();
  }

  // player
  ctx.save();
  const pg = ctx.createLinearGradient(player.x, player.y, player.x, player.y + player.h);
  pg.addColorStop(0, '#9ef2ff'); pg.addColorStop(1, '#39c4ff');
  ctx.fillStyle = pg;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 16;
  roundRect(player.x, player.y, player.w, player.h, 10, true);
  ctx.globalAlpha = 0.14; ctx.fillStyle = '#ffffff'; roundRect(player.x + player.w*0.08, player.y + player.h*0.06, player.w*0.44, player.h*0.26, 8, true);
  ctx.globalAlpha = 1;

  if(player.shield > 0 && assets.shild){
    ctx.save();
    const pulse = 1 + Math.sin(player.shieldPulse + Date.now()*0.002) * 0.06;
    const s = Math.max(player.w, player.h) * 2.2 * pulse;
    ctx.globalAlpha = 0.98;
    ctx.shadowColor = '#80eaff'; ctx.shadowBlur = 30 + player.shield*6;
    ctx.drawImage(assets.shild, player.x + player.w/2 - s/2, player.y + player.h/2 - s/2, s, s);
    ctx.restore();
  }
  ctx.restore();

  // HUD small text
  ctx.fillStyle = '#e6eef8'; ctx.font = '14px sans-serif';
  ctx.fillText('Time Lvl: ' + Math.max(0, Math.round(levelTimer/1000)) + 's', 12, 20);
}

function roundRect(x,y,w,h,r,fill,stroke){ if(typeof r === 'undefined') r = 6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

/* ---------------- MAIN LOOP ---------------- */
function loop(){
  const now = Date.now();
  const dt = Math.min(60, now - lastFrame);
  lastFrame = now;
  if(assetsReady && running){ applyInput(); fallbackStep(dt); update(dt); }
  draw();
  requestAnimationFrame(loop);
}

/* ---------------- INPUT MOVEMENT ---------------- */
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);
function applyInput(){
  if(touchTarget != null){
    const target = touchTarget - player.w/2;
    const diff = target - player.x;
    player.vx += diff * 0.05;
  } else {
    if(keys['ArrowLeft'] || keys['a']) player.vx -= player.accel * 1.3;
    else if(keys['ArrowRight'] || keys['d']) player.vx += player.accel * 1.3;
    else player.vx *= player.friction;
    if(Math.abs(player.vx) < 0.02) player.vx = 0;
  }
  if(player.vx > player.maxSpeed) player.vx = player.maxSpeed;
  if(player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;
  player.x += player.vx;
  if(player.x < 8){ player.x = 8; player.vx = 0; }
  if(player.x > canvas.width - player.w - 8){ player.x = canvas.width - player.w - 8; player.vx = 0; }
}

/* ---------------- RESET ---------------- */
function resetGame(){
  resizeCanvas();
  player.x = canvas.width/2 - player.w/2; player.y = canvas.height - player.h - 18;
  player.vx = 0; player.shield = 0; player.shieldPulse = 0;
  enemies = []; powerups = []; particles = []; initStars();
  score = 0; lives = 3; running = true;
  const sc = document.getElementById('score'); if(sc) sc.textContent = score;
  const lv = document.getElementById('lives'); if(lv) lv.textContent = lives;
  const sh = document.getElementById('shield'); if(sh) sh.textContent = player.shield;
  setLevel(0);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  fallbackTimer = 0;
}

/* ---------------- START WHEN READY ---------------- */
(function waitForAssets(){ if(!assetsReady){ setTimeout(waitForAssets, 120); return; } for(let i=0;i<2;i++) spawnEnemy(); loop(); })();

/* ---------------- EXPOSE API ---------------- */
window.spawnEnemyFromStream = spawnEnemy;
window.spawnPowerup = spawnPowerupAt;
window.resetGame = resetGame;

/* ---------------- PAUSE + CONNECT WALLET UI (append) ---------------- */
(function setupUIExtras(){
  // HELPERS
  function $(id){ return document.getElementById(id); }
  function shortAddr(a){ if(!a) return ''; return a.slice(0,6) + '...' + a.slice(-4); }
  function updateStatusText(txt){ const st = $('status'); if(st) st.textContent = txt; }

  // PAUSE BUTTON (support multiple ids)
  const pauseIds = ['pauseBtn','pause','btnPause'];
  let pauseBtn = null;
  for(const id of pauseIds){ const el = $(id); if(el){ pauseBtn = el; break; } }
  if(pauseBtn){
    const setPausedUI = (isPaused) => {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
      updateStatusText(isPaused ? 'Status: Paused' : 'Status: Ready');
    };
    setPausedUI(!running ? true : false);
    pauseBtn.addEventListener('click', ()=>{
      running = !running;
      setPausedUI(!running);
    });
    window.addEventListener('keydown', (e)=>{
      if(e.key === 'p' || e.key === 'P'){ running = !running; setPausedUI(!running); }
    });
  } else {
    console.warn('pause button not found (tried ids):', pauseIds);
  }

  // CONNECT WALLET BUTTON (support multiple ids)
  const connectIds = ['connectSdsBtn','connectSDS','connectWallet','connectSds','connectBtn'];
  let connectBtn = null;
  for(const id of connectIds){ const el = $(id); if(el){ connectBtn = el; break; } }

  // create walletInfo display
  let walletInfo = $('walletInfo');
  if(!walletInfo){
    walletInfo = document.createElement('div');
    walletInfo.id = 'walletInfo';
    walletInfo.style.cssText = 'position:fixed;right:12px;top:12px;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,0.35);color:#dff7ff;font-size:13px;backdrop-filter:blur(4px);z-index:9999';
    document.body.appendChild(walletInfo);
  }

  // modal helper
  function showModal(title, html){
    let modal = document.getElementById('walletModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'walletModal';
      modal.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:10000';
      modal.innerHTML = `
        <div style="width:92%;max-width:420px;padding:18px;border-radius:12px;background:#071026;color:#e6eef8;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${title}</strong>
            <button id="walletModalClose" style="background:transparent;border:0;color:#9fdcff;font-weight:700;font-size:16px;cursor:pointer">✕</button>
          </div>
          <div id="walletModalBody" style="font-size:14px;line-height:1.4"></div>
          <div style="margin-top:12px;text-align:right">
            <button id="walletModalOK" style="background:#14b8a6;border:0;padding:8px 12px;border-radius:8px;color:#021;cursor:pointer">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#walletModalClose').addEventListener('click', ()=> modal.remove());
      modal.querySelector('#walletModalOK').addEventListener('click', ()=> modal.remove());
    }
    modal.querySelector('#walletModalBody').innerHTML = html;
    modal.style.display = 'flex';
  }

  // wallet logic
  let connectedAddress = localStorage.getItem('walletAddress') || null;
  function setConnected(addr){
    connectedAddress = addr;
    if(addr) localStorage.setItem('walletAddress', addr);
    else localStorage.removeItem('walletAddress');
    if(connectBtn){
      connectBtn.textContent = addr ? ('Connected: ' + shortAddr(addr)) : 'Connect Wallet';
      connectBtn.style.opacity = addr ? '0.9' : '1';
    }
    walletInfo.textContent = addr ? ('Wallet: ' + shortAddr(addr)) : 'Wallet: Not connected';
  }
  setConnected(connectedAddress);

  async function connectWallet(){
    if(window.ethereum){
      try{
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if(accounts && accounts.length){
          setConnected(accounts[0]);
          showModal('Wallet connected', `<div>Connected to <strong>${shortAddr(accounts[0])}</strong></div><div style="margin-top:8px;font-size:13px;color:#bcd">You can now use SDK or emit events.</div>`);
        } else {
          showModal('No accounts', 'No accounts were returned by the wallet.');
        }
      }catch(err){
        showModal('Connection failed', `<pre style="white-space:pre-wrap;color:#ffd">${err.message||err}</pre>`);
      }
    } else {
      showModal('Wallet not found',
        `<div>Ethereum provider (e.g. MetaMask) not detected on this browser.</div>
         <div style="margin-top:8px;">Install MetaMask or open in a wallet-enabled browser.</div>
         <ul style="margin-top:8px;font-size:13px;color:#cde">
           <li>MetaMask: <a href="https://metamask.io/" target="_blank" style="color:#9fdcff">metamask.io</a></li>
           <li>On mobile: open via Wallet browser (MetaMask / Rainbow / Trust)</li>
         </ul>`
      );
    }
  }

  function disconnectWallet(){
    setConnected(null);
    showModal('Disconnected', 'Wallet connection cleared (local). To fully disconnect, disconnect from your wallet UI.');
  }

  // create connect button if not present
  if(!connectBtn){
    connectBtn = document.createElement('button');
    connectBtn.id = 'connectSdsBtn';
    connectBtn.textContent = connectedAddress ? ('Connected: ' + shortAddr(connectedAddress)) : 'Connect Wallet';
    connectBtn.style.cssText = 'position:fixed;left:12px;top:12px;padding:8px 12px;border-radius:10px;background:#0aa;border:0;color:#021;font-weight:700;z-index:9999;cursor:pointer';
    document.body.appendChild(connectBtn);
  }

  connectBtn.addEventListener('click', async ()=>{
    if(connectedAddress){
      showModal('Wallet', `<div>Connected: <strong>${connectedAddress}</strong></div>
        <div style="margin-top:10px;">
          <button id="modalDisconnect" style="background:#ff7b7b;border:0;padding:8px 10px;border-radius:8px;cursor:pointer">Disconnect</button>
          <button id="modalShowAddr" style="background:#14b8a6;border:0;padding:8px 10px;border-radius:8px;cursor:pointer;margin-left:8px">Copy Address</button>
        </div>`);
      setTimeout(()=>{
        const d = document.getElementById('modalDisconnect');
        const c = document.getElementById('modalShowAddr');
        if(d) d.addEventListener('click', ()=> { disconnectWallet(); document.getElementById('walletModal')?.remove(); });
        if(c) c.addEventListener('click', ()=> { navigator.clipboard?.writeText(connectedAddress); alert('Address copied'); });
      }, 60);
    } else {
      await connectWallet();
    }
  });

  if(window.ethereum && window.ethereum.on){
    window.ethereum.on('accountsChanged', function(accounts){
      if(accounts && accounts.length) setConnected(accounts[0]); else setConnected(null);
    });
  }

  // expose debug helpers
  window._gameUI = {
    connectWallet,
    disconnectWallet,
    getConnected: ()=> connectedAddress
  };
})();

/* ---------------- END OF FILE ---------------- */
