/* Compact Galaxy - with drift fix, sensitivity & difficulty modes
   Auto-start, 4 lanes, powerups as shapes, trails scaled to size,
   menu, pause, restart, leaderboard (localStorage)
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// UI
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
const pauseBtn = document.getElementById('pause');
const restartBtn = document.getElementById('restart');
const menuBtn = document.getElementById('menuBtn');
const menuPanel = document.getElementById('menuPanel');
const closeMenu = document.getElementById('closeMenu');
const applyLevel = document.getElementById('applyLevel');
const levelSelect = document.getElementById('levelSelect');
const leaderBtn = document.getElementById('leaderBtn');
const leaderPanel = document.getElementById('leaderPanel');
const openLeader = document.getElementById('openLeaderboard');
const closeLeader = document.getElementById('closeLeader');
const scoreList = document.getElementById('scoreList');
const clearScores = document.getElementById('clearScores');
const sensitivitySlider = document.getElementById('sensitivity');
const difficultySelect = document.getElementById('difficultySelect');

const statusEl = document.getElementById('status');
const levelEl = document.getElementById('level');
const levelTimeEl = document.getElementById('levelTime');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const shieldEl = document.getElementById('shield');

let audioCtx=null;
function tryBeep(f=880,d=0.03,v=0.06){ try{ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type='sine'; o.frequency.value=f; g.gain.value=v; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + d);}catch(e){} }

// responsive
function resizeCanvas(){
  const screenW = Math.min(window.innerWidth, 360);
  canvas.width = Math.max(300, Math.floor(screenW - 8));
  canvas.height = Math.max(520, Math.floor(window.innerHeight * 0.72));
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* CONFIG & difficulty */
const LANES = 4;
let MAX_ENEMIES = 14;
const POWERUP_CHANCE = 0.06;
let MAX_POWERUPS = 1;
const MIN_POWERUP_DIST = 140;
const TRAIL_FADE = 360;

/* player sensitivity & difficulty settings (default) */
let SENSITIVITY = parseFloat(sensitivitySlider ? sensitivitySlider.value : 1.0);
const DIFFICULTY = {
  easy:  { spawnMul: 1.25, speedMul: 0.85, maxEnemies: 10 },
  medium:{ spawnMul: 1.0,  speedMul: 1.0,  maxEnemies: 14 },
  hard:  { spawnMul: 0.8,  speedMul: 1.25, maxEnemies: 18 }
};
let currentDifficulty = 'medium';

/* STATE */
let player = {w:36,h:36,x:0,y:0,vx:0,maxSpeed:10,accel:1.6,friction:0.88,shield:0};
let enemies = [], powerups = [], trailParticles = [], stars = [];
let score=0, lives=3, running=false, paused=false;
let levelIndex=0, levelTimer=0, spawnInterval=900, fallbackTimer=0;

/* LEVELS (base) */
const LEVELS = [
  {duration:12, spawnInterval:900, speedMul:1.0},
  {duration:15, spawnInterval:760, speedMul:1.15},
  {duration:18, spawnInterval:620, speedMul:1.3},
  {duration:22, spawnInterval:520, speedMul:1.5},
  {duration:9999, spawnInterval:420, speedMul:1.8}
];

function applyDifficulty(d){
  currentDifficulty = d;
  const cfg = DIFFICULTY[d];
  MAX_ENEMIES = cfg.maxEnemies;
  // apply multiplier to spawnInterval and to each level's speedMul when spawning
  // we'll use spawnInterval base per level * cfg.spawnMul
  spawnInterval = LEVELS[levelIndex].spawnInterval * cfg.spawnMul;
}

function computeLanes(){
  const lanes=[]; const margin=24; const usable = canvas.width - margin*2;
  for(let i=0;i<LANES;i++) lanes.push(margin + usable * (i + 0.5) / LANES);
  return lanes;
}

function initStars(){ stars=[]; const n = Math.max(20, Math.floor(canvas.width*0.06)); for(let i=0;i<n;i++){ stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.6+0.6,alpha:0.2+Math.random()*0.8,speed:0.02+Math.random()*0.08}); } }
initStars();

function setLevel(i){
  levelIndex = Math.min(i, LEVELS.length-1);
  const cfg = DIFFICULTY[currentDifficulty];
  spawnInterval = LEVELS[levelIndex].spawnInterval * (cfg ? cfg.spawnMul : 1.0);
  levelTimer = LEVELS[levelIndex].duration * 1000;
  levelEl.textContent = levelIndex + 1;
  levelTimeEl.textContent = Math.ceil(levelTimer/1000);
  statusEl.textContent = 'Status: Level ' + (levelIndex+1);
}
setLevel(0);
applyDifficulty(currentDifficulty);

/* spawn enemy (uses difficulty speed mul) */
function spawnEnemy(){
  if(enemies.length >= MAX_ENEMIES) return;
  const lanes = computeLanes();
  const laneIdx = Math.floor(Math.random()*LANES);
  const laneX = lanes[laneIdx];
  const x = Math.max(10, Math.min(laneX - 18, canvas.width - 40));
  const base = 2 + Math.random()*2;
  const diffCfg = DIFFICULTY[currentDifficulty] || DIFFICULTY['medium'];
  const speed = base * LEVELS[levelIndex].speedMul * diffCfg.speedMul;
  const size = 14 + Math.random()*28;
  const r = Math.random();
  let type = 'red';
  if(r < 0.10) type='big';
  else if(r < 0.28) type='zig';
  else if(r < 0.46) type='home';
  const phase = Math.random()*Math.PI*2;
  const oscAmp = 6 + Math.random()*10;
  const oscSpeed = 0.004 + Math.random()*0.008;
  enemies.push({lane:laneIdx,x,y:-size,w:size,h:size,speed,ay:0.01 + Math.random()*0.03,type,vx:0,trail:[],phase,oscAmp,oscSpeed});
}

/* spawn powerup (not near existing) */
function spawnPowerupAt(x,y){
  if(powerups.length >= MAX_POWERUPS) return;
  for(const p of powerups){
    const dx = (p.x + p.w/2) - x; const dy = (p.y + p.h/2) - y;
    if(Math.sqrt(dx*dx + dy*dy) < MIN_POWERUP_DIST) return;
  }
  const types = ['shield','slow','life','boom','score'];
  const t = types[Math.floor(Math.random()*types.length)];
  const size = 28;
  powerups.push({x: Math.max(10, Math.min(x, canvas.width - size - 10)), y, w:size, h:size, type:t, dy:1.6});
}

/* trails */
function addTrail(e){
  e.trail = e.trail || [];
  const tsize = Math.max(3, Math.round(e.w/5));
  e.trail.push({x: e.x + e.w/2, y: e.y + e.h/2, age:0, life:TRAIL_FADE, col: (e.type==='big'?'#9fb0ff': e.type==='zig'?'#c377ff': e.type==='home'?'#ffb86b':'#ff6b6b'), size: tsize});
  if(e.trail.length > 12) e.trail.shift();
}

function spawnParticles(x,y,col,count=12){ for(let i=0;i<count;i++){ trailParticles.push({x,y,vx:(Math.random()-0.5)*2, vy:(Math.random()-1.5)*-2, age:0, life:200+Math.random()*400, col}); } }

let holdLeft=false, holdRight=false, touchTarget=null;
leftBtn && leftBtn.addEventListener('pointerdown', ()=> holdLeft=true);
leftBtn && leftBtn.addEventListener('pointerup', ()=> holdLeft=false);
rightBtn && rightBtn.addEventListener('pointerdown', ()=> holdRight=true);
rightBtn && rightBtn.addEventListener('pointerup', ()=> holdRight=false);
canvas.addEventListener('touchstart', e=>{ const t=e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchmove', e=>{ const t=e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchend', ()=>{ touchTarget = null; });
document.addEventListener('pointerup', ()=>{ holdLeft=holdRight=false; });

function fallbackStep(dt){
  fallbackTimer += dt;
  if(fallbackTimer > spawnInterval){
    fallbackTimer = 0;
    spawnEnemy();
    if(Math.random() < POWERUP_CHANCE) spawnPowerupAt(Math.random()*(canvas.width-30), -14);
    spawnInterval = Math.max(300, spawnInterval - 0.2); // gradually faster but limited
  }
}

function update(dt){
  for(const s of stars){ s.y += s.speed * dt * 0.02; if(s.y > canvas.height + 10) s.y = -10; }

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
    if(rectIntersect(player, e) && running){
      onPlayerHit(e);
      enemies.splice(i,1);
      continue;
    }
    if(e.y > canvas.height + 100){ enemies.splice(i,1); score++; scoreEl.textContent = score; }
  }

  for(let i=powerups.length-1;i>=0;i--){
    const p = powerups[i];
    p.y += p.dy * (dt/16);
    if(rectIntersect(player, {x:p.x,y:p.y,w:p.w,h:p.h})){
      applyPowerup(p.type);
      powerups.splice(i,1);
      continue;
    }
    if(p.y > canvas.height + 80) powerups.splice(i,1);
  }

  for(let i=trailParticles.length-1;i>=0;i--){
    const t = trailParticles[i];
    t.age += dt;
    t.x += t.vx * dt * 0.02; t.y += t.vy * dt * 0.02;
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

/* collisions & powerups */
function rectIntersect(a,b){
  const pad = 6;
  return !(a.x + a.w - pad < b.x || a.x > b.x + b.w - pad || a.y + a.h - pad < b.y || a.y > b.y + b.h - pad);
}
function onPlayerHit(e){
  if(player.shield > 0){
    player.shield--; shieldEl.textContent = player.shield; tryBeep(980,0.05,0.06); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#9be7ff', 12); return;
  }
  lives--; livesEl.textContent = lives; tryBeep(220,0.12,0.14); spawnParticles(player.x + player.w/2, player.y + player.h/2, '#ff6b6b', 18);
  if(lives <= 0){ running = false; statusEl.textContent = 'GAME OVER'; onGameOver(); }
}
function applyPowerup(t){
  if(t==='shield'){ player.shield = Math.min(3, player.shield + 1); shieldEl.textContent = player.shield; tryBeep(1180,0.06,0.07); }
  else if(t==='slow'){ enemies.forEach(x=> x.speed *= 0.62); tryBeep(520,0.06,0.06); }
  else if(t==='life'){ lives = Math.min(5, lives + 1); livesEl.textContent = lives; tryBeep(960,0.06,0.06); }
  else if(t==='boom'){ enemies = enemies.filter(x => x.type === 'big'); spawnParticles(canvas.width/2, canvas.height/2, '#ffd36b', 30); tryBeep(160,0.12,0.08); }
  else if(t==='score'){ score += 10; scoreEl.textContent = score; tryBeep(1400,0.06,0.06); }
}

/* draw */
function drawBackground(){
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#020215'); g.addColorStop(0.6,'#071028'); g.addColorStop(1,'#041226');
  ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const s of stars){ ctx.globalAlpha = s.alpha*0.9; ctx.fillStyle = '#eaf6ff'; ctx.fillRect(s.x, s.y, s.r, s.r); }
  ctx.globalAlpha = 1;
}
function draw(){
  drawBackground();
  for(const p of trailParticles){ const a = 1 - (p.age / p.life); ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 3, 3); ctx.globalAlpha = 1; }

  for(const e of enemies){
    if(e.trail){
      for(const t of e.trail){
        const a = 1 - (t.age / t.life); if(a <= 0) continue;
        ctx.save(); ctx.globalAlpha = Math.min(0.85, a*0.8); ctx.fillStyle = t.col;
        ctx.shadowBlur = Math.max(6, Math.round(e.w * 0.6)); ctx.shadowColor = t.col;
        const w = t.size * 1.6, h = t.size * 1.6; ctx.fillRect(t.x - w/2, t.y - h/2, w, h);
        ctx.restore();
      }
    }
  }

  for(const e of enemies){
    ctx.save(); ctx.shadowBlur = Math.max(12, Math.round(e.w * 0.6));
    if(e.type==='big'){ ctx.fillStyle = '#33f3c2'; ctx.shadowColor = '#33f3c2'; }
    else if(e.type==='zig'){ ctx.fillStyle = '#c377ff'; ctx.shadowColor = '#c377ff'; }
    else if(e.type==='home'){ ctx.fillStyle = '#ffb86b'; ctx.shadowColor = '#ffb86b'; }
    else { ctx.fillStyle = '#ff6b6b'; ctx.shadowColor = '#ff6b6b'; }
    roundRect(e.x, e.y, e.w, e.h, Math.max(6, e.w/6), true);
    ctx.restore();
  }

  for(const p of powerups){
    ctx.save(); ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,0,0,0.35)';
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    if(p.type === 'shield'){ ctx.fillStyle = '#33eaff'; ctx.beginPath(); ctx.moveTo(cx, cy - p.h/2 + 2); ctx.lineTo(cx + p.w/2 -2, cy); ctx.lineTo(cx, cy + p.h/2 -2); ctx.lineTo(cx - p.w/2 +2, cy); ctx.closePath(); ctx.fill(); }
    else if(p.type === 'slow'){ ctx.fillStyle = '#b48bff'; ctx.beginPath(); ctx.moveTo(cx, cy - p.h/2 + 2); ctx.lineTo(cx + p.w/2 -2, cy + p.h/2 -4); ctx.lineTo(cx - p.w/2 +2, cy + p.h/2 -4); ctx.closePath(); ctx.fill(); }
    else if(p.type === 'life'){ ctx.fillStyle = '#6ef07a'; roundRect(p.x+4, p.y+6, p.w-8, p.h-14, 6, true); ctx.beginPath(); ctx.arc(cx - 6, cy - 6, 6, 0, Math.PI*2); ctx.arc(cx + 6, cy - 6, 6, 0, Math.PI*2); ctx.fill(); }
    else if(p.type === 'boom'){ ctx.fillStyle = '#ff7b7b'; ctx.beginPath(); for(let i=0;i<5;i++){ const ang=(i*2*Math.PI)/5 - Math.PI/2; const r = p.w/3; ctx.lineTo(cx+Math.cos(ang)*r, cy+Math.sin(ang)*r); const ang2 = ang + Math.PI/5; const r2 = p.w/6; ctx.lineTo(cx+Math.cos(ang2)*r2, cy+Math.sin(ang2)*r2); } ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = '#ffd86a'; roundRect(p.x+4, p.y+4, p.w-8, p.h-8, 6, true); }
    ctx.restore();
  }

  ctx.save(); if(player.shield > 0){ ctx.shadowBlur = 20; ctx.shadowColor = '#7fe8ff'; } else { ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,0,0,0.5)'; }
  ctx.fillStyle = '#6bd7ff'; roundRect(player.x, player.y, player.w, player.h, 8, true); ctx.restore();

  ctx.fillStyle = '#e6eef8'; ctx.font = '14px sans-serif'; ctx.fillText('Time Lvl: ' + Math.max(0, Math.round(levelTimer/1000)) + 's', 12, 20);
}

function roundRect(x,y,w,h,r,fill,stroke){ if(typeof r==='undefined') r=6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

let lastFrame = Date.now();
function loop(){
  const now = Date.now();
  const dt = Math.min(60, now - lastFrame);
  lastFrame = now;
  if(running && !paused){ applyInput(); fallbackStep(dt); update(dt); }
  draw();
  requestAnimationFrame(loop);
}

/* INPUT: STABLE, NO DRIFT */
function applyInput(){
  // SENSITIVITY changes how quickly player snaps to touch target (0.4..1.6)
  SENSITIVITY = parseFloat(sensitivitySlider ? sensitivitySlider.value : 1.0);

  if (touchTarget != null){
    // direct snap toward finger — no velocity drift
    const target = touchTarget - player.w/2;
    const snap = 0.16 * SENSITIVITY; // lower = slower, higher = faster
    player.x += (target - player.x) * snap;
    player.vx = 0;
  } else {
    // button input: immediate fixed speed depending on sensitivity and maxSpeed
    if (holdLeft && !holdRight){
      player.vx = -player.maxSpeed * (0.9 + (SENSITIVITY-1)*0.5);
    } else if (holdRight && !holdLeft){
      player.vx = player.maxSpeed * (0.9 + (SENSITIVITY-1)*0.5);
    } else {
      // no input → don't drift
      player.vx = 0;
    }
    player.x += player.vx * 0.016 * 18; // consistent frame movement
  }

  // clamp
  if(player.x < 8){ player.x = 8; player.vx = 0; }
  if(player.x > canvas.width - player.w - 8){ player.x = canvas.width - player.w - 8; player.vx = 0; }
}

canvas.addEventListener('touchstart', e=>{ const t=e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchmove', e=>{ const t=e.touches[0]; touchTarget = t.clientX - canvas.getBoundingClientRect().left; e.preventDefault(); });
canvas.addEventListener('touchend', ()=> touchTarget = null);

leftBtn && leftBtn.addEventListener('pointerdown', ()=> holdLeft=true);
leftBtn && leftBtn.addEventListener('pointerup', ()=> holdLeft=false);
rightBtn && rightBtn.addEventListener('pointerdown', ()=> holdRight=true);
rightBtn && rightBtn.addEventListener('pointerup', ()=> holdRight=false);

pauseBtn && pauseBtn.addEventListener('click', ()=> { if(!running) return; paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; statusEl.textContent = paused ? 'Paused' : 'Running'; });
restartBtn && restartBtn.addEventListener('click', ()=> resetGame());

menuBtn && menuBtn.addEventListener('click', ()=> { menuPanel.classList.toggle('hidden'); });
closeMenu && closeMenu.addEventListener('click', ()=> menuPanel.classList.add('hidden'));
applyLevel && applyLevel.addEventListener('click', ()=> { setLevel(parseInt(levelSelect.value)); applyDifficulty(difficultySelect.value); resetGame(); menuPanel.classList.add('hidden'); });
sensitivitySlider && sensitivitySlider.addEventListener('input', ()=> { /* live value applied in applyInput */ });
difficultySelect && difficultySelect.addEventListener('change', ()=> { /* selection applied on Apply */ });

leaderBtn && leaderBtn.addEventListener('click', ()=> showLeaderPanel());
openLeader && openLeader.addEventListener('click', ()=> showLeaderPanel());
closeLeader && closeLeader.addEventListener('click', ()=> leaderPanel.classList.add('hidden'));
clearScores && clearScores.addEventListener('click', ()=> { if(confirm('Clear leaderboard?')){ localStorage.removeItem(SCORES_KEY); renderLeaderboard(); } });

/* leaderboard */
const SCORES_KEY = 'dtb_leaderboard_v1';
function loadScores(){ try{ const s = localStorage.getItem(SCORES_KEY); return s ? JSON.parse(s) : []; }catch(e){ return []; } }
function saveScores(arr){ localStorage.setItem(SCORES_KEY, JSON.stringify(arr)); }
function renderLeaderboard(){ const arr = loadScores().slice(0,10); scoreList.innerHTML = ''; if(arr.length===0){ scoreList.innerHTML = '<div>No scores yet</div>'; return; } arr.sort((a,b)=>b.score-a.score); arr.forEach((it,idx)=>{ const d = document.createElement('div'); d.innerHTML = `<div>#${idx+1} <strong>${escapeHtml(it.name)}</strong></div><div>${it.score}</div>`; scoreList.appendChild(d); }); }
function showLeaderPanel(){ renderLeaderboard(); leaderPanel.classList.remove('hidden'); }

function onGameOver(){
  const name = prompt('Game over — masukkan nama untuk leaderboard (atau kosongkan):');
  if(name !== null && name.trim() !== ''){
    const arr = loadScores(); arr.push({name: name.trim().slice(0,20), score: score, t: Date.now()}); saveScores(arr);
  }
  showLeaderPanel();
}

/* start/reset */
function resetGame(){
  resizeCanvas();
  player.x = canvas.width/2 - player.w/2;
  player.y = canvas.height - player.h - 12;
  player.vx = 0; player.shield = 0;
  enemies = []; powerups = []; trailParticles = []; stars = [];
  initStars();
  score = 0; scoreEl.textContent = score;
  lives = 3; livesEl.textContent = lives;
  shieldEl.textContent = player.shield;
  running = true; paused = false;
  pauseBtn.textContent = 'Pause';
  setLevel(levelIndex);
  fallbackTimer = 0;
  statusEl.textContent = 'Running';
  tryBeep(880,0.04,0.05);
}

/* start */
resetGame();
loop();

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }