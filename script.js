 // script.js (replace existing file with this)
// Dodge The Block — updated visuals: larger items, rotate life, shild effect, rarer powerups

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const pauseBtn = document.getElementById('pause');
const restartBtn = document.getElementById('restart');
const levelEl = document.getElementById('level');
const levelTimeEl = document.getElementById('levelTime');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const shieldEl = document.getElementById('shild') || document.getElementById('shield'); // try both
const statusEl = document.getElementById('status');

let audioCtx = null, muted = false;
document.getElementById('mute')?.addEventListener('click', ()=> muted = !muted);

function tryBeep(freq=440,d=0.04,v=0.06){
  if(muted) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type='sine'; o.frequency.value = freq; g.gain.value = v;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + d);
  }catch(e){}
}

// --- responsive canvas ---
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

// --- assets (change paths if needed) ---
const ASSET_BOMB = 'assets/Bomb.png';
const ASSET_LIFE = 'assets/Life.png';
const ASSET_SHILD = 'assets/Shild.png';

const imgBomb = new Image();
imgBomb.src = ASSET_BOMB;
const imgLife = new Image();
imgLife.src = ASSET_LIFE;
const imgShild = new Image();
imgShild.src = ASSET_SHILD;

imgBomb.onerror = ()=>{/* ignore if missing */};
imgLife.onerror = ()=>{/* ignore if missing */};
imgShild.onerror = ()=>{/* ignore if missing */};

// --- config/state ---
const LANES = 4;
const MAX_ENEMIES = 18;
const POWERUP_CHANCE = 0.035;    // rarer
const MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 140;
const TRAIL_FADE = 360;
const TRAIL_BLUR_BASE = 0.6;

let player = {w:44,h:44,x:0,y:0,vx:0,maxSpeed:12,accel:1.8,friction:0.86,shild:0};
let enemies = [], powerups = [], trailParticles = [], stars = [];
let score=0, lives=3, running=true, levelIndex=0, levelTimer=0;
let spawnInterval=900, fallbackTimer=0, last=Date.now();

// levels
const LEVELS = [
  {duration:12, spawnInterval:900, speedMul:1.0},
  {duration:15, spawnInterval:760, speedMul:1.15},
  {duration:18, spawnInterval:620, speedMul:1.3},
  {duration:22, spawnInterval:520, speedMul:1.5},
  {duration:9999, spawnInterval:420, speedMul:1.8}
];
setLevel(0);

// starfield
function initStars(){ stars=[]; const n = Math.max(28, Math.floor(canvas.width*0.05)); for(let i=0;i<n;i++){ stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.6+0.6,alpha:0.12+Math.random()*0.7,speed:0.02+Math.random()*0.08}); } }
initStars();

function computeLanes(){
  const lanes=[]; const margin=28; const usable=canvas.width - margin*2;
  for(let i=0;i<LANES;i++) lanes.push(margin + usable * (i + 0.5) / LANES);
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
  if(enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();
  const laneIdx = Math.floor(Math.random()*LANES);
  const laneX = lanes[laneIdx];
  const base = 2 + Math.random()*2;
  const speed = base * LEVELS[levelIndex].speedMul;
  const size = 18 + Math.random()*36;
  const r = Math.random();
  let type = 'red';
  if(r < 0.12) type='big';
  else if(r < 0.28) type='zig';
  else if(r < 0.44) type='home';
  const phase = Math.random()*Math.PI*2;
  const oscAmp = 6 + Math.random()*16;
  const oscSpeed = 0.004 + Math.random()*0.01;
  const e = {lane:laneIdx, x: laneX - size/2, y:-size, w:size, h:size, speed, ay:0.01 + Math.random()*0.03, type, phase, oscAmp, oscSpeed, trail:[]};
  enemies.push(e);
}

// spawn powerup avoiding nearby ones
function spawnPowerupAt(x,y){
  if(powerups.length >= MAX_POWERUPS) return;
  for(const p of powerups){
    const dx = (p.x + p.w/2) - x; const dy = (p.y + p.h/2) - y;
    if(Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return;
  }
  const types = ['shild','slow','life','boom','score'];
  const t = types[Math.floor(Math.random()*types.length)];
  const size = 26; // base, will scale when drawn
  powerups.push({x: Math.max(8, Math.min(x, canvas.width - size - 8)), y, w:size, h:size, type:t, dy:1.4, rot:0});
}

// trail
function addTrail(e){
  e.trail = e.trail || [];
  const tsize = Math.max(4, Math.round(e.w/5));
  e.trail.push({x: e.x + e.w/2, y: e.y + e.h/2, age:0, life:TRAIL_FADE, col: (e.type==='big'?'#9fb0ff': e.type==='zig'?'#c77bff': e.type==='home'?'#ffb86b':'#ff6b6b'), size: tsize});
  if(e.trail.length > 14) e.trail.shift();
}

// particles
function spawnParticles(x,y,col,count=14){ for(let i=0;i<count;i++){ trailParticles.push({x,y,vx:(Math.random()-0.5)*2, vy:(Math.random()-1.5)*-2, age:0, life:200+Math.random()*450, col}); } }

// input
let holdLeft=false, holdRight=false, touchTarget=null;
document.addEventListener('keydown', e=>{
  if(e.key === 'ArrowLeft' || e.key === 'a') holdLeft = true;
  if(e.key === 'ArrowRight' || e.key === 'd') holdRight = true;
});
document.addEventListener('keyup', e=>{
  if(e.key === 'ArrowLeft' || e.key === 'a') holdLeft = false;
  if(e.key === 'ArrowRight' || e.key === 'd') holdRight = false;
});
canvas.addEventListener('touchstart', e=>{ const t=e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchmove', e=>{ const t=e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchend', ()=>{ touchTarget = null; });

// fallback spawn
function fallbackStep(dt){
  fallbackTimer += dt;
  if(fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    spawnEnemy();
    if(Math.random() < POWERUP_CHANCE) spawnPowerupAt(Math.random()*(canvas.width-40), -20);
    spawnInterval = Math.max(420, spawnInterval - 0.25);
  }
}

// update
function update(dt){
  for(const s of stars){ s.y += s.speed * dt * 0.02; if(s.y > canvas.height + 12) s.y = -10; }
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    const lanes = computeLanes();
    const targetX = Math.max(8, Math.min(lanes[e.lane] - e.w/2, canvas.width - e.w - 8));
    e.x += (targetX - e.x) * 0.08;
    e.phase += e.oscSpeed * dt;
    const vOsc = Math.sin(e.phase) * e.oscAmp * 0.02;
    e.speed += e.ay * (dt/16);
    e.y += e.speed * (dt/16) + vOsc;
    if(Math.random() < 0.62) addTrail(e);
    if(e.trail) for(const t of e.trail) t.age += dt;
    if(rectIntersect(player, e) && running){ onPlayerHit(e); enemies.splice(i,1); continue; }
    if(e.y > canvas.height + 120) { enemies.splice(i,1); score++; scoreEl.textContent = score; }
  }

  for(let i=powerups.length-1;i>=0;i--){
    const p = powerups[i];
    p.y += p.dy * (dt/16);
    p.rot += 0.02 * (dt/16); // rotation for life and small spin for all
    if(rectIntersect(player, {x:p.x,y:p.y,w:p.w,h:p.h})){
      applyPowerup(p.type);
      powerups.splice(i,1); continue;
    }
    if(p.y > canvas.height + 80) powerups.splice(i,1);
  }

  for(let i=trailParticles.length-1;i>=0;i--){
    const t = trailParticles[i]; t.age += dt; t.x += t.vx * dt * 0.02; t.y += t.vy * dt * 0.02;
    if(t.age > t.life) trailParticles.splice(i,1);
  }

  if(levelTimer > 0){
    levelTimer -= dt;
    levelTimeEl.textContent = Math.max(0, Math.ceil(levelTimer/1000));
    if(levelTimer <= 0){
      const next = Math.min(levelIndex + 1, LEVELS.length-1);
      setLevel(next);
      score += 8; scoreEl.textContent = score;
    }
  }
}

// collisions & powerups
function rectIntersect(a,b){
  const pad = 6;
  return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad);
}
function onPlayerHit(e){
  if(player.shild > 0){
    player.shild--; updateShild(); tryBeep(980,0.05,0.06); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9be7ff', 16); return;
  }
  lives--; livesEl.textContent = lives; tryBeep(220,0.12,0.14); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#ff6b6b', 20);
  if(lives <= 0){ running = false; statusEl.textContent = 'GAME OVER'; }
}
function applyPowerup(t){
  if(t==='shild'){ player.shild = Math.min(3, player.shild + 1); updateShild(); tryBeep(1180,0.06,0.07); }
  else if(t==='slow'){ enemies.forEach(x=> x.speed *= 0.62); tryBeep(520,0.06,0.06); }
  else if(t==='life'){ lives = Math.min(5, lives + 1); livesEl.textContent = lives; tryBeep(960,0.06,0.06); }
  else if(t==='boom'){ enemies = enemies.filter(x => x.type === 'big'); spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 40); tryBeep(160,0.12,0.08); }
  else if(t==='score'){ score += 10; scoreEl.textContent = score; tryBeep(1400,0.06,0.06); }
}
function updateShild(){ shieldEl && (shieldEl.textContent = player.shild); }

// draw
function drawBackground(){
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0, '#020215');
  g.addColorStop(0.6, '#071028');
  g.addColorStop(1, '#041226');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const s of stars){ ctx.globalAlpha = s.alpha * 0.9; ctx.fillStyle = '#eaf6ff'; ctx.fillRect(s.x, s.y, s.r, s.r); }
  ctx.globalAlpha = 1;
}

function draw(){
  drawBackground();

  for(const p of trailParticles){
    const a = 1 - (p.age / p.life);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x, p.y, 3, 3);
    ctx.globalAlpha = 1;
  }

  // enemy trails
  for(const e of enemies){
    if(e.trail) for(const t of e.trail){
      const a = 1 - (t.age / t.life); if(a <= 0) continue;
      ctx.save(); ctx.globalAlpha = Math.min(0.85, a*0.8); ctx.fillStyle = t.col;
      ctx.shadowBlur = Math.max(6, Math.round(e.w * TRAIL_BLUR_BASE));
      ctx.shadowColor = t.col;
      const w = t.size * 1.9, h = t.size * 1.9;
      roundRect(t.x - w/2, t.y - h/2, w, h, Math.max(4, t.size/3), true);
      ctx.restore();
    }
  }

  // enemies
  for(const e of enemies){
    ctx.save();
    ctx.shadowBlur = Math.max(10, Math.round(e.w * 0.6));
    if(e.type==='big'){ ctx.fillStyle = '#33f3c2'; ctx.shadowColor = '#33f3c2'; }
    else if(e.type==='zig'){ ctx.fillStyle = '#c377ff'; ctx.shadowColor = '#c377ff'; }
    else if(e.type==='home'){ ctx.fillStyle = '#ffb86b'; ctx.shadowColor = '#ffb86b'; }
    else { ctx.fillStyle = '#ff6b6b'; ctx.shadowColor = '#ff6b6b'; }
    roundRect(e.x, e.y, e.w, e.h, Math.max(6, e.w/6), true);
    ctx.restore();
  }

  // powerups: draw using images if available else simple shapes
  for(const p of powerups){
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    const displaySize = Math.round((p.w + 0) * 1.2); // slightly bigger
    // subtle shadow under that matches enemy size
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = (p.type==='shild')? '#33eaff' : (p.type==='slow')? '#b48bff' : (p.type==='life')? '#6ef07a' : (p.type==='boom')? '#ff7b7b' : '#ffd86a';
    ctx.beginPath(); ctx.ellipse(cx, cy + displaySize*0.36, displaySize*0.6, displaySize*0.22, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // draw sprite if loaded
    let img = null;
    if(p.type === 'boom') img = imgBomb.complete ? imgBomb : null;
    else if(p.type === 'life') img = imgLife.complete ? imgLife : null;
    else if(p.type === 'shild') img = imgShild.complete ? imgShild : null;
    if(img){
      ctx.save();
      if(p.type === 'life'){
        // rotate slowly
        ctx.translate(cx, cy);
        ctx.rotate(p.rot);
        ctx.drawImage(img, -displaySize/2, -displaySize/2, displaySize, displaySize);
      } else {
        ctx.drawImage(img, cx - displaySize/2, cy - displaySize/2, displaySize, displaySize);
      }
      ctx.restore();
    } else {
      // fallback: small rounded square with icon mark
      ctx.save();
      ctx.fillStyle = '#041022';
      roundRect(p.x, p.y, p.w, p.h, 8, true);
      ctx.fillStyle = (p.type==='shild')? '#33eaff' : (p.type==='slow')? '#b48bff' : (p.type==='life')? '#6ef07a' : (p.type==='boom')? '#ff7b7b' : '#ffd86a';
      roundRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8, 6, true);
      ctx.fillStyle = '#041020'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '18px sans-serif';
      const icon = (p.type==='shild')? '🛡️' : (p.type==='slow')? '🐢' : (p.type==='life')? '➕' : (p.type==='boom')? '💣' : '⭐';
      ctx.fillText(icon, cx, cy+1);
      ctx.restore();
    }
  }

  // player (with shild effect)
  ctx.save();
  if(player.shild>0){
    // pulsing shield glow
    const glow = 18 + 6 * Math.sin(Date.now()/220);
    ctx.shadowBlur = glow; ctx.shadowColor = '#7fe8ff';
  } else {
    ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,0,0,0.5)';
  }
  ctx.fillStyle = '#6bd7ff';
  roundRect(player.x, player.y, player.w, player.h, 10, true);
  // small 3D bevel
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(player.x+2, player.y+2, player.w-4, player.h/3, 6, true);
  ctx.restore();

  // HUD small text in-canvas
  ctx.fillStyle = '#e6eef8'; ctx.font = '14px sans-serif';
  ctx.fillText('Time Lvl: ' + Math.max(0, Math.round(levelTimer/1000)) + 's', 12, 20);
}

function roundRect(x,y,w,h,r,fill){
  if(typeof r==='undefined') r=6;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if(fill) ctx.fill();
  if(!fill) ctx.stroke();
}

// main loop
let lastFrame = Date.now();
function loop(){
  const now = Date.now(); const dt = Math.min(60, now - lastFrame); lastFrame = now;
  if(running){ applyInput(); fallbackStep(dt); update(dt); }
  draw(); requestAnimationFrame(loop);
}

// input movement (touch & keyboard)
function applyInput(){
  if(touchTarget != null){
    const target = touchTarget - player.w/2;
    const diff = target - player.x;
    player.vx += diff * 0.05;
  } else {
    if(holdLeft && !holdRight) player.vx -= player.accel * 1.2;
    else if(holdRight && !holdLeft) player.vx += player.accel * 1.2;
    else player.vx *= player.friction;
    if(Math.abs(player.vx) < 0.02) player.vx = 0;
  }
  if(player.vx > player.maxSpeed) player.vx = player.maxSpeed;
  if(player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;
  player.x += player.vx;
  if(player.x < 8){ player.x = 8; player.vx = 0; }
  if(player.x > canvas.width - player.w - 8){ player.x = canvas.width - player.w - 8; player.vx = 0; }
}

// reset
function resetGame(){
  resizeCanvas();
  player.x = canvas.width/2 - player.w/2;
  player.y = canvas.height - player.h - 18;
  player.vx = 0; player.shild = 0;
  enemies = []; powerups = []; trailParticles = []; stars = [];
  initStars();
  score = 0; scoreEl.textContent = score;
  lives = 3; livesEl.textContent = lives;
  updateShild();
  running = true;
  setLevel(0);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  fallbackTimer = 0;
  tryBeep(880,0.05,0.06);
}
restartBtn?.addEventListener('click', resetGame);

resetGame();
loop();

// expose helper API (optional)
window.spawnEnemyFromStream = spawnEnemy;
window.spawnPowerup = spawnPowerupAt;
