// script.js
// Dodge The Block - enhanced visuals (glow/trails/shadows), taller canvas, smarter spawn
// Replace your existing script.js with this file. Requires assets in /assets/: Bomb.png, Life.png, Shild.png

/* ------------- canvas setup & resize ------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas(){
  const padH = 140;
  // Taller minimum height so game area feels bigger on phones
  let W = Math.min(window.innerWidth - 24, 900);
  let H = Math.min(window.innerHeight - padH, 1600);
  if(window.innerWidth < 600) W = window.innerWidth - 20;
  canvas.width = Math.max(320, W);
  canvas.height = Math.max(600, H); // increased min height
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ------------- config & state ------------- */
const LANES = 4;
const MAX_ENEMIES = 12;
const POWERUP_CHANCE = 0.06;
const MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 160;

let player = { w:48, h:48, x:0, y:0, vx:0, maxSpeed:12, accel:1.8, friction:0.86, shield:0 };
let enemies = [], powerups = [], particles = [], stars = [];
let score = 0, lives = 3, running = true, paused = false;
let levelIndex = 0, levelTimer = 0;
let spawnInterval = 820, fallbackTimer = 0, lastFrame = Date.now();
let assets = { bomb:null, life:null, shild:null };
let assetsReady = false;

/* ------------- levels ------------- */
const LEVELS = [
  {duration:12, spawnInterval:900, speedMul:1.0},
  {duration:15, spawnInterval:780, speedMul:1.15},
  {duration:18, spawnInterval:640, speedMul:1.30},
  {duration:22, spawnInterval:520, speedMul:1.55},
  {duration:9999, spawnInterval:380, speedMul:1.9}
];
setLevel(0);
function setLevel(i){
  levelIndex = Math.min(i, LEVELS.length-1);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  levelTimer = LEVELS[levelIndex].duration * 1000;
  const lvlEl = document.getElementById('level');
  const stEl = document.getElementById('status');
  if(lvlEl) lvlEl.textContent = levelIndex+1;
  if(stEl) stEl.textContent = 'Status: Level ' + (levelIndex+1);
}

/* ------------- preload images ------------- */
function loadImg(src){ return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => { console.warn('img load fail', src); res(null); }; i.src = src; }); }
async function preloadAll(){
  const base = 'assets/';
  const [bomb, life, shild] = await Promise.all([
    loadImg(base + 'Bomb.png'),
    loadImg(base + 'Life.png'),
    loadImg(base + 'Shild.png')
  ]);
  assets.bomb = bomb;
  assets.life = life;
  assets.shild = shild;
  assetsReady = true;
  console.log('assets loaded', { bomb: !!bomb, life: !!life, shild: !!shild });
  resetGame();
}
preloadAll();

/* ------------- stars background ------------- */
function initStars(){
  stars = [];
  const n = Math.max(40, Math.floor(canvas.width * 0.06));
  for(let i=0;i<n;i++){
    stars.push({
      x: Math.random()*canvas.width,
      y: Math.random()*canvas.height,
      r: Math.random()*1.6 + 0.6,
      alpha: 0.2 + Math.random()*0.8,
      speed: 0.02 + Math.random()*0.07
    });
  }
}
initStars();

/* ------------- lanes ------------- */
function computeLanes(){
  const lanes = [];
  const margin = 28;
  const usable = canvas.width - margin*2;
  for(let i=0;i<LANES;i++) lanes.push(margin + usable*(i + 0.5)/LANES);
  return lanes;
}

/* ------------- spawn logic (smarter) ------------- */
let lastSpawnLane = -1, laneLastTime = new Array(LANES).fill(0);
function spawnEnemy(preferNearPlayer=false){
  if(enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();

  // pick lane: sometimes bias toward player's lane to force movement
  const playerLaneGuess = findClosestLane(player.x + player.w/2);
  let lane;
  if(preferNearPlayer && Math.random() < 0.7) lane = playerLaneGuess;
  else {
    lane = Math.floor(Math.random()*LANES);
    // avoid immediate repeat
    let tries = 0;
    while(tries < 8 && lane === lastSpawnLane){
      lane = Math.floor(Math.random()*LANES);
      tries++;
    }
  }

  // additional check to space out per-lane spawns
  const now = Date.now();
  if(now - laneLastTime[lane] < 300 && Math.random() < 0.6) {
    // try find other lane
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
  enemies.push({
    lane, x, y: -size - Math.random()*80, w: size, h: size, speed, ay: 0.01 + Math.random()*0.04,
    type, phase: Math.random()*Math.PI*2, oscAmp: 6 + Math.random()*20, oscSpeed: 0.004 + Math.random()*0.012,
    trail: []
  });
}
function findClosestLane(cx){
  const lanes = computeLanes();
  let best = 0, bestD = Math.abs(cx - lanes[0]);
  for(let i=1;i<lanes.length;i++){ const d = Math.abs(cx - lanes[i]); if(d < bestD){ best = i; bestD = d; } }
  return best;
}

/* ------------- powerups ------------- */
function spawnPowerupAt(x,y){
  if(powerups.length >= MAX_POWERUPS) return;
  for(const p of powerups){
    const dx = (p.x + p.w/2) - x; const dy = (p.y + p.h/2) - y;
    if(Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return;
  }
  const types = ['shild','life','bomb','score'];
  const t = types[Math.floor(Math.random()*types.length)];
  const size = Math.floor(Math.max(44, Math.min(canvas.width*0.095, 72)));
  powerups.push({ x: Math.max(8, Math.min(x, canvas.width - size - 8)), y, w: size, h: size, type: t, dy: 1.8, created: Date.now() });
}

/* ------------- trails & particles ------------- */
function addTrail(e){
  e.trail = e.trail||[];
  const tsize = Math.max(6, Math.round(e.w/4));
  e.trail.push({ x: e.x + e.w/2, y: e.y + e.h/2, age: 0, life: 420, col: (e.type==='big'?'#9fb0ff': e.type==='zig'?'#c77bff': e.type==='home'?'#ffb86b':'#ff6b6b'), size: tsize });
  if(e.trail.length > 14) e.trail.shift();
}
function spawnParticles(x,y,col,count=14){
  for(let i=0;i<count;i++){
    particles.push({
      x, y, vx:(Math.random()-0.5)*3, vy:(Math.random()-1.2)*-2.5, age:0, life: 200 + Math.random()*420, col
    });
  }
}

/* ------------- input (touch + remove arrows) ------------- */
let touchTarget = null;
document.getElementById('left')?.style && (document.getElementById('left').style.display='none');
document.getElementById('right')?.style && (document.getElementById('right').style.display='none');

canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  touchTarget = t.clientX - canvas.getBoundingClientRect().left;
  e.preventDefault();
});
canvas.addEventListener('touchmove', e => {
  const t = e.touches[0];
  touchTarget = t.clientX - canvas.getBoundingClientRect().left;
  e.preventDefault();
});
canvas.addEventListener('touchend', () => touchTarget = null);

/* ------------- fallback spawn ------------- */
function fallbackStep(dt){
  fallbackTimer += dt;
  if(fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    // choose whether spawn in/near player lane
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

/* ------------- update ------------- */
function update(dt){
  // stars
  for(const s of stars){ s.y += s.speed * dt * 0.02; if(s.y > canvas.height + 10) s.y = -10; }

  // enemies
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    const lanes = computeLanes();
    const targetX = Math.max(8, Math.min(lanes[e.lane] - e.w/2, canvas.width - e.w - 8));
    // smoother lateral movement (makes enemies align with lane)
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
    if(e.y > canvas.height + 140){ enemies.splice(i,1); score++; setText('score', score); }
  }

  // powerups
  for(let i=powerups.length-1;i>=0;i--){
    const p = powerups[i];
    p.y += p.dy * (dt/16);
    if(rectIntersect(player, {x:p.x,y:p.y,w:p.w,h:p.h})){
      applyPowerup(p.type);
      powerups.splice(i,1);
      continue;
    }
    if(p.y > canvas.height + 140) powerups.splice(i,1);
  }

  // particles
  for(let i=particles.length-1;i>=0;i--){
    const t = particles[i];
    t.age += dt;
    t.x += t.vx * dt * 0.02;
    t.y += t.vy * dt * 0.02;
    if(t.age > t.life) particles.splice(i,1);
  }

  // level timer
  if(levelTimer > 0){
    levelTimer -= dt;
    setText('levelTime', Math.max(0, Math.ceil(levelTimer/1000)));
    if(levelTimer <= 0){
      const next = Math.min(levelIndex + 1, LEVELS.length-1);
      setLevel(next);
      score += 8;
      setText('score', score);
    }
  }
}

/* ------------- collisions & powerup effects ------------- */
function rectIntersect(a,b){
  const pad = 6;
  return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad);
}
function onPlayerHit(e){
  if(player.shield > 0){
    player.shield--;
    setText('shield', player.shield);
    spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9be7ff', 18);
    return;
  }
  lives--;
  setText('lives', lives);
  spawnParticles(player.x + player.w/2, player.y + player.h/2, '#ff6b6b', 26);
  if(lives <= 0){
    running = false;
    setText('status', 'GAME OVER');
  }
}
function applyPowerup(t){
  if(t === 'shild'){
    player.shield = Math.min(3, player.shield + 1);
    setText('shield', player.shield);
    spawnParticles(player.x + player.w/2, player.y + player.h/2, '#f0f8ff', 30);
  } else if(t === 'life'){
    lives = Math.min(5, lives + 1);
    setText('lives', lives);
  } else if(t === 'bomb'){
    // remove small enemies, keep big ones as challenge
    enemies = enemies.filter(x => x.type === 'big');
    spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 60);
  } else if(t === 'score'){
    score += 12;
    setText('score', score);
  }
}

/* ------------- drawing helpers ------------- */
function drawBackground(){
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#020216'); g.addColorStop(0.55,'#061028'); g.addColorStop(1,'#041226');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);

  for(const s of stars){
    ctx.globalAlpha = Math.max(0.12, s.alpha * 0.9);
    ctx.fillStyle = '#eaf6ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
}

function roundRect(x,y,w,h,r,fill,stroke){
  if(typeof r === 'undefined') r = 6;
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

/* ------------- main draw ------------- */
function draw(){
  drawBackground();

  // particles
  for(const p of particles){
    const a = 1 - (p.age / p.life);
    if(a <= 0) continue;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x, p.y, 3, 3);
  }
  ctx.globalAlpha = 1;

  // enemy trails
  for(const e of enemies){
    if(e.trail) for(const t of e.trail){
      const a = 1 - (t.age / t.life);
      if(a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, a * 0.9);
      ctx.fillStyle = t.col;
      ctx.shadowBlur = Math.max(6, Math.round(e.w * 0.6));
      ctx.shadowColor = t.col;
      const w = t.size * 1.6, h = t.size * 1.6;
      roundRect(t.x - w/2, t.y - h/2, w, h, Math.max(4, t.size/4), true);
      ctx.restore();
    }
  }

  // enemies (glowing rounded blocks)
  for(const e of enemies){
    ctx.save();
    const blur = Math.max(14, Math.round(e.w*0.6));
    ctx.shadowBlur = blur;
    if(e.type === 'big'){ ctx.fillStyle = '#33f3c2'; ctx.shadowColor = '#33f3c2'; }
    else if(e.type === 'zig'){ ctx.fillStyle = '#c377ff'; ctx.shadowColor = '#c377ff'; }
    else if(e.type === 'home'){ ctx.fillStyle = '#ffb86b'; ctx.shadowColor = '#ffb86b'; }
    else { ctx.fillStyle = '#ff6b6b'; ctx.shadowColor = '#ff6b6b'; }
    roundRect(e.x, e.y, e.w, e.h, Math.max(6, e.w/6), true);
    ctx.restore();
  }

  // powerups: draw transparent images with shadow only (no box)
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
      if(p.type === 'life'){
        const angle = Math.sin(now * 0.0026) * 0.22;
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        const s = Math.min(canvas.width*0.12, p.w*1.05);
        ctx.drawImage(img, -s/2, -s/2, s, s);
      } else {
        const s = Math.min(canvas.width*0.12, p.w*1.05);
        ctx.drawImage(img, cx - s/2, cy - s/2, s, s);
      }
    } else {
      if(!p._warned){ console.warn('missing asset for powerup', p.type); p._warned = true; }
    }
    ctx.restore();
  }

  // player with shield glow
  ctx.save();
  if(player.shield > 0){
    ctx.shadowBlur = 28; ctx.shadowColor = '#7fe8ff';
  } else {
    ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(0,0,0,0.45)';
  }
  ctx.fillStyle = '#6bd7ff';
  roundRect(player.x, player.y, player.w, player.h, 12, true);
  ctx.restore();

  // HUD small text inside canvas top-left
  ctx.fillStyle = '#eaf6ff'; ctx.font = '14px sans-serif';
  ctx.fillText('Time Lvl: ' + Math.max(0, Math.round(levelTimer/1000)) + 's', 12, 20);
}

/* ------------- input apply (keys & touch) ------------- */
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

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

/* ------------- main loop ------------- */
function loop(){
  const now = Date.now();
  const dt = Math.min(60, now - lastFrame);
  lastFrame = now;
  if(assetsReady && running && !paused){
    applyInput();
    fallbackStep(dt);
    update(dt);
  }
  draw();
  requestAnimationFrame(loop);
}

/* ------------- utilities & reset ------------- */
function setText(id, v){ const el = document.getElementById(id); if(el) el.textContent = v; }
function resetGame(){
  resizeCanvas();
  player.x = canvas.width/2 - player.w/2; player.y = canvas.height - player.h - 18;
  player.vx = 0; player.shield = 0;
  enemies = []; powerups = []; particles = []; initStars();
  score = 0; lives = 3; running = true; paused = false;
  setText('score', score); setText('lives', lives); setText('shield', player.shield);
  setLevel(0);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  fallbackTimer = 0;
}

/* ------------- controls (buttons) ------------- */
document.getElementById('btnRestart')?.addEventListener('click', ()=> { resetGame(); });
document.getElementById('btnPause')?.addEventListener('click', ()=>{
  paused = !paused;
  document.getElementById('btnPause').textContent = paused ? 'Resume' : 'Pause';
});
document.getElementById('btnLeaderboard')?.addEventListener('click', ()=>{
  // placeholder: show local leaderboard (not implemented server-side)
  alert('Leaderboard: (placeholder) — will add SDS/store integration on request.');
});
document.getElementById('btnConnect')?.addEventListener('click', ()=>{
  // mock wallet connect
  const el = document.getElementById('walletLabel');
  if(el && el.textContent.includes('Not connected')) {
    el.textContent = 'Wallet: demo_user';
    document.getElementById('walletStatus') && (document.getElementById('walletStatus').textContent = 'Connected (mock)');
  } else {
    el && (el.textContent = 'Wallet: Not connected');
    document.getElementById('walletStatus') && (document.getElementById('walletStatus').textContent = 'Not connected');
  }
});

/* ------------- export helpers (for SDS demo triggers) ------------- */
window.spawnEnemyFromStream = spawnEnemy;
window.spawnPowerup = spawnPowerupAt;

/* ------------- start after assets ------------- */
(function waitForAssets(){
  if(!assetsReady){ setTimeout(waitForAssets, 120); return; }
  // initial enemies to show immediatelly
  for(let i=0;i<2;i++) spawnEnemy(true);
  lastFrame = Date.now();
  loop();
})();
