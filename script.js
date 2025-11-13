  // script.js
// Dodge The Block — updated: larger items, harder enemies, keyboard controls, responsive canvas
// Uses assets/Bomb.png, assets/Life.png, assets/Shild.png

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// HUD elements (must exist in HTML)
const restartBtn = document.getElementById('restart');
const pauseBtn = document.getElementById('pause');
const statusEl = document.getElementById('status');
const levelEl = document.getElementById('level');
const levelTimeEl = document.getElementById('levelTime');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const shieldEl = document.getElementById('shield');

// hide arrow buttons if they exist (UI cleanup)
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
if (leftBtn) leftBtn.style.display = 'none';
if (rightBtn) rightBtn.style.display = 'none';

// image assets (exact file names from your repo)
const imgBomb = new Image();
imgBomb.src = 'assets/Bomb.png';
const imgLife = new Image();
imgLife.src = 'assets/Life.png';
const imgShield = new Image();
imgShield.src = 'assets/Shild.png';

// audio helper (simple beep) - muted by default on mobile until user interaction
let audioCtx = null;
let muted = true;
function tryBeep(freq=440, dur=0.04, vol=0.05){
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch(e){}
}

// responsive canvas
function resizeCanvas(){
  // padding & max width: keep narrow central play area (compact)
  const pad = 28;
  // prefer tall mobile layout: width = min(420, window.innerWidth - pad)
  let W = Math.min(520, window.innerWidth - pad);
  // ensure not too narrow
  if (W < 300) W = Math.max(300, window.innerWidth - 20);
  // height: use most of available height minus HUD area
  let H = Math.max(480, Math.min(window.innerHeight - 160, 1100));
  canvas.width = Math.floor(W);
  canvas.height = Math.floor(H);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// CONFIG
const LANES = 4; // requested 4 lanes
const MAX_ENEMIES = 18;
const POWERUP_CHANCE = 0.06;
const MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 120;
const TRAIL_FADE = 360;

// STATE
let player = { w:44, h:44, x:0, y:0, vx:0, maxSpeed:14, accel:1.6, friction:0.84, shield:0 };
let enemies = [], powerups = [], particles = [], stars = [];
let score = 0, lives = 3, running = true, paused = false, levelIndex = 0, levelTimer = 0;
let spawnInterval = 720, fallbackTimer = 0, lastFrame = Date.now();

// LEVELS (harder than before)
const LEVELS = [
  { duration:12, spawnInterval:720, speedMul:1.3 },
  { duration:15, spawnInterval:600, speedMul:1.45 },
  { duration:18, spawnInterval:480, speedMul:1.7 },
  { duration:22, spawnInterval:420, speedMul:2.0 },
  { duration:9999, spawnInterval:360, speedMul:2.5 }
];

// init stars
function initStars(){
  stars = [];
  const n = Math.max(40, Math.floor(canvas.width * 0.06));
  for (let i=0;i<n;i++){
    stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*1.6+0.6, alpha: 0.15 + Math.random()*0.7, speed: 0.02 + Math.random()*0.07 });
  }
}
initStars();

function computeLanes(){
  const lanes = [];
  const margin = 26;
  const usable = canvas.width - margin*2;
  for (let i=0;i<LANES;i++){
    lanes.push(margin + usable * (i + 0.5) / LANES);
  }
  return lanes;
}

function setLevel(i){
  levelIndex = Math.min(i, LEVELS.length-1);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  levelTimer = LEVELS[levelIndex].duration * 1000;
  levelEl.textContent = levelIndex + 1;
  levelTimeEl.textContent = Math.ceil(levelTimer/1000);
  statusEl.textContent = 'Status: Level ' + (levelIndex+1);
}

// spawn enemy
function spawnEnemy(){
  if (enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();
  const laneIdx = Math.floor(Math.random()*LANES);
  const laneX = lanes[laneIdx];
  const eW = 20 + Math.random()*36; // larger enemies possible
  const x = Math.max(8, Math.min(laneX - eW/2, canvas.width - eW - 8));
  const base = 2.4 + Math.random()*2.6; // base speed bigger
  const size = eW;
  const r = Math.random();
  let type = 'red';
  if (r < 0.14) type = 'big';
  else if (r < 0.34) type = 'zig';
  else if (r < 0.52) type = 'home';
  // oscillation
  const phase = Math.random() * Math.PI * 2;
  const oscAmp = 10 + Math.random()*18;
  const oscSpeed = 0.006 + Math.random()*0.01;
  const e = { lane: laneIdx, x, y: -size - Math.random()*120, w: size, h: size, speed: base * LEVELS[levelIndex].speedMul, ay: 0.01 + Math.random()*0.03, type, trail: [], phase, oscAmp, oscSpeed };
  enemies.push(e);
}

// spawn powerup not near others
function spawnPowerupAt(x,y){
  if (powerups.length >= MAX_POWERUPS) return;
  for (const p of powerups){
    const dx = (p.x + p.w/2) - x;
    const dy = (p.y + p.h/2) - y;
    if (Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return;
  }
  const types = ['shield','slow','life','boom','score'];
  const t = types[Math.floor(Math.random()*types.length)];
  const size = Math.round(Math.max(34, Math.min(72, canvas.width * 0.08))); // larger on big screens
  powerups.push({ x: Math.max(8, Math.min(x, canvas.width - size - 8)), y, w: size, h: size, type: t, dy: 1.8 });
}

// add trail (scaled to enemy size)
function addTrail(e){
  e.trail = e.trail || [];
  const tsize = Math.max(6, Math.round(e.w * 0.28));
  e.trail.push({ x: e.x + e.w/2, y: e.y + e.h/2, age:0, life:TRAIL_FADE, col: (e.type==='big'?'#9fb0ff': e.type==='zig'?'#c77bff': e.type==='home'?'#ffb86b':'#ff6b6b'), size: tsize });
  if (e.trail.length > 14) e.trail.shift();
}

// particle spawns
function spawnParticles(x,y,col,count=14){
  for (let i=0;i<count;i++){
    particles.push({ x, y, vx: (Math.random()-0.5)*3, vy: (Math.random()-1.5)*-2.6, age:0, life:180 + Math.random()*400, col });
  }
}

// inputs
let touchTarget = null, holdLeft=false, holdRight=false;
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  touchTarget = t.clientX - canvas.getBoundingClientRect().left;
  // unmute on first touch
  muted = false;
  e.preventDefault();
});
canvas.addEventListener('touchmove', e => {
  const t = e.touches[0];
  touchTarget = t.clientX - canvas.getBoundingClientRect().left;
  e.preventDefault();
});
canvas.addEventListener('touchend', ()=> touchTarget = null);

// keyboard controls (PC)
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') holdLeft = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') holdRight = true;
  if (e.key === ' '){ // space toggles pause
    paused = !paused;
    pauseBtn && (pauseBtn.textContent = paused ? 'Resume' : 'Pause');
    if (paused) statusEl.textContent = 'Status: Paused'; else statusEl.textContent = 'Status: Running';
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') holdLeft = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') holdRight = false;
});

// fallback spawner
function fallbackStep(dt){
  fallbackTimer += dt;
  if (fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    // spawn on random lane top
    const lanes = computeLanes();
    const lane = lanes[Math.floor(Math.random()*lanes.length)];
    spawnEnemy();
    if (Math.random() < POWERUP_CHANCE) spawnPowerupAt(Math.random() * (canvas.width-80) + 20, -24);
    // ramp spawn a bit
    spawnInterval = Math.max(260, spawnInterval - 0.18);
  }
}

// update loop
function update(dt){
  // move stars
  for (const s of stars){
    s.y += s.speed * dt * 0.02;
    if (s.y > canvas.height + 8) s.y = -10;
  }

  // enemies
  for (let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    const lanes = computeLanes();
    const targetX = Math.max(8, Math.min(lanes[e.lane] - e.w/2, canvas.width - e.w - 8));
    // small lane correction
    e.x += (targetX - e.x) * 0.1;

    // oscillation maju-mundur
    e.phase += e.oscSpeed * dt;
    const vOsc = Math.sin(e.phase) * e.oscAmp * 0.03;

    e.speed += e.ay * (dt/16);
    e.y += e.speed * (dt/16) + vOsc;

    if (Math.random() < 0.68) addTrail(e);
    if (e.trail) for (const t of e.trail) t.age += dt;

    // collision
    if (rectIntersect(player, e) && running && !paused){
      onPlayerHit(e);
      enemies.splice(i,1);
      continue;
    }
    // offscreen
    if (e.y > canvas.height + 120){
      enemies.splice(i,1);
      score += 1;
      scoreEl.textContent = score;
    }
  }

  // powerups
  for (let i=powerups.length-1;i>=0;i--){
    const p = powerups[i];
    p.y += p.dy * (dt/16);
    if (rectIntersect(player, {x:p.x,y:p.y,w:p.w,h:p.h})){
      applyPowerup(p.type);
      powerups.splice(i,1);
      continue;
    }
    if (p.y > canvas.height + 80) powerups.splice(i,1);
  }

  // particles
  for (let i=particles.length-1;i>=0;i--){
    const t = particles[i];
    t.age += dt;
    t.x += t.vx * dt * 0.02;
    t.y += t.vy * dt * 0.02;
    if (t.age > t.life) particles.splice(i,1);
  }

  // level timer
  if (!paused && levelTimer > 0){
    levelTimer -= dt;
    levelTimeEl.textContent = Math.max(0, Math.ceil(levelTimer/1000));
    if (levelTimer <= 0){
      const next = Math.min(levelIndex + 1, LEVELS.length-1);
      setLevel(next);
      score += 6;
      scoreEl.textContent = score;
    }
  }
}

// collision tests
function rectIntersect(a,b){
  const pad = 6;
  return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad);
}

function onPlayerHit(e){
  if (player.shield > 0){
    player.shield--;
    shieldEl.textContent = player.shield;
    tryBeep(980,0.05,0.06);
    spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9be7ff', 16);
    return;
  }
  lives--;
  livesEl.textContent = lives;
  tryBeep(220,0.12,0.14);
  spawnParticles(player.x + player.w/2, player.y + player.h/2, '#ff6b6b', 26);
  if (lives <= 0){
    running = false;
    statusEl.textContent = 'GAME OVER';
  }
}

function applyPowerup(t){
  if (t === 'shield'){ player.shield = Math.min(3, player.shield + 1); shieldEl.textContent = player.shield; tryBeep(1180,0.06,0.07); }
  else if (t === 'slow'){ enemies.forEach(x => x.speed *= 0.64); tryBeep(520,0.06,0.06); }
  else if (t === 'life'){ lives = Math.min(5, lives + 1); livesEl.textContent = lives; tryBeep(960,0.06,0.06); }
  else if (t === 'boom'){ // clear small enemies
    enemies = enemies.filter(x => x.type === 'big'); spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 48); tryBeep(160,0.12,0.08);
  }
  else if (t === 'score'){ score += 12; scoreEl.textContent = score; tryBeep(1400,0.06,0.06); }
}

// draw background + stuff
function drawBackground(){
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#04051a');
  g.addColorStop(0.6,'#071028');
  g.addColorStop(1,'#021026');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // stars
  for (const s of stars){
    ctx.globalAlpha = s.alpha * 0.9;
    ctx.fillStyle = '#eaf6ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
}

function draw(){
  drawBackground();

  // particles
  for (const p of particles){
    const a = 1 - (p.age / p.life);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x, p.y, 3, 3);
    ctx.globalAlpha = 1;
  }

  // trails
  for (const e of enemies){
    if (e.trail){
      for (const t of e.trail){
        const a = 1 - (t.age / t.life);
        if (a <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(0.9, a*0.85);
        ctx.fillStyle = t.col;
        ctx.shadowBlur = Math.max(8, Math.round(e.w * 0.6));
        ctx.shadowColor = t.col;
        const w = t.size * 1.6, h = t.size * 1.6;
        ctx.fillRect(t.x - w/2, t.y - h/2, w, h);
        ctx.restore();
      }
    }
  }

  // enemies
  for (const e of enemies){
    ctx.save();
    ctx.shadowBlur = Math.max(10, Math.round(e.w * 0.6));
    if (e.type === 'big'){ ctx.fillStyle = '#33f3c2'; ctx.shadowColor = '#33f3c2'; }
    else if (e.type === 'zig'){ ctx.fillStyle = '#c377ff'; ctx.shadowColor = '#c377ff'; }
    else if (e.type === 'home'){ ctx.fillStyle = '#ffb86b'; ctx.shadowColor = '#ffb86b'; }
    else { ctx.fillStyle = '#ff6b6b'; ctx.shadowColor = '#ff6b6b'; }
    roundRect(e.x, e.y, e.w, e.h, Math.max(6, e.w/6), true);
    ctx.restore();
  }

  // powerups (draw image if loaded, fallback shapes)
  for (const p of powerups){
    let img = null;
    if (p.type === 'boom') img = imgBomb;
    else if (p.type === 'life') img = imgLife;
    else if (p.type === 'shield') img = imgShield;

    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    if (img && img.complete && img.naturalWidth > 0){
      ctx.drawImage(img, p.x, p.y, p.w, p.h);
    } else {
      // fallback: small rounded rect
      ctx.fillStyle = '#041022';
      roundRect(p.x, p.y, p.w, p.h, 8, true);
      ctx.fillStyle = '#ffd86a';
      roundRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16, 6, true);
    }
    ctx.restore();
  }

  // player
  ctx.save();
  if (player.shield > 0){
    ctx.shadowBlur = 22; ctx.shadowColor = '#7fe8ff';
  } else {
    ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.5)';
  }
  ctx.fillStyle = '#5ad2ff';
  roundRect(player.x, player.y, player.w, player.h, 10, true);
  ctx.restore();

  // HUD text (top left)
  ctx.fillStyle = '#e6eef8';
  ctx.font = '14px sans-serif';
  ctx.fillText('Time Lvl: ' + Math.max(0, Math.round(levelTimer/1000)) + 's', 12, 20);
}

// rounded rect helper
function roundRect(x,y,w,h,r,fill){
  if (typeof r === 'undefined') r = 6;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
  if (fill) ctx.fill();
}

// main loop
function loop(){
  const now = Date.now();
  const dt = Math.min(60, now - lastFrame);
  lastFrame = now;
  if (running && !paused){
    applyInput();
    fallbackStep(dt);
    update(dt);
  }
  draw();
  requestAnimationFrame(loop);
}

// input application (more sensitive)
function applyInput(){
  if (touchTarget != null){
    const target = touchTarget - player.w/2;
    const diff = target - player.x;
    player.vx += diff * 0.048; // more responsive for touch
  } else {
    if (holdLeft && !holdRight) player.vx -= player.accel * 1.2;
    else if (holdRight && !holdLeft) player.vx += player.accel * 1.2;
    else player.vx *= player.friction;
    if (Math.abs(player.vx) < 0.02) player.vx = 0;
  }
  if (player.vx > player.maxSpeed) player.vx = player.maxSpeed;
  if (player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;
  player.x += player.vx;
  if (player.x < 8){ player.x = 8; player.vx = 0; }
  if (player.x > canvas.width - player.w - 8){ player.x = canvas.width - player.w - 8; player.vx = 0; }
}

// reset & start
function resetGame(){
  resizeCanvas();
  player.x = Math.round(canvas.width/2 - player.w/2);
  player.y = canvas.height - player.h - 18;
  player.vx = 0; player.shield = 0;
  enemies = []; powerups = []; particles = [];
  initStars();
  score = 0; scoreEl.textContent = score;
  lives = 3; livesEl.textContent = lives;
  shieldEl.textContent = player.shield;
  running = true; paused = false;
  setLevel(0);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  fallbackTimer = 0;
  tryBeep(880,0.05,0.06);
}
restartBtn && restartBtn.addEventListener('click', resetGame);
pauseBtn && pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  statusEl.textContent = paused ? 'Status: Paused' : 'Status: Running';
});

// start
resetGame();
loop();

// expose for debugging
window.spawnEnemy = spawnEnemy;
window.spawnPowerup = spawnPowerupAt;
