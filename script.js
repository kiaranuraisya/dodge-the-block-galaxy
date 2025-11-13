 // script.js
// Responsive, 4 lanes, larger items, slightly harder enemies, keyboard controls, no arrow buttons in UI.

// --- DOM ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const pauseBtn = document.getElementById('pause');
const restartBtn = document.getElementById('restart');
const menuBtn = document.getElementById('menuBtn');
const menuPanel = document.getElementById('menuPanel');
const closeMenu = document.getElementById('closeMenu');
const applyLevel = document.getElementById('applyLevel');
const levelSelect = document.getElementById('levelSelect');
const leaderBtn = document.getElementById('leaderBtn');
const leaderPanel = document.getElementById('leaderPanel');
const closeLeader = document.getElementById('closeLeader');
const scoreList = document.getElementById('scoreList');
const clearScores = document.getElementById('clearScores');

const statusEl = document.getElementById('status');
const levelEl = document.getElementById('level');
const levelTimeEl = document.getElementById('levelTime');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const shieldEl = document.getElementById('shield');

let audioCtx=null;
function beep(freq=800,d=0.04,v=0.06){ try{ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.value=v; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + d);}catch(e){} }

// --- responsive canvas ---
function resizeCanvas(){
  const pad = 24;
  const maxW = Math.min(window.innerWidth - pad, 520);
  canvas.width = Math.max(320, Math.floor(maxW));
  // keep tall area for mobile: prefer 9:16-ish but at least 520px tall if available
  const desiredH = Math.max(520, Math.floor(window.innerHeight * 0.72));
  canvas.height = desiredH;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- config & state ---
const LANES = 4;
let MAX_ENEMIES = 20;
const POWERUP_CHANCE = 0.06;
const MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 120;
const TRAIL_FADE = 360;

let player = {w:56,h:56,x:0,y:0,vx:0,maxSpeed:14,accel:2.6,friction:0.82,shield:0};
let enemies = [], powerups = [], particles = [], stars = [];
let score = 0, lives = 3, running = false, paused = false;
let levelIndex = 0, levelTimer = 0, spawnInterval = 700, fallbackTimer = 0;

const LEVELS = [
  {duration:12, spawnInterval:820, speedMul:1.12},
  {duration:15, spawnInterval:700, speedMul:1.28},
  {duration:18, spawnInterval:560, speedMul:1.5},
  {duration:22, spawnInterval:440, speedMul:1.85},
  {duration:9999, spawnInterval:320, speedMul:2.2}
];

function computeLanes(){
  const lanes = [];
  const margin = Math.max(12, Math.round(canvas.width * 0.03));
  const usable = canvas.width - margin*2;
  for(let i=0;i<LANES;i++){
    lanes.push(margin + usable * (i + 0.5) / LANES);
  }
  return lanes;
}

// stars
function initStars(){ stars=[]; const n = Math.max(30, Math.floor(canvas.width*0.06)); for(let i=0;i<n;i++){ stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.8+0.6,alpha:0.16+Math.random()*0.9,speed:0.02+Math.random()*0.08}); } }
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

// --- spawn enemy & powerup ---
function spawnEnemy(){
  if(enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();
  const laneIdx = Math.floor(Math.random()*LANES);
  const laneX = lanes[laneIdx];
  const jitter = (Math.random()-0.5) * (canvas.width * 0.06);
  const x = Math.max(8, Math.min(laneX - 20 + jitter, canvas.width - 40));
  const base = 2.8 + Math.random()*2.6;
  const speed = base * LEVELS[levelIndex].speedMul;
  const size = 20 + Math.random()*36;
  const r = Math.random();
  let type = 'red';
  if(r < 0.12) type='big';
  else if(r < 0.32) type='zig';
  else if(r < 0.52) type='home';
  const phase = Math.random()*Math.PI*2;
  const oscAmp = 8 + Math.random()*14;
  const oscSpeed = 0.006 + Math.random()*0.012;
  enemies.push({lane:laneIdx,x,y:-size,w:size,h:size,speed,ay:0.02 + Math.random()*0.04,type,vx:0,trail:[],phase,oscAmp,oscSpeed});
}

function spawnPowerupAt(x,y){
  if(powerups.length >= MAX_POWERUPS) return;
  for(const p of powerups){
    const dx = (p.x + p.w/2) - x; const dy = (p.y + p.h/2) - y;
    if(Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return;
  }
  const types = ['shield','slow','life','boom','score'];
  const t = types[Math.floor(Math.random()*types.length)];
  const size = 54; // larger
  powerups.push({x: Math.max(8, Math.min(x, canvas.width - size - 8)), y, w:size, h:size, type:t, dy:1.8});
}

function addTrail(e){
  e.trail = e.trail || [];
  const tsize = Math.max(6, Math.round(e.w/4));
  e.trail.push({x: e.x + e.w/2, y: e.y + e.h/2, age:0, life:TRAIL_FADE, col: (e.type==='big'?'#9fb0ff': e.type==='zig'?'#c377ff': e.type==='home'?'#ffb86b':'#ff6b6b'), size: tsize});
  if(e.trail.length > 14) e.trail.shift();
}

function spawnParticles(x,y,col,count=14){ for(let i=0;i<count;i++){ particles.push({x,y,vx:(Math.random()-0.5)*3, vy:(Math.random()-1.5)*-3, age:0, life:200+Math.random()*500, col}); } }

// --- input: touch + mouse + keyboard ---
let touchTarget = null;
canvas.addEventListener('touchstart', e=>{ const t=e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchmove', e=>{ const t=e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchend', ()=>{ touchTarget = null; });
canvas.addEventListener('mousedown', (e)=>{ touchTarget = e.clientX - canvas.getBoundingClientRect().left; });
canvas.addEventListener('mousemove', (e)=>{ if(e.buttons) touchTarget = e.clientX - canvas.getBoundingClientRect().left; });
canvas.addEventListener('mouseup', ()=>{ touchTarget = null; });

let keyLeft=false, keyRight=false;
document.addEventListener('keydown', (e)=>{
  if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){ keyLeft = true; e.preventDefault(); }
  if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){ keyRight = true; e.preventDefault(); }
  if(e.key === ' '){ paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; statusEl.textContent = paused ? 'Paused' : 'Running'; }
});
document.addEventListener('keyup', (e)=>{
  if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){ keyLeft = false; e.preventDefault(); }
  if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){ keyRight = false; e.preventDefault(); }
});

// --- spawning loop fallback ---
function fallbackStep(dt){
  fallbackTimer += dt;
  if(fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    spawnEnemy();
    if(Math.random() < POWERUP_CHANCE) spawnPowerupAt(Math.random()*(canvas.width-60), -20);
    spawnInterval = Math.max(320, spawnInterval - 0.12);
  }
}

// --- update loop ---
function update(dt){
  for(const s of stars){ s.y += s.speed * dt * 0.02; if(s.y > canvas.height + 10) s.y = -10; }

  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    const lanes = computeLanes();
    const targetX = Math.max(8, Math.min(lanes[e.lane] - e.w/2, canvas.width - e.w - 8));
    e.x += (targetX - e.x) * 0.12;
    e.phase += e.oscSpeed * dt;
    const vOsc = Math.sin(e.phase) * e.oscAmp * 0.028;
    e.speed += e.ay * (dt/16);
    e.y += e.speed * (dt/16) + vOsc;
    if(Math.random() < 0.76) addTrail(e);
    if(e.trail) for(const t of e.trail) t.age += dt;

    if(rectIntersect(player, e) && running){
      onPlayerHit(e);
      enemies.splice(i,1);
      continue;
    }
    if(e.y > canvas.height + 140){ enemies.splice(i,1); score += 1; scoreEl.textContent = score; }
  }

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

  for(let i=particles.length-1;i>=0;i--){
    const t = particles[i];
    t.age += dt;
    t.x += t.vx * dt * 0.02; t.y += t.vy * dt * 0.02;
    if(t.age > t.life) particles.splice(i,1);
  }

  if(levelTimer > 0){
    levelTimer -= dt;
    levelTimeEl.textContent = Math.max(0, Math.ceil(levelTimer/1000));
    if(levelTimer <= 0){
      const next = Math.min(levelIndex + 1, LEVELS.length-1);
      setLevel(next);
      score += 10; scoreEl.textContent = score;
    }
  }
}

// --- collisions & powerups ---
function rectIntersect(a,b){
  const pad = 8;
  return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad);
}
function onPlayerHit(e){
  if(player.shield > 0){
    player.shield--; shieldEl.textContent = player.shield; beep(980,0.05,0.06); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9be7ff', 14); return;
  }
  lives--; livesEl.textContent = lives; beep(220,0.12,0.14); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#ff6b6b', 22);
  if(lives <= 0){ running = false; statusEl.textContent = 'GAME OVER'; onGameOver(); }
}
function applyPowerup(t){
  if(t==='shield'){ player.shield = Math.min(3, player.shield + 1); shieldEl.textContent = player.shield; beep(1180,0.06,0.07); }
  else if(t==='slow'){ enemies.forEach(x=> x.speed *= 0.58); beep(520,0.06,0.06); }
  else if(t==='life'){ lives = Math.min(5, lives + 1); livesEl.textContent = lives; beep(960,0.06,0.06); }
  else if(t==='boom'){ enemies = enemies.filter(x => x.type === 'big'); spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 36); beep(160,0.12,0.08); }
  else if(t==='score'){ score += 20; scoreEl.textContent = score; beep(1400,0.06,0.06); }
}

// --- draw ---
function drawBackground(){
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#020215'); g.addColorStop(0.6,'#071028'); g.addColorStop(1,'#041226');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const s of stars){ ctx.globalAlpha = s.alpha*0.9; ctx.fillStyle = '#eaf6ff'; ctx.fillRect(s.x, s.y, s.r, s.r); }
  ctx.globalAlpha = 1;
}

function draw(){
  drawBackground();

  // particle hits
  for(const p of particles){
    const a = 1 - (p.age / p.life);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 3, 3);
    ctx.globalAlpha = 1;
  }

  // trails
  for(const e of enemies){
    if(e.trail){
      for(const t of e.trail){
        const a = 1 - (t.age / t.life);
        if(a <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(0.92, a*0.9);
        ctx.fillStyle = t.col;
        ctx.shadowBlur = Math.max(8, Math.round(e.w * 0.68));
        ctx.shadowColor = t.col;
        const w = t.size * 1.8, h = t.size * 1.8;
        ctx.fillRect(t.x - w/2, t.y - h/2, w, h);
        ctx.restore();
      }
    }
  }

  // enemies
  for(const e of enemies){
    ctx.save();
    ctx.shadowBlur = Math.max(12, Math.round(e.w * 0.7));
    if(e.type==='big'){ ctx.fillStyle = '#33f3c2'; ctx.shadowColor = '#33f3c2'; }
    else if(e.type==='zig'){ ctx.fillStyle = '#c377ff'; ctx.shadowColor = '#c377ff'; }
    else if(e.type==='home'){ ctx.fillStyle = '#ffb86b'; ctx.shadowColor = '#ffb86b'; }
    else { ctx.fillStyle = '#ff6b6b'; ctx.shadowColor = '#ff6b6b'; }
    roundRect(e.x, e.y, e.w, e.h, Math.max(6, e.w/6), true);
    ctx.restore();
  }

  // powerups (no big circle, shape matches type)
  for(const p of powerups){
    ctx.save();
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.45)';
    if(p.type === 'shield'){ ctx.fillStyle = '#33eaff'; roundRect(cx-14,cy-16,28,32,6,true); }
    else if(p.type === 'slow'){ ctx.fillStyle = '#b48bff'; ctx.beginPath(); ctx.moveTo(cx,cy-16); ctx.lineTo(cx+18,cy+12); ctx.lineTo(cx-18,cy+12); ctx.closePath(); ctx.fill(); }
    else if(p.type === 'life'){ ctx.fillStyle = '#6ef07a'; ctx.beginPath(); ctx.arc(cx-8,cy-6,8,0,Math.PI*2); ctx.arc(cx+8,cy-6,8,0,Math.PI*2); ctx.fill(); }
    else if(p.type === 'boom'){ ctx.fillStyle = '#ff7b7b'; ctx.beginPath(); for(let i=0;i<5;i++){ const ang=(i*2*Math.PI)/5 - Math.PI/2; const r = p.w/3; ctx.lineTo(cx+Math.cos(ang)*r, cy+Math.sin(ang)*r); const ang2 = ang + Math.PI/5; const r2 = p.w/6; ctx.lineTo(cx+Math.cos(ang2)*r2, cy+Math.sin(ang2)*r2); } ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = '#ffd86a'; roundRect(p.x+6,p.y+6,p.w-12,p.h-12,6,true); }
    ctx.restore();
  }

  // player
  ctx.save();
  if(player.shield > 0){ ctx.shadowBlur = 26; ctx.shadowColor = '#7fe8ff'; }
  else { ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.5)'; }
  ctx.fillStyle = '#6bd7ff'; roundRect(player.x, player.y, player.w, player.h, 10, true);
  ctx.restore();

  // HUD small
  ctx.fillStyle = '#e6eef8'; ctx.font = '14px sans-serif';
  ctx.fillText('Time Lvl: ' + Math.max(0, Math.round(levelTimer/1000)) + 's', 12, 20);
}

// helper round rect
function roundRect(x,y,w,h,r,fill,stroke){
  if(typeof r==='undefined') r=6;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if(fill) ctx.fill(); if(stroke) ctx.stroke();
}

// main loop
let lastFrame = Date.now();
function loop(){
  const now = Date.now();
  const dt = Math.min(60, now - lastFrame);
  lastFrame = now;
  if(running && !paused){ applyInput(dt); fallbackStep(dt); update(dt); }
  draw();
  requestAnimationFrame(loop);
}

// movement (touch & keyboard)
function applyInput(dt){
  if(touchTarget != null){
    const target = touchTarget - player.w/2;
    const diff = target - player.x;
    player.vx += diff * 0.06;
  } else {
    if(keyLeft && !keyRight) player.vx -= player.accel * 1.2;
    else if(keyRight && !keyLeft) player.vx += player.accel * 1.2;
    else player.vx *= player.friction;
  }
  if(player.vx > player.maxSpeed) player.vx = player.maxSpeed;
  if(player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;
  player.x += player.vx;
  if(player.x < 8){ player.x = 8; player.vx = 0; }
  if(player.x > canvas.width - player.w - 8){ player.x = canvas.width - player.w - 8; player.vx = 0; }
}

// leaderboard
const SCORES_KEY = 'dtb_leader_v3';
function loadScores(){ try{ const s = localStorage.getItem(SCORES_KEY); return s?JSON.parse(s):[] }catch(e){return[]} }
function saveScores(a){ localStorage.setItem(SCORES_KEY, JSON.stringify(a)) }
function renderLeaderboard(){
  const arr = loadScores().slice(0,10); scoreList.innerHTML=''; if(arr.length===0){ scoreList.innerHTML='<div style="color:#cbd5e1">No scores yet</div>'; return; }
  arr.sort((a,b)=>b.score-a.score); arr.forEach((it,idx)=>{ const d = document.createElement('div'); d.style.padding='8px'; d.style.marginBottom='6px'; d.style.background='rgba(255,255,255,0.02)'; d.style.borderRadius='8px'; d.innerHTML = `<div>#${idx+1} <strong style="color:#e6eef8">${escapeHtml(it.name)}</strong></div><div style="color:#cbd5e1">${it.score}</div>`; scoreList.appendChild(d); });
}
function showLeader(){ renderLeaderboard(); leaderPanel.style.display='block'; }
function hideLeader(){ leaderPanel.style.display='none'; }
function onGameOver(){
  const name = prompt('Game over — masukkan nama untuk leaderboard (atau kosongkan):');
  if(name !== null && name.trim() !== ''){
    const arr = loadScores(); arr.push({name: name.trim().slice(0,20), score: score, t:Date.now()}); saveScores(arr);
  }
  showLeader();
}

// events
pauseBtn.addEventListener('click', ()=> { if(!running) return; paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; statusEl.textContent = paused ? 'Paused' : 'Running'; });
restartBtn.addEventListener('click', ()=> resetGame());
menuBtn.addEventListener('click', ()=> menuPanel.classList.toggle('hidden'));
closeMenu.addEventListener('click', ()=> menuPanel.classList.add('hidden'));
applyLevel.addEventListener('click', ()=> { setLevel(parseInt(levelSelect.value)); resetGame(); menuPanel.classList.add('hidden'); });
leaderBtn.addEventListener('click', ()=> showLeader());
closeLeader.addEventListener('click', ()=> hideLeader());
clearScores.addEventListener('click', ()=>{ if(confirm('Clear leaderboard?')){ localStorage.removeItem(SCORES_KEY); renderLeaderboard(); } });

// reset/start
function resetGame(){
  resizeCanvas();
  player.x = canvas.width/2 - player.w/2;
  player.y = canvas.height - player.h - 18;
  player.vx = 0; player.shield = 0;
  enemies = []; powerups = []; particles = []; stars = [];
  initStars();
  score = 0; scoreEl.textContent = score;
  lives = 3; livesEl.textContent = lives;
  shieldEl.textContent = player.shield;
  running = true; paused = false;
  pauseBtn.textContent = 'Pause'; setLevel(levelIndex);
  spawnInterval = LEVELS[levelIndex].spawnInterval;
  fallbackTimer = 0;
  statusEl.textContent = 'Running';
  beep(880,0.04,0.05);
}
resetGame();
loop();

// expose tiny API for debug
window.spawnEnemyFromStream = spawnEnemy;
window.spawnPowerup = spawnPowerupAt;

// helper
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
