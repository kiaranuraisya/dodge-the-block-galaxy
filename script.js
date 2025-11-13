 /* script.js
   Frontend game logic (touch/keyboard + SDS via WebSocket)
   - Expects existing canvas and some HUD elements in DOM
   - Replace previous script.js with this (or merge carefully)
*/

/* ----------------- CORE SETUP ----------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas(){
  const padW = 24, padH = 140;
  let W = Math.min(window.innerWidth - padW, 900);
  let H = Math.min(window.innerHeight - padH, 1300);
  if(window.innerWidth < 600) W = window.innerWidth - 20;
  canvas.width = Math.max(320, W);
  canvas.height = Math.max(420, H);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ----------------- SETTINGS ----------------- */
const LANES = 4;
const MAX_ENEMIES = 14;
const POWERUP_CHANCE = 0.05;    // lower chance
const MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 160;
const TRAIL_FADE = 360;
const TRAIL_BLUR_BASE = 0.62;

let player = { w:44, h:44, x:0, y:0, vx:0, maxSpeed:12, accel:1.8, friction:0.86, shild:0 };
let enemies = [], powerups = [], particles = [], stars = [];
let score = 0, lives = 3, running = true, levelIndex = 0, levelTimer = 0;
let spawnInterval = 900, fallbackTimer = 0, lastFrame = Date.now();

/* LEVELS */
const LEVELS = [
  { duration:12, spawnInterval:920, speedMul:1.0 },
  { duration:16, spawnInterval:760, speedMul:1.15 },
  { duration:20, spawnInterval:620, speedMul:1.3 },
  { duration:28, spawnInterval:520, speedMul:1.5 },
  { duration:9999, spawnInterval:420, speedMul:1.8 }
];
setLevel(0);

/* STARS */
function initStars(){ stars = []; const n = Math.max(30, Math.floor(canvas.width*0.06)); for(let i=0;i<n;i++){ stars.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:Math.random()*1.6+0.6, alpha:0.2+Math.random()*0.8, speed:0.02+Math.random()*0.08 }); } }
initStars();

/* LANES compute */
function computeLanes(){
  const lanes = [];
  const margin = 28;
  const usable = canvas.width - margin*2;
  for(let i=0;i<LANES;i++){
    lanes.push(Math.round(margin + usable * (i + 0.5) / LANES));
  }
  return lanes;
}

/* setLevel */
function setLevel(i){
  levelIndex = Math.min(i, LEVELS.length-1);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  levelTimer = LEVELS[levelIndex].duration * 1000;
  // update HUD if present
  const levelEl = document.getElementById('level');
  if(levelEl) levelEl.textContent = levelIndex + 1;
}

/* ---------- SPAWN ENEMY ---------- */
function spawnEnemy(){
  if(enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();
  const laneIdx = Math.floor(Math.random()*LANES);
  const laneX = lanes[laneIdx];
  const size = 18 + Math.random()*36; // varied size
  const base = 2 + Math.random()*2;
  const speed = base * LEVELS[levelIndex].speedMul;
  const phase = Math.random()*Math.PI*2;
  const oscAmp = 6 + Math.random()*12;
  const oscSpeed = 0.004 + Math.random()*0.009;
  const r = Math.random();
  let type = 'red';
  if(r < 0.12) type='big';
  else if(r < 0.30) type='zig';
  else if(r < 0.48) type='home';
  const e = { lane:laneIdx, x: laneX - size/2, y: -size, w:size, h:size, speed, ay:0.01 + Math.random()*0.03, type, trail:[], phase, oscAmp, oscSpeed };
  enemies.push(e);
}

/* ---------- SPAWN POWERUP (internal + SDS) ---------- */
function canPlacePowerupAt(x,y){
  for(const p of powerups){
    const dx = (p.x + p.w/2) - x;
    const dy = (p.y + p.h/2) - y;
    if(Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return false;
  }
  return true;
}
function spawnPowerupAt(x,y, kind){
  if(powerups.length >= MAX_POWERUPS) return;
  // if SDS calls with lane x maybe exact; ensure inside canvas
  const size = Math.max(32, Math.round((Math.random()*18) + 40)); // larger than before
  const px = Math.max(8, Math.min(x, canvas.width - size - 8));
  if(!canPlacePowerupAt(px,y)) return;
  powerups.push({ x: px, y, w:size, h:size, type: kind || 'score', dy:1.4, spin: Math.random()*0.04 + 0.01 });
}

/* ---------- PARTICLES ---------- */
function spawnParticles(x,y,col,count=12){
  for(let i=0;i<count;i++){
    particles.push({ x, y, vx:(Math.random()-0.5)*2, vy:(Math.random()-1.8)*-2, age:0, life:200+Math.random()*500, col });
  }
}

/* ---------- COLLISION ---------- */
function rectIntersect(a,b){
  const pad = 6;
  return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad);
}
function onPlayerHit(e){
  if(player.shild > 0){
    player.shild--; updateHUD(); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9be7ff', 12);
    // shield absorbs -> keep playing
    return;
  }
  lives--; updateHUD(); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#ff6b6b', 24);
  if(lives <= 0){
    running = false;
    const s = document.getElementById('status'); if(s) s.textContent = 'GAME OVER';
  }
}

/* ---------- POWERUP APPLY ---------- */
function applyPowerup(t){
  if(t === 'shild' || t === 'shield'){
    player.shild = Math.min(3, player.shild + 1);
    updateHUD();
    spawnParticles(player.x + player.w/2, player.y + player.h/2, '#33eaff', 10);
  }else if(t === 'life' || t === 'lifeplus'){
    lives = Math.min(5, lives + 1);
    updateHUD();
    spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9ef07a', 12);
  }else if(t === 'boom'){
    // remove non-big enemies
    enemies = enemies.filter(x => x.type === 'big');
    spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 40);
  }else if(t === 'score'){
    score += 10; updateHUD();
  }
}

/* ---------- DRAW ---------- */
function drawBackground(){
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0, '#020215');
  g.addColorStop(0.5, '#071028');
  g.addColorStop(1, '#041226');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const s of stars){
    ctx.globalAlpha = s.alpha * 0.9;
    ctx.fillStyle = '#eaf6ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
}

function roundRect(x,y,w,h,r,fill){
  if(typeof r==='undefined') r=6;
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
  if(fill) ctx.fill();
}

/* main draw */
function draw(){
  drawBackground();

  // particles
  for(const p of particles){
    const a = 1 - (p.age / p.life);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x, p.y, 3, 3);
    ctx.globalAlpha = 1;
  }

  // trails
  for(const e of enemies){
    if(e.trail){
      for(const t of e.trail){
        const a = 1 - (t.age / t.life);
        if(a <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(0.85, a*0.9);
        ctx.fillStyle = t.col;
        ctx.shadowBlur = Math.max(6, Math.round(e.w * TRAIL_BLUR_BASE));
        ctx.shadowColor = t.col;
        const w = t.size * 1.6;
        ctx.fillRect(t.x - w/2, t.y - w/2, w, w); // square trail for style
        ctx.restore();
      }
    }
  }

  // enemies
  for(const e of enemies){
    ctx.save();
    ctx.shadowBlur = Math.max(10, Math.round(e.w * 0.6));
    if(e.type === 'big'){ ctx.fillStyle = '#33f3c2'; ctx.shadowColor = '#33f3c2'; }
    else if(e.type === 'zig'){ ctx.fillStyle = '#c377ff'; ctx.shadowColor = '#c377ff'; }
    else if(e.type === 'home'){ ctx.fillStyle = '#ffb86b'; ctx.shadowColor = '#ffb86b'; }
    else { ctx.fillStyle = '#ff6b6b'; ctx.shadowColor = '#ff6b6b'; }
    roundRect(e.x, e.y, e.w, e.h, Math.max(6, e.w/6), true);
    ctx.restore();
  }

  // powerups: draw image if asset available (prefer images in assets/), else simple rounded square
  for(const p of powerups){
    ctx.save();
    // slight 3D: inner shadow and outer glow scaled to size
    ctx.shadowBlur = Math.max(6, Math.round(p.w*0.16));
    const neon = (p.type==='shild')? '#ffd86a' : (p.type==='life')? '#6ef07a' : (p.type==='bomb')? '#ff7b7b' : '#ffd86a';
    ctx.shadowColor = neon;
    // if image exist in window assets map use that, else draw shape
    if(window.__ASSETS && window.__ASSETS[p.type]){
      const img = window.__ASSETS[p.type];
      const drawW = p.w; const drawH = p.h;
      // rotate life slowly
      ctx.translate(p.x + drawW/2, p.y + drawH/2);
      if(p.type === 'life') ctx.rotate((performance.now() * p.spin) % (Math.PI*2));
      ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);
      ctx.setTransform(1,0,0,1,0,0);
    }else{
      // fallback shape (rounded square filled neon with small inner plate)
      ctx.fillStyle = '#041022';
      roundRect(p.x, p.y, p.w, p.h, 8, true);
      ctx.fillStyle = neon;
      roundRect(p.x+6, p.y+6, p.w-12, p.h-12, 6, true);
      // simple icon
      ctx.fillStyle = '#041020'; ctx.font = `${Math.floor(p.w/2)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let icon = '★';
      if(p.type==='shild') icon = '🛡';
      else if(p.type==='life') icon = '+';
      else if(p.type==='bomb') icon = '💣';
      ctx.fillText(icon, p.x + p.w/2, p.y + p.h/2 + 2);
      ctx.textAlign = 'start';
    }
    ctx.restore();
  }

  // player - show shield effect if active
  ctx.save();
  if(player.shild > 0){
    ctx.shadowBlur = 28;
    ctx.shadowColor = '#7fe8ff';
    // slight 3D bevel
    ctx.fillStyle = '#6bd7ff';
    roundRect(player.x, player.y, player.w, player.h, 8, true);
    // inner lighter plate
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(player.x+6, player.y+6, player.w-12, player.h-12, 6, true);
  } else {
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.fillStyle = '#6bd7ff';
    roundRect(player.x, player.y, player.w, player.h, 8, true);
  }
  ctx.restore();

  // HUD text in-canvas
  ctx.fillStyle = '#e6eef8';
  ctx.font = '14px sans-serif';
  ctx.fillText('Time Lvl: ' + Math.max(0, Math.round(levelTimer/1000)) + 's', 12, 20);
}

/* ---------- UPDATE ---------- */
function update(dt){
  // stars drift
  for(const s of stars){
    s.y += s.speed * dt * 0.02;
    if(s.y > canvas.height + 10) s.y = -10;
  }

  // enemies update
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    const lanes = computeLanes();
    const targetX = Math.max(8, Math.min(lanes[e.lane] - e.w/2, canvas.width - e.w - 8));
    e.x += (targetX - e.x) * 0.08;
    e.phase += e.oscSpeed * dt;
    const vOsc = Math.sin(e.phase) * e.oscAmp * 0.02;
    e.speed += e.ay * (dt/16);
    e.y += e.speed * (dt/16) + vOsc;
    // add trail semi-regular
    if(Math.random() < 0.58) addTrail(e);
    if(e.trail) for(const t of e.trail) t.age += dt;
    // collision
    if(rectIntersect(player, e) && running){
      onPlayerHit(e);
      enemies.splice(i,1);
      continue;
    }
    if(e.y > canvas.height + 100){ enemies.splice(i,1); score++; updateHUD(); }
  }

  // powerups
  for(let i=powerups.length-1;i>=0;i--){
    const p = powerups[i];
    p.y += p.dy * (dt/16);
    // rotate life if present (spin applied in draw via p.spin)
    if(rectIntersect(player, {x:p.x,y:p.y,w:p.w,h:p.h})){
      applyPowerup(p.type);
      powerups.splice(i,1);
      continue;
    }
    if(p.y > canvas.height + 80) powerups.splice(i,1);
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
    if(levelTimer <= 0){
      const next = Math.min(levelIndex + 1, LEVELS.length-1);
      setLevel(next);
      score += 8; updateHUD();
    }
  }
}

/* add trail for enemy */
function addTrail(e){
  e.trail = e.trail || [];
  const tsize = Math.max(4, Math.round(e.w/5));
  e.trail.push({ x: e.x + e.w/2, y: e.y + e.h/2, age:0, life:TRAIL_FADE, col: (e.type==='big'?'#9fb0ff': e.type==='zig'?'#c77bff': e.type==='home'?'#ffb86b':'#ff6b6b'), size: tsize });
  if(e.trail.length > 12) e.trail.shift();
}

/* ---------- INPUT: mobile touch + keyboard for PC ---------- */
let touchTarget = null;
canvas.addEventListener('touchstart', e => { const t = e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchmove', e => { const t = e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchend', ()=>{ touchTarget = null; });
let holdLeft=false, holdRight=false;
document.addEventListener('keydown', (ev) => {
  if(ev.key === 'ArrowLeft' || ev.key === 'a') holdLeft = true;
  if(ev.key === 'ArrowRight' || ev.key === 'd') holdRight = true;
});
document.addEventListener('keyup', (ev) => {
  if(ev.key === 'ArrowLeft' || ev.key === 'a') holdLeft = false;
  if(ev.key === 'ArrowRight' || ev.key === 'd') holdRight = false;
});

/* apply input move */
function applyInput(){
  if(touchTarget != null){
    const target = touchTarget - player.w/2;
    const diff = target - player.x;
    player.vx += diff * 0.045;
  } else {
    if(holdLeft && !holdRight) player.vx -= player.accel * 1.6;
    else if(holdRight && !holdLeft) player.vx += player.accel * 1.6;
    else player.vx *= player.friction;
    if(Math.abs(player.vx) < 0.02) player.vx = 0;
  }
  if(player.vx > player.maxSpeed) player.vx = player.maxSpeed;
  if(player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;
  player.x += player.vx;
  if(player.x < 8){ player.x = 8; player.vx = 0; }
  if(player.x > canvas.width - player.w - 8){ player.x = canvas.width - player.w - 8; player.vx = 0; }
}

/* ---------- FALLBACK SPAWN ---------- */
function fallbackStep(dt){
  fallbackTimer += dt;
  if(fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    spawnEnemy();
    // lower chance for powerup spawn in fallback
    if(Math.random() < POWERUP_CHANCE){
      const lanes = computeLanes();
      const lx = lanes[Math.floor(Math.random()*LANES)] - 20;
      spawnPowerupAt(lx, -32, (Math.random()<0.35)? 'shild' : (Math.random()<0.6)? 'life' : 'score');
    }
    spawnInterval = Math.max(420, spawnInterval - 0.18); // slightly decrease over time
  }
}

/* ---------- GAME LOOP ---------- */
function updateHUD(){
  const scoreEl = document.getElementById('score'); if(scoreEl) scoreEl.textContent = score;
  const livesEl = document.getElementById('lives'); if(livesEl) livesEl.textContent = lives;
  const shieldEl = document.getElementById('shield'); if(shieldEl) shieldEl.textContent = player.shild;
}
function loop(){
  const now = Date.now();
  const dt = Math.min(60, now - lastFrame);
  lastFrame = now;
  if(running){
    applyInput();
    fallbackStep(dt);
    update(dt);
  }
  draw();
  requestAnimationFrame(loop);
}

/* ---------- INIT / RESET ---------- */
function resetGame(){
  resizeCanvas();
  player.x = canvas.width/2 - player.w/2;
  player.y = canvas.height - player.h - 18;
  player.vx = 0; player.shild = 0;
  enemies = []; powerups = []; particles = []; stars = [];
  initStars();
  score = 0; lives = 3; running = true;
  setLevel(0);
  fallbackTimer = 0;
  updateHUD();
}
resetGame();
loop();

/* ---------- ASSETS: optional images from repo assets/ ---------- */
/* If you uploaded images to repo (assets/Bomb.png, assets/Life.png, assets/Shild.png),
   pre-load them and map to window.__ASSETS by type name (bomb, life, shild).
*/
window.__ASSETS = window.__ASSETS || {};
function loadAsset(name, url, key){
  const img = new Image();
  img.onload = ()=> { window.__ASSETS[key] = img; console.log('asset loaded', key); };
  img.onerror = ()=> { console.warn('asset load failed', url); };
  img.src = url;
}
// try load typical filenames (adjust if yours different)
loadAsset('bomb','/assets/Bomb.png','bomb');
loadAsset('life','/assets/Life.png','life');
loadAsset('shild','/assets/Shird.png','shild'); // you named Shield -> Shird/rename? ensure filename

/* ---------- WEBSOCKET SDS LISTENER ---------- */
/* NOTE: set correct WS_URL for your deployed server. For local testing set to ws://localhost:3000 */
const WS_URL_OVERRIDE = null; // if you want to force ws (like 'ws://localhost:3000')
const defaultWs = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.hostname || 'localhost') + ':3000';
const WS_URL = WS_URL_OVERRIDE || defaultWs;
let socket = null;
function connectWS(){
  try{
    socket = new WebSocket(WS_URL);
  }catch(e){
    console.warn('WS connect error', e);
    setTimeout(connectWS,2000);
    return;
  }
  socket.addEventListener('open', ()=> {
    console.log('WS connected', WS_URL);
  });
  socket.addEventListener('message', (ev) => {
    try{
      const d = JSON.parse(ev.data);
      if(d.type === 'sds-event'){
        onSdsEvent(d.eventId, d.payload);
      }
    }catch(e){}
  });
  socket.addEventListener('close', ()=> {
    console.log('WS disconnected; reconnect in 2s');
    setTimeout(connectWS,2000);
  });
}
connectWS();

// handle incoming SDS events
function onSdsEvent(eventId, payload){
  // We expect payload e.g. { kind: 'shild'|'life'|'bomb'|'score', lane: 0..3, x: optional }
  if(eventId === 'game-powerup' || eventId === 'powerup'){
    const kind = payload.kind || 'score';
    let lane = (typeof payload.lane === 'number') ? payload.lane : Math.floor(Math.random()*LANES);
    lane = Math.max(0, Math.min(LANES-1, lane));
    const lanes = computeLanes();
    const x = (payload.x != null) ? payload.x : lanes[lane] - 28;
    spawnPowerupAt(x, -48, kind);
  } else if(eventId === 'leaderboard'){
    // optional: update leaderboard UI
    // updateLeaderboard(payload);
  }
}

/* expose small API for debugging */
window.spawnEnemyFromStream = spawnEnemy;
window.spawnPowerup = spawnPowerupAt;
