const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score-value');
const layerEl = document.getElementById('layer-name');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const uiLeft = document.getElementById('btn-left');
const uiRight = document.getElementById('btn-right');
const finalScoreContainer = document.getElementById('final-score-container');
const finalScoreEl = document.getElementById('final-score');
const highScoreEl = document.getElementById('high-score');
const gameMessage = document.getElementById('game-message');
const mainTitle = document.getElementById('main-title');
const shareBtn = document.getElementById('share-btn');

let width, height;
let lastTime = 0;
const CONFIG = {
    MAX_DEPTH: 5000,
    BASE_FALL_SPEED: 400,
    PLAYER_SPEED: 550,
    PLAYER_RADIUS: 18,
    WALL_SEGMENT_HEIGHT: 40,
    TUNNEL_WIDTH_MAX: 500,
    MIN_GAP_BASE: 150,
    COLORS: {
        MAGMA_ORANGE: '#f4511e',
        MAGMA_YELLOW: '#ff9800',
        ACCENT_YELLOW: '#ffeb3b',
        GLOW_ACCENT: '#ff00ff'
    }
};

const state = {
    isRunning: false,
    score: 0,
    speedMultiplier: 1,
    time: 0,
    highScore: parseInt(localStorage.getItem('seismic_high_score')) || 0,
    gameWon: false,
    coreSpawned: false,
    coreY: 0,
    testMode: false,
    shake: 0,
    lastLayer: ''
};

const player = {
    x: 0, y: 0,
    radius: CONFIG.PLAYER_RADIUS,
    vx: 0, speed: CONFIG.PLAYER_SPEED, 
    angle: 0, colorOuter: '#ff00ff'
};

const keys = { left: false, right: false };
let obstacles = [], particles = [], backgroundLines = [], wallSegments = [];
const WALL_SEGMENT_HEIGHT = CONFIG.WALL_SEGMENT_HEIGHT;
let wallScrollOffset = 0;

const levels = [
    { name: 'Earth\'s Crust', depth: 0,    bg: [17, 12, 8],     wall: [55, 38, 28] },
    { name: 'Mantle',         depth: 1500, bg: [51, 15, 5],     wall: [100, 30, 9] },
    { name: 'Outer Core',     depth: 3000, bg: [99, 21, 0],     wall: [170, 55, 6] },
    { name: 'Inner Core',     depth: 4500, bg: [143, 33, 0],    wall: [225, 100, 0] },
];

let curColorBg = levels[0].bg, curColorWall = levels[0].wall;

function lerpColor(c1, c2, t) {
    return [Math.floor(c1[0] + (c2[0] - c1[0]) * t), Math.floor(c1[1] + (c2[1] - c1[1]) * t), Math.floor(c1[2] + (c2[2] - c1[2]) * t)];
}
function darken(color, amount) { return [Math.max(0, color[0] - amount), Math.max(0, color[1] - amount), Math.max(0, color[2] - amount)]; }
function lighten(color, amount) { return [Math.min(255, color[0] + amount), Math.min(255, color[1] + amount), Math.min(255, color[2] + amount)]; }
function arrToRgb(arr) { return `rgb(${arr[0]}, ${arr[1]}, ${arr[2]})`; }
function arrToRgba(arr, a) { return `rgba(${arr[0]}, ${arr[1]}, ${arr[2]}, ${a})`; }

function updateColorsAndLayer() {
    let currentLvl = levels[0], nextLvl = levels[0], t = 0;
    for (let i = 0; i < levels.length; i++) {
        if (state.score >= levels[i].depth) { currentLvl = levels[i]; nextLvl = levels[i+1] || levels[i]; }
    }
    if (currentLvl !== nextLvl) {
        let range = nextLvl.depth - currentLvl.depth;
        t = Math.min(1, Math.max(0, (state.score - currentLvl.depth) / range));
    }
    curColorBg = lerpColor(currentLvl.bg, nextLvl.bg, t);
    curColorWall = lerpColor(currentLvl.wall, nextLvl.wall, t);
    if (state.lastLayer !== currentLvl.name && currentLvl.depth > 0) {
        state.lastLayer = currentLvl.name; state.shake = 40; // Intense seismic pulse
        spawnParticles(player.x, player.y, 40, 2.5, '#ffffff');
        layerEl.classList.remove('layer-flash'); void layerEl.offsetWidth; layerEl.classList.add('layer-flash');
    }
    layerEl.innerText = currentLvl.name;
    layerEl.style.color = state.score > 3500 ? CONFIG.COLORS.ACCENT_YELLOW : (state.score > 2000 ? CONFIG.COLORS.MAGMA_YELLOW : CONFIG.COLORS.MAGMA_ORANGE);
}

function resize() {
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width; canvas.height = height;
    if (!state.isRunning) { player.x = width / 2; player.y = height * 0.25; initWalls(); }
}

window.addEventListener('resize', resize);

window.addEventListener('keydown', e => {
    // Zoom protection
    if (e.ctrlKey && (e.key === '=' || e.key === '-' || e.key === '0' || e.key === '+')) e.preventDefault();
    // Movement
    if (e.key === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.key === 'ArrowRight' || e.code === 'KeyF' || e.code === 'KeyD') keys.right = true;
});

window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.key === 'ArrowRight' || e.code === 'KeyF' || e.code === 'KeyD') keys.right = false;
});

window.addEventListener('wheel', e => {
    if (e.ctrlKey) e.preventDefault(); 
}, { passive: false });

const btnLeftEv = (val) => (e) => { e.preventDefault(); keys.left = val; };
const btnRightEv = (val) => (e) => { e.preventDefault(); keys.right = val; };
uiLeft.addEventListener('touchstart', btnLeftEv(true), {passive: false}); uiLeft.addEventListener('touchend', btnLeftEv(false));
uiLeft.addEventListener('mousedown', btnLeftEv(true)); uiLeft.addEventListener('mouseup', btnLeftEv(false));
uiRight.addEventListener('touchstart', btnRightEv(true), {passive: false}); uiRight.addEventListener('touchend', btnRightEv(false));
uiRight.addEventListener('mousedown', btnRightEv(true)); uiRight.addEventListener('mouseup', btnRightEv(false));

window.addEventListener('deviceorientation', (e) => {
    if (!state.isRunning) return;
    const tilt = e.gamma; 
    if (tilt > 12) { keys.right = true; keys.left = false; }
    else if (tilt < -12) { keys.left = true; keys.right = false; }
    else { keys.left = false; keys.right = false; }
});

function generateDecorations(index, leftX, rightX) {
    let decos = [], depth = index * 2, count = Math.floor(Math.random() * 3 + 1); 
    for(let i=0; i<count; i++) {
        let yOffset = Math.random() * WALL_SEGMENT_HEIGHT, size = Math.random() * 15 + 8, type = 'rock';        
        if (depth < 500) {
            const r = Math.random();
            if (r < 0.2) type = 'bg_bone'; else if (r < 0.35) type = 'fossil'; else if (r < 0.5) type = 'worm';
            else if (r < 0.70) type = 'root'; else if (r < 0.75) type = 'sand';
        } else if (depth < 1500) {
            const r = Math.random();
            if (r < 0.15) type = 'fossil'; else if (r < 0.35) type = 'worm'; else if (r < 0.55) type = 'sand';
            else if (r < 0.70) type = 'root'; else if (r < 0.71) { type = 'cave_empty'; size = 60 + Math.random() * 50; }
            else if (r < 0.72) { type = 'cave_water'; size = 60 + Math.random() * 50; }
        } else if (depth < 3000) {
            const r = Math.random();
            if (r < 0.01) { type = 'cave_empty'; size = 60 + Math.random() * 50; }
            else if (r < 0.20) type = 'gem'; else if (r < 0.40) type = 'ore_gold'; 
            else if (r < 0.7) type = 'magma_crack'; else type = 'rock_dark';
        } else {
            const r = Math.random();
            if (r < 0.4) { type = 'lava_pool'; size = 20 + Math.random() * 30; }
            else if (r < 0.7) type = 'magma_crack'; else type = 'basalt';
        }
        let isLeft = Math.random() > 0.5, margin = size * 1.5 + 40, x = 0;
        if (isLeft) { x = Math.random() * Math.max(0, leftX - margin); if (type.startsWith('cave') || type === 'lava_pool') x = Math.min(x, leftX - margin); }
        else { x = rightX + margin + Math.random() * Math.max(0, width - (rightX + margin)); if (type.startsWith('cave') || type === 'lava_pool') x = Math.max(x, rightX + margin); }
        decos.push({x: x, yOffset: yOffset, type: type, size: size, seed: Math.random()});
    }
    return decos;
}

function getWallOffset(yIndex) {
     const tunnelWidthMax = CONFIG.TUNNEL_WIDTH_MAX;
     const timeFactor = state.time * 0.5;
     const wave1 = Math.sin(yIndex * 0.04 + timeFactor) * 80; // Increased amplitude
     const wave2 = Math.sin(yIndex * 0.1 - timeFactor * 0.7) * 40; // Overlapping smooth wave
     const jagged = (Math.random() - 0.5) * 10; 
     let depth = yIndex * 2, splitW = 0; // 1 segment = 2 units of depth
     if (depth > 1200) {
         let sw = Math.sin(yIndex * 0.04 + state.time * 0.1); 
         if (sw > 0.85) splitW = Math.max(0, (sw - 0.85) * 1500 + (Math.random()-0.5)*30);
     }
     let depthShrink = Math.min(120, (depth / CONFIG.MAX_DEPTH) * 120); 
     const minGap = Math.max(CONFIG.MIN_GAP_BASE + splitW * 1.5, tunnelWidthMax * 0.5 - depthShrink);
     const gap = minGap + Math.abs(Math.sin(yIndex * 0.08)) * 80;
     const wander = Math.max(-(width/2 - tunnelWidthMax/2 - 20), Math.min(width/2 - tunnelWidthMax/2 - 20, wave1 + wave2));
     const centerLine = width/2 + wander + jagged;
     
     // --- ENDGAME VOID TRANSITION ---
     if (depth > 4700) {
         let voidT = Math.min(1, (depth - 4700) / 300); // 4700 to 5000
         let voidGap = gap + (width * voidT);
         let left = centerLine - voidGap/2, right = centerLine + voidGap/2;
         return { leftX: left, rightX: right, center: centerLine, splitW: 0, decos: voidT > 0.5 ? [] : generateDecorations(yIndex, left, right) };
     }

     let left = centerLine - gap/2, right = centerLine + gap/2;
     return { leftX: left, rightX: right, center: centerLine, splitW: splitW, decos: generateDecorations(yIndex, left, right) };
}

function getWallX(screenY, isLeft) {
    let index = Math.floor((screenY + wallScrollOffset) / WALL_SEGMENT_HEIGHT);
    if (!wallSegments.length) return isLeft ? 0 : width;
    index = Math.max(0, Math.min(wallSegments.length - 2, index));
    let t = ((screenY + wallScrollOffset) % WALL_SEGMENT_HEIGHT) / WALL_SEGMENT_HEIGHT;
    let segA = wallSegments[index], segB = wallSegments[index + 1];
    if (isLeft) return segA.leftX + (segB.leftX - segA.leftX) * t;
    return segA.rightX + (segB.rightX - segA.rightX) * t;
}

function initWalls() {
    wallSegments = []; wallScrollOffset = 0;
    const needed = Math.ceil(height / WALL_SEGMENT_HEIGHT) + 4; 
    let startIdx = Math.floor(state.score / 2);
    for (let i = 0; i < needed; i++) wallSegments.push(getWallOffset(startIdx + i));
}

function drawDecoration(type, x, y, size, seed) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(seed * Math.PI * 2);    
    if (type === 'fossil') {
        ctx.strokeStyle = '#d7ccc8'; ctx.lineWidth = 1.5; ctx.beginPath();
        // Draw ammonite spiral
        for(let i=0; i<30; i++) {
            let a = 0.4 * i, r = (i/30) * size;
            let px = Math.cos(a)*r, py = Math.sin(a)*r;
            if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.stroke();
        // Add ribbing
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
        for(let j=0; j<10; j++) {
            let a = (j/10) * Math.PI * 2, r1 = size*0.3, r2 = size;
            ctx.beginPath(); ctx.moveTo(Math.cos(a)*r1, Math.sin(a)*r1); ctx.lineTo(Math.cos(a)*r2, Math.sin(a)*r2); ctx.stroke();
        }
    } else if (type === 'worm') {
        ctx.strokeStyle = '#d87093'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-size, 0); ctx.quadraticCurveTo(-size/2, size/2, 0, 0); ctx.quadraticCurveTo(size/2, -size/2, size, 0); ctx.stroke();
    } else if (type === 'sand') {
        ctx.fillStyle = arrToRgba(lighten(curColorBg, 20), 0.4);
        for(let j=0; j<3; j++) ctx.fillRect(-size, -size/2 + (j * size/3), size*2, size/6);
    } else if (type === 'ore_gold') {
        const grad = ctx.createRadialGradient(-size/4, -size/4, size/10, 0, 0, size);
        grad.addColorStop(0, '#fff59d'); grad.addColorStop(0.3, '#ffd700'); grad.addColorStop(1, '#b8860b');
        ctx.fillStyle = grad;
        ctx.beginPath();
        // Irregular nugget shape
        for(let i=0; i<8; i++) {
            let a = (i/8)*Math.PI*2, r = size * (0.7 + Math.sin(seed*10 + i)*0.3);
            if(i===0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r); else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
        }
        ctx.closePath(); ctx.fill();
        // Sparkle
        ctx.fillStyle = '#fff';
        if (Math.sin(state.time*10 + seed*100) > 0.8) {
            ctx.beginPath(); ctx.arc(Math.cos(seed*5)*size*0.5, Math.sin(seed*5)*size*0.5, 2, 0, Math.PI*2); ctx.fill();
        }
    } else if (type === 'gem') {
        const gemColor = seed > 0.66 ? '#00e676' : (seed > 0.33 ? '#00e5ff' : '#d500f9');
        ctx.shadowBlur = 15; ctx.shadowColor = gemColor;
        ctx.fillStyle = gemColor;
        // Crystal shape
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size/1.5, 0); ctx.lineTo(0, size); ctx.lineTo(-size/1.5, 0); ctx.closePath(); ctx.fill();
        // Facets
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-size/1.5, 0); ctx.lineTo(size/1.5, 0); ctx.stroke();
        // Inner highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size/1.5, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
    } else if (type === 'magma_crack') {
        ctx.strokeStyle = '#ff3d00'; ctx.lineWidth = 2.5; ctx.shadowBlur = 15; ctx.shadowColor = '#ff6d00';
        ctx.beginPath(); ctx.moveTo(0, -size*1.5); ctx.lineTo(size*0.3, 0); ctx.lineTo(-size*0.2, size); ctx.lineTo(size*0.5, size*1.5); ctx.stroke(); ctx.shadowBlur = 0;
    } else if (type === 'lava_pool') {
        ctx.rotate(-seed * Math.PI * 2); 
        const ct = state.time * 2 + seed * 10;
        ctx.fillStyle = '#bf360c'; ctx.beginPath(); ctx.ellipse(0, 0, size*1.6, size*0.9, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff6d00'; ctx.shadowBlur = 15 + Math.sin(ct)*5; ctx.shadowColor = '#ff3d00';
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
            let a = (i / 14) * Math.PI * 2;
            let rm = 0.8 + (Math.sin(ct + i * 5) * 0.15);
            let px = Math.cos(a) * size * 1.5 * rm, py = Math.sin(a) * size * 0.8 * rm;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        // Bubbles
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for(let i=0; i<2; i++) {
            let by = ((ct*30 + i*40) % (size*1.4)) - size*0.7;
            ctx.beginPath(); ctx.arc(Math.sin(ct+i)*size, by, 2, 0, Math.PI*2); ctx.fill();
        }
    } else if (type === 'basalt') {
        ctx.rotate(-seed * Math.PI * 2); // Keep vertical
        ctx.fillStyle = '#263238'; ctx.strokeStyle = '#37474f'; ctx.lineWidth = 2;
        for(let i=0; i<3; i++) {
            ctx.save(); ctx.translate((i-1)*size*0.8, (i%2)*size*0.4);
            ctx.beginPath(); 
            for(let j=0; j<6; j++) {
                let a = (j/6)*Math.PI*2, r = size*0.6;
                if(j===0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r); else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.moveTo(0, -size*0.6); ctx.lineTo(size*0.5, -size*0.3); ctx.lineTo(0, 0); ctx.fill();
            ctx.restore();
        }
    } else if (type === 'root') {
        ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size/3, 0); ctx.lineTo(size/2, size); ctx.moveTo(size/3, 0); ctx.lineTo(-size/2, size/2); ctx.stroke();
    } else if (type === 'rock_dark') {
        ctx.fillStyle = '#1a100a'; ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI*2); ctx.fill();
    } else if (type.startsWith('cave')) {
        ctx.rotate(-seed * Math.PI * 2); ctx.beginPath();
        const segs = 16, rand = seed < 0.5 ? 0.3 : 0.05, xs = 1.0 + (seed * 0.5); 
        for (let i = 0; i <= segs; i++) {
            let a = (i / segs) * Math.PI * 2, rm = 0.7 + (Math.sin(seed * 70 + i * 4) * rand);
            let px = Math.cos(a) * size * rm * xs, py = Math.sin(a) * size * rm * 0.7;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fillStyle = arrToRgba(darken(curColorBg, 15), 0.8); ctx.fill();
        const cStroke = arrToRgb(lighten(curColorWall, 40));
        ctx.strokeStyle = cStroke; ctx.lineWidth = 4; ctx.shadowBlur = 15; ctx.shadowColor = arrToRgba(lighten(curColorWall, 40), 0.8); ctx.stroke(); ctx.shadowBlur = 0;
        if (type === 'cave_water') {
            ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(21, 101, 192, 0.7)'; ctx.beginPath(); ctx.moveTo(-size * 1.5, size * 0.1);
            for(let cx = -size * 1.5; cx <= size * 1.5; cx += size*0.2) ctx.lineTo(cx, size*0.1 + Math.sin(state.time * 3 + cx * 0.15 + seed * 10) * (size*0.08));
            ctx.lineTo(size * 1.5, size * 1.5); ctx.lineTo(-size * 1.5, size * 1.5); ctx.fill(); ctx.restore();
        }
    } else if (type === 'bg_bone') {
        ctx.fillStyle = 'rgba(255, 250, 240, 0.4)'; ctx.shadowBlur = 5; ctx.shadowColor = 'rgba(0,0,0,0.3)';
        let r = size * 0.4;
        // Femur shaft
        ctx.beginPath(); ctx.roundRect(-size*0.8, -size*0.2, size*1.6, size*0.4, 5); ctx.fill();
        // Joints (rounded ends)
        ctx.beginPath(); ctx.arc(-size*0.8, -size*0.2, r, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-size*0.8, size*0.2, r, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(size*0.8, -size*0.2, r, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(size*0.8, size*0.2, r, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.restore();
}

function updateDrawWalls(dt, fallSpeed) {
    if (state.coreSpawned) fallSpeed *= 0.1; 
    wallScrollOffset += fallSpeed * dt;
    
    // --- Heat Haze Effect (Magma Layer) ---
    let haze = 0;
    if (state.score > 3000) haze = Math.sin(state.time * 4) * 8 * (state.score / CONFIG.MAX_DEPTH);
    let gIdx = Math.floor(state.score / 2);
    const shift = Math.floor(wallScrollOffset / WALL_SEGMENT_HEIGHT);
    if (shift > 0) {
        for(let i=0; i<shift; i++) { wallSegments.shift(); wallSegments.push(getWallOffset(gIdx + wallSegments.length)); }
        wallScrollOffset %= WALL_SEGMENT_HEIGHT;
    }
    const cWall = arrToRgb(curColorWall), cSolid = arrToRgb(curColorBg), cStroke = arrToRgb(lighten(curColorWall, 40));
    const grad = ctx.createLinearGradient(width/2 - 200, 0, width/2 + 200, 0);
    grad.addColorStop(0, arrToRgba(curColorBg, 0.2)); grad.addColorStop(0.5, arrToRgba(curColorBg, 0.6)); grad.addColorStop(1, arrToRgba(curColorBg, 0.2));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = arrToRgb(curColorWall); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wallSegments[0].leftX, -wallScrollOffset);
    for (let i = 1; i < wallSegments.length; i++) ctx.lineTo(wallSegments[i].leftX, i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
    ctx.lineTo(0, height + WALL_SEGMENT_HEIGHT); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(width, 0); ctx.lineTo(wallSegments[0].rightX, -wallScrollOffset);
    for (let i = 1; i < wallSegments.length; i++) ctx.lineTo(wallSegments[i].rightX, i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
    ctx.lineTo(width, height + WALL_SEGMENT_HEIGHT); ctx.closePath(); ctx.fill();

    // --- Premium 3D Wall Shadows ---
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.shadowBlur = 30; ctx.shadowColor = 'black';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(wallSegments[0].leftX, -wallScrollOffset);
    for (let i = 1; i < wallSegments.length; i++) ctx.lineTo(wallSegments[i].leftX, i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wallSegments[0].rightX, -wallScrollOffset);
    for (let i = 1; i < wallSegments.length; i++) ctx.lineTo(wallSegments[i].rightX, i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
    ctx.stroke();
    ctx.restore();
    // --- Stabilized Island Rendering (Polygon Grouping) ---
    let islandClusters = [];
    let curC = null;
    wallSegments.forEach((seg, i) => {
        if (seg.splitW > 0) {
            if (!curC) { curC = { start: i, segments: [] }; islandClusters.push(curC); }
            curC.segments.push({ i, splitW: seg.splitW, center: seg.center });
        } else { curC = null; }
    });

    islandClusters.forEach(cluster => {
        ctx.beginPath();
        const first = cluster.segments[0];
        const last = cluster.segments[cluster.segments.length - 1];
        
        // Starting at the top left of the island
        ctx.moveTo(first.center - first.splitW/2, first.i * WALL_SEGMENT_HEIGHT - wallScrollOffset - 2); 
        
        // Trace left side down
        cluster.segments.forEach(s => {
            ctx.lineTo(s.center - s.splitW/2, s.i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
        });
        
        // Bottom edge
        ctx.lineTo(last.center + last.splitW/2, last.i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
        
        // Trace right side up
        for (let j = cluster.segments.length - 1; j >= 0; j--) {
            let s = cluster.segments[j];
            ctx.lineTo(s.center + s.splitW/2, s.i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
        }
        
        // Close polygon
        ctx.closePath();
        ctx.fillStyle = cWall; ctx.fill();
        ctx.strokeStyle = cStroke; ctx.lineWidth = 6; ctx.lineJoin = 'round';
        ctx.stroke();
    });
    wallSegments.forEach((seg, i) => {
        let py = i * WALL_SEGMENT_HEIGHT - wallScrollOffset;
        seg.decos.forEach(d => { let dy = py + d.yOffset; if (dy > -50 && dy < height + 50) drawDecoration(d.type, d.x, dy, d.size, d.seed); });
    });
    ctx.strokeStyle = cStroke; ctx.shadowBlur = 15; ctx.shadowColor = arrToRgba(lighten(curColorWall, 30), 0.8); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(wallSegments[0].leftX, -wallScrollOffset);
    for (let i = 1; i < wallSegments.length; i++) ctx.lineTo(wallSegments[i].leftX, i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wallSegments[0].rightX, -wallScrollOffset);
    for (let i = 1; i < wallSegments.length; i++) ctx.lineTo(wallSegments[i].rightX, i * WALL_SEGMENT_HEIGHT - wallScrollOffset);
    ctx.stroke(); ctx.shadowBlur = 0;
}

function constrainPlayer() {
    const r = player.radius, wl = getWallX(player.y, true), wr = getWallX(player.y, false);
    if (player.x - r < wl) { player.x = wl + r; player.vx = 0; state.shake = Math.max(state.shake, 5); spawnParticles(player.x - r, player.y, 1, 0.5, arrToRgb(curColorWall)); }
    if (player.x + r > wr) { player.x = wr - r; player.vx = 0; state.shake = Math.max(state.shake, 5); spawnParticles(player.x + r, player.y, 1, 0.5, arrToRgb(curColorWall)); }
    
    // Island Collision
    const index = Math.floor((player.y + wallScrollOffset) / WALL_SEGMENT_HEIGHT);
    const seg = wallSegments[Math.max(0, Math.min(wallSegments.length-1, index))];
    if (seg && seg.splitW > 0) {
        const iL = seg.center - seg.splitW/2, iR = seg.center + seg.splitW/2;
        if (player.x + r > iL && player.x - r < iR) {
            if (player.vx > 0) { player.x = iL - r; player.vx = 0; }
            else if (player.vx < 0) { player.x = iR + r; player.vx = 0; }
            else { player.x = player.x < seg.center ? iL - r : iR + r; }
            state.shake = Math.max(state.shake, 3);
        }
    }
}

function updateDrawBgLines(dt, fallSpeed) {
    if (Math.random() < 0.6 * state.speedMultiplier * dt && !state.coreSpawned) {
        backgroundLines.push({ 
            y: height + 50, 
            x: Math.random() * width, 
            length: Math.random() * height * 0.4 + 100, 
            speed: Math.random() * 400 + 200, 
            alpha: Math.random() * 0.2 + 0.05,
            width: Math.random() * 3 + 1
        });
    }
    
    // --- High Speed Motion Blur Streaks ---
    if (state.speedMultiplier > 2.5 && Math.random() < 0.3) {
        backgroundLines.push({ y: height+50, x: Math.random()*width, length: 400, speed: 2000, alpha: 0.3, width: 1, color: '#fff' });
    }

    for (let i = backgroundLines.length - 1; i >= 0; i--) {
        let l = backgroundLines[i]; l.y -= (fallSpeed + l.speed) * dt; 
        
        let r = Math.min(255, 200 + state.score * 0.02);
        let g = Math.max(0, 150 - state.score * 0.03);
        
        ctx.strokeStyle = l.color || `rgba(${Math.floor(r)}, ${Math.floor(g)}, 0, ${l.alpha})`;
        ctx.lineWidth = l.width || 2;
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + l.length); ctx.stroke(); if (l.y + l.length < 0) backgroundLines.splice(i, 1);
    }
}

function spawnObstacle() {
    if (obstacles.length > 0) {
        let l = obstacles[obstacles.length-1], fs = CONFIG.BASE_FALL_SPEED * state.speedMultiplier;
        if ((height + 100) - l.y < fs * (width*0.45/player.speed) * 1.3) return;
    }
    const sy = height + 100;
    const idx = Math.floor((sy + wallScrollOffset) / WALL_SEGMENT_HEIGHT);
    const seg = wallSegments[Math.max(0, Math.min(wallSegments.length-1, idx))];

    let ag = getWallX(sy, false) - getWallX(sy, true);
    let maxAllowedLen = ag * 0.65;
    
    // Safety check for islands: ensure obstacle doesn't block the narrow path
    if (seg && seg.splitW > 0) {
        let subGap = (ag - seg.splitW) / 2;
        maxAllowedLen = subGap * 0.45;
    }

    let ty = 'blunt', th = 40 + Math.random() * 60, isL = Math.random() < 0.5, st = Math.floor(Math.random() * 3);
    let sb = 1.0 / Math.sqrt(state.speedMultiplier), lr = (0.15 + Math.random() * 0.45) * sb; 
    let finalLen = Math.min(maxAllowedLen, ag * lr);

    if (state.score > 3000 && Math.random() < 0.4) { 
        ty = 'lava'; finalLen = Math.min(maxAllowedLen, (0.4 + Math.random() * 0.3) * ag * sb); th = 100 + Math.random() * 100; 
    } else if (Math.random() < 0.2) { 
        ty = 'boulder'; finalLen = Math.min(maxAllowedLen, (0.2 + Math.random() * 0.15) * ag); th = 80 + Math.random() * 40; 
    }
    
    obstacles.push({ y: sy, length: finalLen, thickness: th, isLeft: isL, type: ty, subType: st });
}

function updateDrawObstacles(dt, fallSpeed) {
    if (state.coreSpawned) return; 
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i]; o.y -= fallSpeed * dt; if (o.y < -150) { obstacles.splice(i, 1); continue; }
        let rl = o.length, d = o.isLeft ? 1 : -1;
        if (o.type === 'blunt') {
            // Foreground Grey Palette (High Contrast)
            let c1 = [60, 60, 65], c2 = [100, 100, 110], c3 = [160, 160, 175];
            ctx.strokeStyle = '#222'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
            let p1 = 0.2, p2 = 0.5, p3 = 1.2, m1 = 0.85, m2 = 0.5;
            if (o.subType === 1) { p1 = 0; p2 = 0.9; p3 = 1.0; m1 = 0.95; } else if (o.subType === 2) { p1 = -0.2; p2 = 0.4; p3 = 0.8; m1 = 0.6; }
            let yt = o.y - o.thickness * p1, ym = o.y + o.thickness * p2, yb = o.y + o.thickness * p3;
            // Draw Outline
            ctx.beginPath(); ctx.moveTo(getWallX(yt, o.isLeft), yt); ctx.lineTo(getWallX(ym, o.isLeft) + d * rl, ym); ctx.lineTo(getWallX(yb, o.isLeft), yb); ctx.stroke();
            ctx.fillStyle = arrToRgb(c1); ctx.fill(); 
            // Textured facets
            ctx.fillStyle = arrToRgb(c2); ctx.beginPath();
            ctx.moveTo(getWallX(o.y, o.isLeft), o.y); ctx.lineTo(getWallX(o.y + o.thickness*0.5, o.isLeft) + d * rl * m1, o.y + o.thickness*0.5); ctx.lineTo(getWallX(o.y + o.thickness, o.isLeft), o.y+o.thickness); ctx.fill();
            ctx.strokeStyle = arrToRgba(c3, 0.6); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(getWallX(o.y + o.thickness*0.3, o.isLeft), o.y+o.thickness*0.3); ctx.lineTo(getWallX(o.y + o.thickness*0.5, o.isLeft) + d*rl*0.6, o.y+o.thickness*0.5); ctx.stroke();
        } else if (o.type === 'boulder') {
            // Foreground Grey Palette
            let c1 = [80, 80, 85], c2 = [140, 140, 150];
            ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
            let yt = o.y - o.thickness*0.2, yb = o.y + o.thickness*1.2;
            ctx.beginPath();
            ctx.moveTo(getWallX(yt, o.isLeft), yt);
            ctx.bezierCurveTo(getWallX(o.y, o.isLeft) + d * rl * 1.5, o.y, getWallX(o.y+o.thickness, o.isLeft) + d * rl * 1.5, o.y + o.thickness, getWallX(yb, o.isLeft), yb);
            ctx.stroke(); ctx.fillStyle = arrToRgb(c1); ctx.fill();
            // Highlight bulge
            ctx.fillStyle = arrToRgb(c2); ctx.beginPath();
            ctx.ellipse(getWallX(o.y+o.thickness*0.5, o.isLeft) + d*rl*0.4, o.y+o.thickness*0.5, rl*0.3, o.thickness*0.4, 0, 0, Math.PI*2); ctx.fill();
        } else if (o.type === 'lava') {
            ctx.strokeStyle = arrToRgb(curColorWall); ctx.lineWidth = 4; ctx.shadowBlur = 15; ctx.shadowColor = '#f4511e'; ctx.fillStyle = '#ff6d00';
            ctx.beginPath(); ctx.moveTo(getWallX(o.y, o.isLeft), o.y); ctx.lineTo(getWallX(o.y+o.thickness*0.5, o.isLeft) + d * rl, o.y+o.thickness*0.5); ctx.lineTo(getWallX(o.y+o.thickness, o.isLeft), o.y+o.thickness); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.shadowBlur = 0;
        }
    }
    if (Math.random() < (1.2 * state.speedMultiplier + state.score * 0.0005) * dt && !state.coreSpawned && state.score < 4700) spawnObstacle();
}

function collisionCheck() {
    if (state.coreSpawned && player.y > state.coreY - width * 0.65) return gameWin();
    if (state.testMode || state.time < 2.5) return false; // Early game invincibility
    const pr = player.radius * 0.7;
    for (let obs of obstacles) {
        if (player.y + pr > obs.y - obs.thickness*0.2 && player.y - pr < obs.y + obs.thickness*1.2) {
            let rl = obs.length, relY = player.y - obs.y, nY = relY / obs.thickness; 
            let prof = obs.subType === 1 ? (nY > 0 && nY < 1.0 ? 1.0 : 0) : (obs.subType === 2 ? 1 - Math.abs(nY - 0.4)/0.6 : 1 - Math.abs(nY - 0.5)/0.5);
            if (obs.type === 'lava' || obs.type === 'boulder') prof = 1 - Math.pow(Math.abs(nY - 0.5)*2, 2); 
            let peak = rl * Math.max(0, prof) * 0.8;
            if (obs.type === 'boulder') peak = rl * Math.max(0, prof) * 1.2;
            if (obs.isLeft ? (player.x - pr < getWallX(player.y, true) + peak) : (player.x + pr > getWallX(player.y, false) - peak)) return true;
        }
    }
    return false;
}

function spawnParticles(x, y, count, mult = 1, fixedColor = null) {
    const colors = fixedColor ? [fixedColor] : ['#ffffff', '#ff69b4', '#8a2be2', '#da70d6']; // White, Pink, Violet/Purple
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random()-0.5)*300*mult, vy: (Math.random()-0.5)*300*mult, life: 1.0, size: Math.random()*5+2, color: colors[Math.floor(Math.random()*colors.length)] });
}

function updateDrawParticles(dt, fallSpeed) {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt - fallSpeed * dt; p.life -= dt * (Math.random()*1.5+0.5);
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;
}

function drawPlayer(dt) {
    if (!state.isRunning && state.time === 0 && !state.gameWon) return; 
    // Shattering effect: hide player if we just crashed
    if (!state.isRunning && state.time > 0 && !state.gameWon && !state.gameWin) return;
    
    ctx.save();
    ctx.globalAlpha = (state.testMode) ? 0.5 : 1.0; 
    ctx.translate(player.x, player.y);
    let g = 30 + Math.abs(Math.sin(state.time*5 || 0))*15 + (state.score/CONFIG.MAX_DEPTH)*25;
    ctx.translate(state.gameWon ? 0 : Math.random()*2-1, state.gameWon ? 0 : Math.random()*2-1);
    ctx.rotate(player.angle); ctx.shadowBlur = g; ctx.shadowColor = '#ffffff'; // White/Bright glow
    let s = player.radius; ctx.fillStyle = '#b3728f'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s*0.8, -s*0.3); ctx.lineTo(s*0.6, s*0.8); ctx.lineTo(-s*0.5, s*0.9); ctx.lineTo(-s*0.9, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#e8bacb'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(-s*0.9, 0); ctx.lineTo(-s*0.3, -s*0.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a4f6a'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s*0.8, -s*0.3); ctx.lineTo(s*0.2, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(-s*0.3, -s*0.4); ctx.lineTo(0, s*0.2); ctx.lineTo(s*0.2, 0); ctx.closePath(); ctx.fill();

    // Simplified tail logic using the same rock color - Pink/Purple trail
    if (Math.abs(player.vx) > 100) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#ff69b4';
        for(let i=1; i<4; i++) {
            ctx.save(); ctx.translate(-player.vx * 0.015 * i, 0); 
            ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s*0.8, -s*0.3); ctx.lineTo(s*0.6, s*0.8); ctx.lineTo(-s*0.5, s*0.9); ctx.lineTo(-s*0.9, 0); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    }
    ctx.restore();
}

function drawCore(dt, fallSpeed) {
    if (!state.coreSpawned) return;
    state.coreY -= fallSpeed * dt; let ct = state.time * 5; ctx.shadowBlur = 100 + Math.sin(ct)*30; ctx.shadowColor = '#fff';
    ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.arc(width/2, state.coreY, width*0.8 + Math.sin(ct)*20, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(width/2, state.coreY, width*0.6 + Math.sin(ct*1.5)*15, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(width/2, state.coreY, width*0.4, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
}

// Removed GrandCanyon


function gameWin() {
    state.isRunning = false; state.gameWon = true; 
    document.getElementById('game-container').animate([{backgroundColor: '#fff', opacity: 1}, {backgroundColor: 'transparent', opacity: 1}], {duration: 2000});
    setTimeout(() => { 
        mainTitle.innerHTML = 'PLANET<br><span class="subtitle glow-text">CONQUERED!</span>'; 
        gameMessage.innerHTML = "You reached the molten core!"; 
        finalScoreEl.innerText = "CORE (5000m)"; 
        highScoreEl.innerText = "CORE"; 
        finalScoreContainer.classList.remove('hidden'); 
        startBtn.innerText = "PLAY AGAIN"; 
        overlay.classList.remove('hidden'); 
        shareBtn.classList.remove('hidden'); 
    }, 1500);
}

function gameOver() {
    state.isRunning = false; state.shake = 30; 
    spawnParticles(player.x, player.y, 200, 4); // Shatter effect - more particles
    document.getElementById('game-container').animate([{transform:'translate(15px,15px)'},{transform:'translate(-15px,-15px)'},{transform:'translate(0,0)'}], {duration:500});
    const fs = Math.floor(state.score); 
    let isNewRecord = false;
    if (fs > state.highScore) { 
        state.highScore = fs; 
        localStorage.setItem('seismic_high_score', fs); 
        isNewRecord = true;
    }
    setTimeout(() => { 
        mainTitle.innerHTML = isNewRecord ? 'NEW<br><span class="subtitle glow-text">RECORD!</span>' : 'SEISMIC<br><span class="subtitle">Core Tamer</span>'; 
        gameMessage.innerHTML = isNewRecord ? `Incredible! You reached ${fs}m depth.` : "You crashed into a rock."; 
        finalScoreEl.innerText = fs + "m"; 
        highScoreEl.innerText = state.highScore + "m"; 
        finalScoreContainer.classList.remove('hidden'); 
        startBtn.innerText = "TRY AGAIN"; 
        overlay.classList.remove('hidden'); 
        shareBtn.classList.remove('hidden'); 
    }, 1200);
}

function shareX() {
    const score = Math.floor(state.score);
    const text = score >= CONFIG.MAX_DEPTH ? 
        `I CONQUERED THE EARTH'S CORE! 🌋 Depth ${score}m in Seismic: Core Dodger! Can you do better?` :
        `My result: ${score}m in Seismic: Core Dodger! 🌋 Try to reach the planet's core!`;
    const url = window.location.hostname === 'localhost' || window.location.hostname === '' ? 'https://seismic-game.vercel.app' : window.location.href;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = Math.min(0.1, (timestamp - lastTime) / 1000); 
    lastTime = timestamp;

    if (state.shake > 0) { state.shake *= 0.95; if (state.shake < 0.1) state.shake = 0; }
    
    ctx.clearRect(0, 0, width, height); 
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random()-0.5)*state.shake, (Math.random()-0.5)*state.shake);

    if (state.isRunning) {
        state.time += dt; state.speedMultiplier = 1 + (state.score / 1500);
        if (state.score < CONFIG.MAX_DEPTH && !state.coreSpawned) {
            const os = Math.floor(state.score); state.score += (20 * state.speedMultiplier) * dt; 
            const ns = Math.floor(state.score); scoreEl.innerText = ns;
            if (Math.floor(ns/100) > Math.floor(os/100)) { scoreEl.classList.remove('score-pop'); void scoreEl.offsetWidth; scoreEl.classList.add('score-pop'); }
            if (state.score >= CONFIG.MAX_DEPTH) { state.score = CONFIG.MAX_DEPTH; scoreEl.innerText = "CORE!"; state.coreSpawned = true; state.coreY = height + width; obstacles = []; }
        }
        updateColorsAndLayer();
        let tvx = keys.left ? -player.speed : (keys.right ? player.speed : 0);
        player.vx += (tvx - player.vx) * 12 * dt; player.x += player.vx * dt;
        
        let targetY = height * 0.15;
        if (player.y > targetY) player.y -= (player.y - targetY) * 5 * dt;

        let ss = 3 + (Math.abs(player.vx) / 150); player.angle += (player.vx < 0 ? -ss : ss) * dt;
        if (!state.coreSpawned || state.coreY > height*0.3) constrainPlayer();
        if (Math.random() < 0.3 && !state.gameWon) spawnParticles(player.x, player.y - player.radius+5, 2, 0.4);
        if (collisionCheck()) gameOver();
        
        // Final Core Descent Logic
        if (state.coreSpawned) {
             let targetY = height + 500; // Fall deep into it
             player.y += (targetY - player.y) * 0.5 * dt;
        }
    }

    const fs = state.isRunning ? (CONFIG.BASE_FALL_SPEED * state.speedMultiplier) : 0;
    const step = state.isRunning ? dt : 0;

    if (state.gameWon) {
        state.time += dt; player.angle += 10 * dt; 
        player.y += (height + 200 - player.y) * 0.5 * dt;
        drawCore(dt, 0); updateDrawWalls(0, 0);
        layerEl.style.color = '#fff';
    } else {
        updateDrawWalls(step, fs); 
        updateDrawBgLines(step, fs); 
        drawCore(step, fs); 
        updateDrawObstacles(step, fs); 
        updateDrawParticles(dt, fs); 
        
        // Darkness Vignette
        const inv = 0.3 + (state.score/CONFIG.MAX_DEPTH)*0.4;
        const gradV = ctx.createRadialGradient(width/2, height/2, width*0.3, width/2, height/2, width*0.9);
        gradV.addColorStop(0, 'rgba(0,0,0,0)'); gradV.addColorStop(1, `rgba(0,0,0,${inv})`); 
        ctx.fillStyle = gradV; ctx.fillRect(0,0,width,height);
    }

    // --- ABSOLUTE FINAL RENDER PASS: PLAYER ---
    // Drawing outside state-specific blocks to ensure it's ALWAYS on top
    drawPlayer(dt);

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

function startGame(test) { 
    state.isRunning = true; state.score = 0; state.time = 0.001; state.speedMultiplier = 1; state.testMode = test; state.lastLayer = ''; 
    obstacles = []; particles = []; backgroundLines = []; player.vx = 0; player.angle = 0;
    state.gameWon = false; state.coreSpawned = false; 
    curColorBg = levels[0].bg; curColorWall = levels[0].wall;
    resize(); initWalls(); updateColorsAndLayer(); 
    player.x = width/2; player.y = height*0.15;
    overlay.classList.add('hidden'); 
    shareBtn.classList.add('hidden'); 
}

startBtn.addEventListener('click', () => startGame(false));
document.getElementById('test-btn').addEventListener('click', () => startGame(true));
shareBtn.addEventListener('click', shareX);
resize(); initWalls(); requestAnimationFrame(gameLoop);
