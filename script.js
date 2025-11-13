 // script.js — ready to paste
// Dodge The Block — larger powerups, life rotates, shield effects, responsive, fewer spawns
// Assets expected (exact names, case-sensitive): assets/Bomb.png, assets/Life.png, assets/Shild.png

// --- DOM ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const restartBtn = document.getElementById('restart');
const pauseBtn = document.getElementById('pause');
const statusEl = document.getElementById('status');
const levelEl = document.getElementById('level');
const levelTimeEl = document.getElementById('levelTime');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const shieldEl = document.getElementById('shield');

// hide on-screen arrow buttons if present
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
if (leftBtn) leftBtn.style.display = 'none';
if (rightBtn) rightBtn.style.display = 'none';

// --- audio helper (optional) ---
let audioCtx = null;
let muted = true;
function tryBeep(freq=880, dur=0.04, vol=0.06){
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch(e){}
}

// --- image loader (log on load/error) ---
function loadImg(path, name){
  const im = new Image();
  im.src = path;
  im.onload  = () => console.log('[img ok]', name, path);
  im.onerror = (e) => console.warn('[img FAIL]', name, path, e);
  return im;
}
const imgBomb   = loadImg('assets/Bomb.png',  'Bomb');
const imgLife   = loadImg('assets/Life.png',  'Life');
const imgShild  = loadImg('assets/Shild.png', 'Shild'); // note: "Shild" as requested

// --- responsive canvas ---
function resizeCanvas(){
  const pad = 28;
  let W = Math.min(520, window.innerWidth - pad);
  if (W < 320) W = Math.max(320, window.innerWidth - 20);
  let H = Math.max(520, Math.min(window.innerHeight - 140, 1200));
  canvas.width = Math.floor(W);
  canvas.height = Math.floor(H);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- CONFIG ---
const LANES = 4;
const MAX_ENEMIES = 18;
const POWERUP_CHANCE = 0.03; // rarer
const MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 160;
const TRAIL_FADE = 360;

// --- STATE ---
let player = { w:46, h:46, x:0, y:0, vx:0, maxSpeed:14, accel:1.6, friction:0.84, shield:0 };
let enemies = [], powerups = [], particles = [], stars = [];
let score = 0, lives = 3, running = true, paused = false, levelIndex = 0, levelTimer = 0;
let spawnInterval = 760, fallbackTimer = 0, lastFrame = Date.now();

// LEVELS
const LEVELS = [
  { duration:12, spawnInterval:760, speedMul:1.2 },
  { duration:15, spawnInterval:640, speedMul:1.45 },
  { duration:18, spawnInterval:520, speedMul:1.75 },
  { duration:22, spawnInterval:420, speedMul:2.05 },
  { duration:9999, spawnInterval:340, speedMul:2.6 }
];

// --- helpers ---
function computeLanes(){
  const lanes = [];
  const margin = Math.max(16, Math.round(canvas.width * 0.04));
  const usable = canvas.width - margin*2;
  for (let i=0;i<LANES;i++) lanes.push(margin + usable * (i + 0.5) / LANES);
  return lanes;
}

// stars
function initStars(){
  stars = [];
  const n = Math.max(30, Math.floor(canvas.width * 0.06));
  for (let i=0;i<n;i++){
    stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*1.8+0.6, alpha: 0.18+Math.random()*0.8, speed: 0.02+Math.random()*0.07 });
  }
}
initStars();

function setLevel(i){
  levelIndex = Math.min(i, LEVELS.length-1);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  levelTimer = LEVELS[levelIndex].duration * 1000;
  levelEl.textContent = levelIndex + 1;
  levelTimeEl.textContent = Math.ceil(levelTimer/1000);
  statusEl.textContent = 'Status: Level ' + (levelIndex+1);
}
setLevel(levelIndex);

// --- spawn enemy ---
function spawnEnemy(){
  if (enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();
  const laneIdx = Math.floor(Math.random()*LANES);
  const laneX = lanes[laneIdx];
  const size = 18 + Math.random()*40; // variable enemy size
  const x = Math.max(8, Math.min(laneX - size/2, canvas.width - size - 8));
  const base = 2.2 + Math.random()*2.6;
  const typeRand = Math.random();
  let type = 'red';
  if (typeRand < 0.14) type = 'big';
  else if (typeRand < 0.34) type = 'zig';
  else if (typeRand < 0.52) type = 'home';
  const phase = Math.random()*Math.PI*2;
  const oscAmp = 8 + Math.random()*16;
  const oscSpeed = 0.006 + Math.random()*0.01;
  enemies.push({ lane: laneIdx, x, y: -size - Math.random()*80, w: size, h: size, speed: base * LEVELS[levelIndex].speedMul, ay: 0.01 + Math.random()*0.03, type, trail: [], phase, oscAmp, oscSpeed });
}

// --- spawn powerup (size based on enemy average, rotSpeed for life) ---
function spawnPowerupAt(x,y){
  if (powerups.length >= MAX_POWERUPS) return;
  for (const p of powerups){
    const dx = (p.x + p.w/2) - x, dy = (p.y + p.h/2) - y;
    if (Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return;
  }
  // average enemy width
  let enemyAvg = 0;
  if (enemies.length){
    enemyAvg = enemies.reduce((s,e)=> s + e.w, 0) / enemies.length;
  }
  const defaultSize = Math.round(Math.max(36, Math.min(88, (enemyAvg || (canvas.width*0.08)) * 1.08)));
  const types = ['shield','slow','life','boom','score'];
  const t = types[Math.floor(Math.random()*types.length)];
  const rotSpeed = (t === 'life') ? (Math.random() * 0.003 + 0.0022) : 0;
  powerups.push({
    x: Math.max(8, Math.min(x, canvas.width - defaultSize - 8)),
    y,
    w: defaultSize,
    h: defaultSize,
    type: t,
    dy: 1.6,
    rot: 0,
    rotSpeed
  });
}

// trail & particles
function addTrail(e){
  e.trail = e.trail || [];
  const tsize = Math.max(6, Math.round(e.w * 0.28));
  e.trail.push({ x: e.x + e.w/2, y: e.y + e.h/2, age:0, life: TRAIL_FADE, col: (e.type==='big'?'#9fb0ff': e.type==='zig'?'#c77bff': e.type==='home'?'#ffb86b':'#ff6b6b'), size: tsize });
  if (e.trail.length > 14) e.trail.shift();
}
function spawnParticles(x,y,col,count=14){
  for (let i=0;i<count;i++) particles.push({ x, y, vx: (Math.random()-0.5)*3, vy:(Math.random()-1.5)*-3, age:0, life:160 + Math.random()*420, col });
}

// --- input (touch + keyboard) ---
let touchTarget = null, holdLeft = false, holdRight = false;
canvas.addEventListener('touchstart', e => { const t = e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; muted = false; e.preventDefault(); });
canvas.addEventListener('touchmove', e => { const t = e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchend', ()=> touchTarget = null);
canvas.addEventListener('mousedown', e => { touchTarget = e.clientX - canvas.getBoundingClientRect().left; });
canvas.addEventListener('mousemove', e => { if (e.buttons) touchTarget = e.clientX - canvas.getBoundingClientRect().left; });
canvas.addEventListener('mouseup', ()=> touchTarget = null);

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') holdLeft = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') holdRight = true;
  if (e.key === ' ') { paused = !paused; pauseBtn && (pauseBtn.textContent = paused ? 'Resume' : 'Pause'); statusEl.textContent = paused ? 'Status: Paused' : 'Status: Running'; }
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') holdLeft = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') holdRight = false;
});

// fallback spawn step
function fallbackStep(dt){
  fallbackTimer += dt;
  if (fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    spawnEnemy();
    if (Math.random() < POWERUP_CHANCE) spawnPowerupAt(Math.random()*(canvas.width-80)+20, -24);
    spawnInterval = Math.max(300, spawnInterval - 0.12);
  }
}

// --- update ---
function update(dt){
  for (const s of stars){ s.y += s.speed * dt * 0.02; if (s.y > canvas.height + 6) s.y = -10; }

  // enemies
  for (let i = enemies.length-1; i >= 0; i--){
    const e = enemies[i];
    const lanes = computeLanes();
    const targetX = Math.max(8, Math.min(lanes[e.lane] - e.w/2, canvas.width - e.w - 8));
    e.x += (targetX - e.x) * 0.12;
    e.phase += e.oscSpeed * dt;
    const vOsc = Math.sin(e.phase) * e.oscAmp * 0.03;
    e.speed += e.ay * (dt/16);
    e.y += e.speed * (dt/16) + vOsc;
    if (Math.random() < 0.7) addTrail(e);
    if (e.trail) for (const t of e.trail) t.age += dt;

    if (rectIntersect(player, e) && running && !paused){
      onPlayerHit(e);
      enemies.splice(i,1);
      continue;
    }
    if (e.y > canvas.height + 120){ enemies.splice(i,1); score += 1; scoreEl.textContent = score; }
  }

  // powerups
  for (let i = powerups.length-1; i >= 0; i--){
    const p = powerups[i];
    p.y += p.dy * (dt/16);
    if (p.rotSpeed) p.rot += p.rotSpeed * dt; // rotate over time (ms)
    if (rectIntersect(player, { x: p.x, y: p.y, w: p.w, h: p.h })){
      applyPowerup(p.type);
      powerups.splice(i,1);
      continue;
    }
    if (p.y > canvas.height + 120) powerups.splice(i,1);
  }

  // particles
  for (let i = particles.length-1; i>=0; i--){
    const t = particles[i];
    t.age += dt;
    t.x += t.vx * dt * 0.02; t.y += t.vy * dt * 0.02;
    if (t.age > t.life) particles.splice(i,1);
  }

  // level timer
  if (!paused && levelTimer > 0){
    levelTimer -= dt;
    levelTimeEl.textContent = Math.max(0, Math.ceil(levelTimer/1000));
    if (levelTimer <= 0){
      const next = Math.min(levelIndex + 1, LEVELS.length-1);
      setLevel(next);
      score += 8;
      scoreEl.textContent = score;
    }
  }
}

// --- collisions & powerups ---
function rectIntersect(a,b){
  const pad = 8;
  return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad);
}
function onPlayerHit(e){
  if (player.shield > 0){
    player.shield--; shieldEl.textContent = player.shield; tryBeep(980,0.05,0.06); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9be7ff', 14);
    return;
  }
  lives--; livesEl.textContent = lives; tryBeep(220,0.12,0.14); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#ff6b6b', 22);
  if (lives <= 0){ running = false; statusEl.textContent = 'GAME OVER'; }
}
function applyPowerup(t){
  if (t === 'shield'){
    player.shield = Math.min(3, player.shield + 1);
    shieldEl.textContent = player.shield;
    tryBeep(1180,0.06,0.07);
  } else if (t === 'slow'){
    enemies.forEach(x => x.speed *= 0.62);
    tryBeep(520,0.06,0.06);
  } else if (t === 'life'){
    lives = Math.min(5, lives + 1);
    livesEl.textContent = lives;
    tryBeep(960,0.06,0.06);
  } else if (t === 'boom'){
    enemies = enemies.filter(x => x.type === 'big');
    spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 42);
    tryBeep(160,0.12,0.08);
  } else if (t === 'score'){
    score += 18;
    scoreEl.textContent = score;
    tryBeep(1400,0.06,0.06);
  }
}

// --- draw ---
function drawBackground(){
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#04051a'); g.addColorStop(0.6,'#071028'); g.addColorStop(1,'#021026');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);
  for (const s of stars){ ctx.globalAlpha = s.alpha * 0.9; ctx.fillStyle = '#eaf6ff'; ctx.fillRect(s.x, s.y, s.r, s.r); }
  ctx.globalAlpha = 1;
}

function draw(){
  drawBackground();

  // particles
  for (const p of particles){ const a = 1 - (p.age / p.life); ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 3, 3); ctx.globalAlpha = 1; }

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

  // powerups (image preferred) with rotation for life
  for (const p of powerups){
    ctx.save();
    ctx.shadowBlur = Math.max(6, Math.round(p.w * 0.14));
    ctx.shadowColor = 'rgba(0,0,0,0.35)';

    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    let img = null;
    if (p.type === 'boom') img = imgBomb;
    else if (p.type === 'life') img = imgLife;
    else if (p.type === 'shield') img = imgShild;

    if (img && img.complete && img.naturalWidth > 0){
      // rotate if life
      if (p.type === 'life' && p.rotSpeed){
        ctx.translate(cx, cy);
        ctx.rotate(p.rot);
        ctx.drawImage(img, -p.w/2, -p.h/2, p.w, p.h);
        ctx.setTransform(1,0,0,1,0,0);
      } else {
        ctx.drawImage(img, p.x, p.y, p.w, p.h);
      }
    } else {
      // fallback
      ctx.fillStyle = '#041022';
      roundRect(p.x, p.y, p.w, p.h, Math.max(6, p.w/6), true);
      ctx.fillStyle = p.type === 'shield' ? '#33eaff' : p.type === 'life' ? '#6ef07a' : '#ffd86a';
      roundRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16, 6, true);
    }
    ctx.restore();
  }

  // player - 3D gradient + highlight + shield glow and small icon above when shield active
  ctx.save();
  const px = player.x, py = player.y, pw = player.w, ph = player.h;
  const grad = ctx.createLinearGradient(px, py, px, py + ph);
  grad.addColorStop(0, '#9ffaff');
  grad.addColorStop(1, '#2aa8c9');
  ctx.fillStyle = grad;

  if (player.shield > 0){
    ctx.shadowBlur = 28;
    ctx.shadowColor = '#66f0ff';
  } else {
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
  }
  roundRect(px, py, pw, ph, 10, true);

  // inner highlight for 3D feel
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(px + 6, py + 6, pw - 12, Math.round(ph/2.4), 8, true);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // small shield icon above player when shield active (no big circle)
  if (player.shield > 0 && imgShild && imgShild.complete && imgShild.naturalWidth > 0){
    const sx = Math.round(player.x + player.w/2 - player.w*0.36);
    const sy = Math.round(player.y - player.h*0.9);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(imgShild, sx, sy, Math.round(player.w*0.72), Math.round(player.h*0.72));
    ctx.restore();
  }

  // HUD small
  ctx.fillStyle = '#e6eef8'; ctx.font = '14px sans-serif';
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

// input application
function applyInput(){
  if (touchTarget != null){
    const target = touchTarget - player.w/2;
    const diff = target - player.x;
    player.vx += diff * 0.048;
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

// reset/start
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
  tryBeep(880,0.04,0.05);
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

// debug helpers
window.spawnEnemy = spawnEnemy;
window.spawnPowerup = spawnPowerupAt;
