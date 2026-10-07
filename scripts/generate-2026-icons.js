const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer');

// Ensure local bin and app bin are in PATH for webp tools (img2webp, webpmux, webpinfo)
const binDir = path.join(__dirname, '../bin');
const localBin = path.join(process.env.HOME || '/home/deck', '.local/bin');
process.env.PATH = `${binDir}:${localBin}:${process.env.PATH}`;

const ICONS_ROOT = path.join(__dirname, '../webroot/images/icons/2026');
const LARGE_DIR = path.join(ICONS_ROOT, 'large');
const STILLS_DIR = path.join(ICONS_ROOT, 'stills');
const DIR_24FPS = path.join(ICONS_ROOT, '24fps');
const DIR_30FPS = path.join(ICONS_ROOT, '30fps');
const DIR_60FPS = path.join(ICONS_ROOT, '60fps');

[LARGE_DIR, STILLS_DIR, DIR_24FPS, DIR_30FPS, DIR_60FPS].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
});

// Canvas size for HD super-sampled rendering
const VIEWPORT_SIZE = 384;

// Frame durations for seamless 1000ms loop across frame rates
function getFrameDuration(f, fps = 60) {
    if (fps === 24) {
        // 24 frames: 8 frames @ 41ms + 16 frames @ 42ms = 328 + 672 = 1000ms
        return (f % 3 === 0) ? 41 : 42;
    }
    if (fps === 30) {
        // 30 frames: 10 frames @ 34ms + 20 frames @ 33ms = 340 + 660 = 1000ms
        return (f % 3 === 0) ? 34 : 33;
    }
    // 60 frames: 20 frames @ 16ms + 40 frames @ 17ms = 320 + 680 = 1000ms
    return (f % 3 === 0) ? 16 : 17;
}

const CONCURRENCY = 4;

// SVG Element Builders & Gradients
function defs() {
    return `
    <defs>
        <!-- Gradients -->
        <radialGradient id="sunGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#fff9c4"/>
            <stop offset="35%" stop-color="#fbc02d"/>
            <stop offset="85%" stop-color="#f57c00"/>
            <stop offset="100%" stop-color="#e65100"/>
        </radialGradient>
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffb300" stop-opacity="0.6"/>
            <stop offset="60%" stop-color="#ff9800" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#ff9800" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="moonGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="45%" stop-color="#e2e8f0"/>
            <stop offset="80%" stop-color="#94a3b8"/>
            <stop offset="100%" stop-color="#64748b"/>
        </radialGradient>
        <linearGradient id="cloudFront" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="65%" stop-color="#e2e8f0"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
        </linearGradient>
        <linearGradient id="cloudRear" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#cbd5e1"/>
            <stop offset="60%" stop-color="#94a3b8"/>
            <stop offset="100%" stop-color="#64748b"/>
        </linearGradient>
        <linearGradient id="cloudStorm" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#64748b"/>
            <stop offset="50%" stop-color="#334155"/>
            <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
        <linearGradient id="rainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#7dd3fc"/>
            <stop offset="50%" stop-color="#0284c7"/>
            <stop offset="100%" stop-color="#0369a1"/>
        </linearGradient>
        <linearGradient id="rainHeavyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#bae6fd"/>
            <stop offset="40%" stop-color="#38bdf8"/>
            <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
        <linearGradient id="snowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#bae6fd"/>
        </linearGradient>
        <linearGradient id="sleetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="60%" stop-color="#7dd3fc"/>
            <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
        <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="25%" stop-color="#fff59d"/>
            <stop offset="75%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>

        <!-- Filters -->
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
        <filter id="softShadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#091428" flood-opacity="0.45"/>
        </filter>
        <filter id="boltGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2"/>
            <feMerge>
                <feMergeNode in="blur2"/>
                <feMergeNode in="blur1"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    </defs>`;
}

// 1. Dynamic Sun with rotating solar rays (45 deg cyclic symmetry for seamless loop)
function dynamicSun(x = 256, y = 256, r = 110, rays = true, t = 0) {
    let raysSvg = '';
    const coronaPulse = Math.sin(t * Math.PI * 2) * 5;
    if (rays) {
        const rotDeg = t * 45; // 8 rays spaced 45 deg, full 45 deg rotation = perfect seamless loop
        raysSvg = `<g transform="rotate(${rotDeg.toFixed(2)}, ${x}, ${y})" stroke="#f59e0b" stroke-width="14" stroke-linecap="round" opacity="0.94" filter="url(#glow)">`;
        for (let i = 0; i < 8; i++) {
            const angle = (i * 45) * Math.PI / 180;
            const r1 = r + 24;
            const r2 = r + 56;
            const x1 = x + r1 * Math.cos(angle);
            const y1 = y + r1 * Math.sin(angle);
            const x2 = x + r2 * Math.cos(angle);
            const y2 = y + r2 * Math.sin(angle);
            raysSvg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
        }
        raysSvg += `</g>`;
    }
    return `
    <g filter="url(#softShadow)">
        <circle cx="${x}" cy="${y}" r="${(r + 45 + coronaPulse).toFixed(1)}" fill="url(#sunGlow)"/>
        ${raysSvg}
        <circle cx="${x}" cy="${y}" r="${r}" fill="url(#sunGrad)" stroke="#fff" stroke-width="3" opacity="0.98"/>
        <!-- Specular Highlight -->
        <path d="M ${x - r * 0.7} ${y - r * 0.2} A ${r * 0.7} ${r * 0.7} 0 0 1 ${x} ${y - r * 0.7}" 
              stroke="#ffffff" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.75"/>
    </g>`;
}

// 2. Crescent Moon with craters
function moon(x = 256, y = 256, r = 100, t = 0) {
    const glowPulse = 0.15 + Math.sin(t * Math.PI * 2) * 0.05;
    return `
    <g filter="url(#softShadow)">
        <circle cx="${x}" cy="${y}" r="${r + 30}" fill="#38bdf8" opacity="${glowPulse.toFixed(2)}" filter="url(#glow)"/>
        <path d="M ${x + r * 0.4} ${y - r} 
                 A ${r} ${r} 0 1 0 ${x + r * 0.8} ${y + r * 0.7}
                 A ${r * 0.85} ${r * 0.85} 0 0 1 ${x + r * 0.4} ${y - r} Z" 
              fill="url(#moonGrad)" stroke="#ffffff" stroke-width="2.5"/>
        <!-- Moon Craters -->
        <circle cx="${x - r * 0.3}" cy="${y - r * 0.2}" r="${r * 0.14}" fill="#64748b" opacity="0.25"/>
        <circle cx="${x - r * 0.45}" cy="${y + r * 0.25}" r="${r * 0.18}" fill="#64748b" opacity="0.2"/>
        <circle cx="${x - r * 0.1}" cy="${y + r * 0.4}" r="${r * 0.1}" fill="#64748b" opacity="0.25"/>
    </g>`;
}

// 3. Twinkling Night Starfield
function dynamicStars(t = 0) {
    // 3 primary stars with staggered sinusoidal phases
    const star1Scale = 0.65 + 0.45 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
    const star2Scale = 0.65 + 0.45 * (0.5 + 0.5 * Math.sin((t + 0.33) * Math.PI * 2));
    const star3Scale = 0.65 + 0.45 * (0.5 + 0.5 * Math.sin((t + 0.67) * Math.PI * 2));

    const s1Op = (0.4 + 0.55 * star1Scale).toFixed(2);
    const s2Op = (0.4 + 0.55 * star2Scale).toFixed(2);
    const s3Op = (0.4 + 0.55 * star3Scale).toFixed(2);

    return `
    <g fill="#ffffff" filter="url(#glow)">
        <g transform="translate(120, 101) scale(${star1Scale.toFixed(2)}) translate(-120, -101)" opacity="${s1Op}">
            <polygon points="120,90 123,98 131,101 123,104 120,112 117,104 109,101 117,98"/>
        </g>
        <g transform="translate(390, 118) scale(${star2Scale.toFixed(2)}) translate(-390, -118)" opacity="${s2Op}">
            <polygon points="390,110 392,116 398,118 392,120 390,126 388,120 382,118 388,116"/>
        </g>
        <g transform="translate(410, 226) scale(${star3Scale.toFixed(2)}) translate(-410, -226)" opacity="${s3Op}">
            <polygon points="410,220 411,225 416,226 411,227 410,232 409,227 404,226 409,225"/>
        </g>
    </g>`;
}

// 4. Volumetric Cloud with harmonic atmospheric drift
function cloud(x = 240, y = 300, scale = 1, type = 'front', t = 0) {
    const fill = type === 'storm' ? 'url(#cloudStorm)' : (type === 'rear' ? 'url(#cloudRear)' : 'url(#cloudFront)');
    const stroke = type === 'storm' ? '#475569' : '#ffffff';
    const opacity = type === 'rear' ? '0.92' : '1';
    const driftY = Math.sin(t * Math.PI * 2) * 2.5;
    return `
    <g transform="translate(${x}, ${(y + driftY).toFixed(1)}) scale(${scale}) translate(-240, -300)" filter="url(#softShadow)" opacity="${opacity}">
        <path d="M 120 350
                 H 360
                 A 60 60 0 0 0 380 235
                 A 70 70 0 0 0 310 180
                 A 90 90 0 0 0 170 210
                 A 65 65 0 0 0 120 350 Z" 
              fill="${fill}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M 175 215 A 82 82 0 0 1 305 185" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.6"/>
        <path d="M 315 188 A 62 62 0 0 1 372 238" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.5"/>
    </g>`;
}

// 5. Procedural Falling Rain (Continuous seamless wrap, staggered depths, top/bottom alpha ramps)
function dynamicRain(t, count = 10, heavy = false, windSlant = -32) {
    const seeds = [
        { x: 155, len: 46, phase: 0.04, w: 7 },
        { x: 185, len: 54, phase: 0.45, w: 8 },
        { x: 215, len: 42, phase: 0.78, w: 6.5 },
        { x: 245, len: 52, phase: 0.18, w: 8 },
        { x: 275, len: 48, phase: 0.62, w: 7 },
        { x: 305, len: 56, phase: 0.31, w: 8 },
        { x: 335, len: 44, phase: 0.88, w: 6.5 },
        { x: 170, len: 50, phase: 0.24, w: 7 },
        { x: 230, len: 46, phase: 0.54, w: 6.5 },
        { x: 290, len: 54, phase: 0.72, w: 7 },
        { x: 140, len: 48, phase: 0.12, w: 7 },
        { x: 200, len: 58, phase: 0.38, w: 8 },
        { x: 260, len: 44, phase: 0.82, w: 6.5 },
        { x: 320, len: 52, phase: 0.58, w: 7.5 },
        { x: 350, len: 46, phase: 0.94, w: 6.5 },
        { x: 220, len: 55, phase: 0.08, w: 8 }
    ];
    const active = seeds.slice(0, count);
    const yTop = 270;
    const yBottom = 490;
    const travel = yBottom - yTop;

    let svg = `<g filter="url(#glow)">`;
    for (const drop of active) {
        const prog = (t + drop.phase) % 1.0;
        const curY = yTop + prog * travel;
        const curX = drop.x + prog * windSlant;

        // Smooth fade-in under cloud, fade-out near bottom
        let alpha = 1.0;
        if (prog < 0.12) alpha = prog / 0.12;
        else if (prog > 0.84) alpha = (1.0 - prog) / 0.16;

        const len = heavy ? drop.len * 1.25 : drop.len;
        const w = heavy ? drop.w + 1.5 : drop.w;
        const dx = windSlant * (len / travel);
        const x2 = curX + dx;
        const y2 = curY + len;
        const grad = heavy ? 'url(#rainHeavyGrad)' : 'url(#rainGrad)';

        svg += `<line x1="${curX.toFixed(1)}" y1="${curY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" 
                      stroke="${grad}" stroke-width="${w}" stroke-linecap="round" opacity="${alpha.toFixed(2)}"/>`;
    }
    svg += `</g>`;
    return svg;
}

// 6. Dynamic Drizzle with drifting fine droplets
function dynamicDrizzle(t, count = 10) {
    const seeds = [
        { x: 160, phase: 0.05, r: 5.5 },
        { x: 195, phase: 0.35, r: 5.0 },
        { x: 230, phase: 0.70, r: 6.0 },
        { x: 265, phase: 0.15, r: 5.5 },
        { x: 300, phase: 0.50, r: 5.0 },
        { x: 335, phase: 0.85, r: 5.5 },
        { x: 180, phase: 0.60, r: 4.5 },
        { x: 215, phase: 0.90, r: 5.0 },
        { x: 250, phase: 0.25, r: 5.5 },
        { x: 285, phase: 0.75, r: 4.5 },
        { x: 320, phase: 0.40, r: 5.0 },
        { x: 200, phase: 0.10, r: 5.0 }
    ];
    const active = seeds.slice(0, count);
    const yTop = 275;
    const yBottom = 480;
    const travel = yBottom - yTop;

    let drops = '';
    for (const d of active) {
        const prog = (t + d.phase) % 1.0;
        const curY = yTop + prog * travel;
        const sway = Math.sin(prog * Math.PI * 2) * 8;
        const curX = d.x + sway - prog * 15;

        let alpha = 0.9;
        if (prog < 0.15) alpha = (prog / 0.15) * 0.9;
        else if (prog > 0.82) alpha = ((1.0 - prog) / 0.18) * 0.9;

        drops += `<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="${d.r}" fill="#38bdf8" opacity="${alpha.toFixed(2)}" filter="url(#glow)"/>`;
    }
    return `<g>${drops}</g>`;
}

// 7. Dynamic 6-branched Snowflakes with rotation and sinusoidal swaying
function snowflake(cx, cy, r = 24, rot = 0) {
    let lines = '';
    for (let i = 0; i < 3; i++) {
        const angle = (i * 60 + rot) * Math.PI / 180;
        const x1 = cx - r * Math.cos(angle);
        const y1 = cy - r * Math.sin(angle);
        const x2 = cx + r * Math.cos(angle);
        const y2 = cy + r * Math.sin(angle);
        lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
        const br = r * 0.45;
        const bdx = br * Math.cos(angle + Math.PI / 4);
        const bdy = br * Math.sin(angle + Math.PI / 4);
        lines += `<line x1="${(x2 - bdx).toFixed(1)}" y1="${(y2 - bdy).toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
        lines += `<line x1="${(x1 + bdx).toFixed(1)}" y1="${(y1 + bdy).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`;
    }
    return `<g stroke="url(#snowGrad)" stroke-width="4" stroke-linecap="round" filter="url(#glow)">${lines}</g>`;
}

function dynamicSnow(t, count = 6, heavy = false, wind = false) {
    const seeds = [
        { x: 165, r: 24, phase: 0.05, swayAmp: 12, swayFreq: 1 },
        { x: 240, r: 28, phase: 0.45, swayAmp: 14, swayFreq: 1.5 },
        { x: 315, r: 22, phase: 0.80, swayAmp: 10, swayFreq: 1 },
        { x: 195, r: 20, phase: 0.25, swayAmp: 12, swayFreq: 1.2 },
        { x: 280, r: 26, phase: 0.65, swayAmp: 15, swayFreq: 1 },
        { x: 350, r: 18, phase: 0.90, swayAmp: 8,  swayFreq: 1.5 },
        { x: 145, r: 22, phase: 0.35, swayAmp: 11, swayFreq: 1 },
        { x: 220, r: 25, phase: 0.75, swayAmp: 13, swayFreq: 1.2 },
        { x: 295, r: 20, phase: 0.15, swayAmp: 10, swayFreq: 1.5 },
        { x: 330, r: 24, phase: 0.55, swayAmp: 12, swayFreq: 1 },
        { x: 175, r: 18, phase: 0.85, swayAmp: 9,  swayFreq: 1.2 },
        { x: 255, r: 22, phase: 0.40, swayAmp: 11, swayFreq: 1.5 }
    ];
    const active = seeds.slice(0, count);
    const yTop = 265;
    const yBottom = 485;
    const travel = yBottom - yTop;

    let flakes = '';
    for (const s of active) {
        const prog = (t + s.phase) % 1.0;
        const curY = yTop + prog * travel;
        const sway = Math.sin((prog * s.swayFreq) * Math.PI * 2) * s.swayAmp;
        const windDrift = wind ? prog * -70 : 0;
        const curX = s.x + sway + windDrift;

        let alpha = 1.0;
        if (prog < 0.12) alpha = prog / 0.12;
        else if (prog > 0.84) alpha = (1.0 - prog) / 0.16;

        const rot = (t * 60 + s.phase * 360) % 360;
        flakes += `<g opacity="${alpha.toFixed(2)}">${snowflake(curX, curY, s.r, rot)}</g>`;
    }
    return `<g filter="url(#softShadow)">${flakes}</g>`;
}

// 8. Dynamic Sleet / Ice Pellets falling rapidly
function dynamicSleet(t, count = 7) {
    const seeds = [
        { x: 170, phase: 0.08 },
        { x: 230, phase: 0.38 },
        { x: 290, phase: 0.72 },
        { x: 200, phase: 0.22 },
        { x: 260, phase: 0.54 },
        { x: 320, phase: 0.88 },
        { x: 345, phase: 0.42 },
        { x: 185, phase: 0.64 }
    ];
    const active = seeds.slice(0, count);
    const yTop = 270;
    const yBottom = 490;
    const travel = yBottom - yTop;

    let pellets = '';
    for (const s of active) {
        const prog = (t + s.phase) % 1.0;
        const curY = yTop + prog * travel;
        const curX = s.x - prog * 25;

        let alpha = 1.0;
        if (prog < 0.12) alpha = prog / 0.12;
        else if (prog > 0.85) alpha = (1.0 - prog) / 0.15;

        pellets += `
        <g transform="translate(${curX.toFixed(1)}, ${curY.toFixed(1)})" opacity="${alpha.toFixed(2)}" filter="url(#glow)">
            <polygon points="0,-12 9,0 0,12 -9,0" fill="url(#sleetGrad)" stroke="#ffffff" stroke-width="2"/>
        </g>`;
    }
    return `<g filter="url(#softShadow)">${pellets}</g>`;
}

// 9. Dynamic Lightning Bolt Strobe Flash
function dynamicLightning(t, severe = false) {
    // Primary Bolt: strikes between t=0.18 and 0.42 (flash onset, flicker dip, re-flash, dissipation)
    let op1 = 0;
    if (t >= 0.18 && t < 0.22) op1 = 1.0;
    else if (t >= 0.22 && t < 0.25) op1 = 0.35; // Ionization strobe flicker
    else if (t >= 0.25 && t < 0.32) op1 = 1.0;  // Secondary electric flash
    else if (t >= 0.32 && t < 0.42) op1 = (0.42 - t) / 0.10; // Afterglow dissipation

    let bolt1 = '';
    if (op1 > 0.01) {
        bolt1 = `
        <g opacity="${op1.toFixed(2)}">
            <polygon points="260,320 200,420 245,420 190,500 290,395 245,395 290,320"
                     fill="#67e8f9" opacity="0.6" filter="url(#boltGlow)"/>
            <polygon points="260,320 200,420 245,420 190,500 290,395 245,395 290,320"
                     fill="url(#boltGrad)" stroke="#ffffff" stroke-width="3" filter="url(#boltGlow)"/>
        </g>`;
    }

    // Secondary Bolt (for severe thunderstorms): staggered fork discharge at t=0.58 to 0.79
    let op2 = 0;
    if (severe) {
        if (t >= 0.58 && t < 0.62) op2 = 1.0;
        else if (t >= 0.62 && t < 0.65) op2 = 0.30;
        else if (t >= 0.65 && t < 0.71) op2 = 0.90;
        else if (t >= 0.71 && t < 0.79) op2 = (0.79 - t) / 0.08;
    }
    let bolt2 = '';
    if (severe && op2 > 0.01) {
        bolt2 = `
        <g opacity="${op2.toFixed(2)}">
            <polygon points="320,330 270,415 305,415 260,490 340,395 305,395 345,330"
                     fill="#fbbf24" opacity="0.6" filter="url(#boltGlow)"/>
            <polygon points="320,330 270,415 305,415 260,490 340,395 305,395 345,330"
                     fill="url(#boltGrad)" stroke="#ffffff" stroke-width="2.8" filter="url(#boltGlow)"/>
        </g>`;
    }
    return bolt1 + bolt2;
}

// 10. Flowing Wind Streamlines
function dynamicWind(x = 256, y = 280, t = 0) {
    const dashOffset = (t * 150).toFixed(1);
    return `
    <g stroke="#94a3b8" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.88" filter="url(#glow)">
        <path d="M 120,240 H 330 A 35,35 0 1,1 330,310 H 260" stroke-dasharray="120, 60" stroke-dashoffset="${dashOffset}"/>
        <path d="M 90,300 H 370 A 30,30 0 1,0 370,240 H 320"  stroke-dasharray="140, 70" stroke-dashoffset="${(-dashOffset * 1.1).toFixed(1)}"/>
        <path d="M 140,360 H 290 A 25,25 0 1,1 290,410 H 230" stroke-dasharray="100, 50" stroke-dashoffset="${(dashOffset * 0.9).toFixed(1)}"/>
    </g>`;
}

// 11. Undulating Fog Layers
function dynamicFog(t = 0) {
    const o1 = Math.sin(t * Math.PI * 2) * 16;
    const o2 = Math.sin((t + 0.25) * Math.PI * 2) * 16;
    const o3 = Math.sin((t + 0.50) * Math.PI * 2) * 16;
    const o4 = Math.sin((t + 0.75) * Math.PI * 2) * 16;
    return `
    <g stroke="#cbd5e1" stroke-width="18" stroke-linecap="round" opacity="0.90" filter="url(#glow)">
        <line x1="${(120 + o1).toFixed(1)}" y1="230" x2="${(390 + o1).toFixed(1)}" y2="230"/>
        <line x1="${(90  + o2).toFixed(1)}" y1="285" x2="${(420 + o2).toFixed(1)}" y2="285"/>
        <line x1="${(130 + o3).toFixed(1)}" y1="340" x2="${(370 + o3).toFixed(1)}" y2="340"/>
        <line x1="${(100 + o4).toFixed(1)}" y1="395" x2="${(400 + o4).toFixed(1)}" y2="395"/>
    </g>`;
}

// 12. Shimmering Atmospheric Haze
function dynamicHaze(t = 0) {
    const o1 = Math.sin(t * Math.PI * 2) * 12;
    const o2 = Math.sin((t + 0.33) * Math.PI * 2) * 12;
    const o3 = Math.sin((t + 0.66) * Math.PI * 2) * 12;
    return `
    <g>
        <circle cx="256" cy="220" r="100" fill="url(#sunGlow)"/>
        <circle cx="256" cy="220" r="70" fill="url(#sunGrad)" opacity="0.6"/>
        <g stroke="#fdba74" stroke-width="14" stroke-linecap="round" opacity="0.85" filter="url(#glow)">
            <line x1="${(100 + o1).toFixed(1)}" y1="260" x2="${(410 + o1).toFixed(1)}" y2="260"/>
            <line x1="${(120 + o2).toFixed(1)}" y1="315" x2="${(390 + o2).toFixed(1)}" y2="315"/>
            <line x1="${(80  + o3).toFixed(1)}" y1="370" x2="${(430 + o3).toFixed(1)}" y2="370"/>
            <line x1="${(140 + o1).toFixed(1)}" y1="420" x2="${(370 + o1).toFixed(1)}" y2="420"/>
        </g>
    </g>`;
}

// 13. Wafting Smoke Streams
function dynamicSmoke(t = 0) {
    const w1 = Math.sin(t * Math.PI * 2) * 15;
    const w2 = Math.sin((t + 0.33) * Math.PI * 2) * 15;
    const w3 = Math.sin((t + 0.66) * Math.PI * 2) * 15;
    return `
    <g stroke="#94a3b8" stroke-width="14" stroke-linecap="round" fill="none" opacity="0.75" filter="url(#glow)">
        <path d="M 160,430 Q ${(200 + w1).toFixed(1)},360 170,300 T ${(210 + w2).toFixed(1)},180 T 250,110"/>
        <path d="M 230,440 Q ${(280 + w2).toFixed(1)},350 240,280 T ${(290 + w3).toFixed(1)},170 T 330,90"/>
        <path d="M 300,450 Q ${(350 + w3).toFixed(1)},370 310,310 T ${(360 + w1).toFixed(1)},210 T 390,130"/>
    </g>`;
}

// 14. Blowing Dust Waves
function dynamicDust(t = 0) {
    const o = (t * 80).toFixed(1);
    return `
    <g stroke="#d97706" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.82" filter="url(#glow)">
        <path d="M 110,240 C 200,210 320,290 400,240" stroke-dasharray="140, 70" stroke-dashoffset="${o}"/>
        <path d="M 90,300 C 180,270 300,350 420,300"  stroke-dasharray="160, 80" stroke-dashoffset="${(-o * 1.2).toFixed(1)}"/>
        <path d="M 120,360 C 220,330 310,400 390,360" stroke-dasharray="120, 60" stroke-dashoffset="${(o * 0.9).toFixed(1)}"/>
        <path d="M 100,420 C 190,390 280,450 380,420" stroke-dasharray="150, 75" stroke-dashoffset="${(-o).toFixed(1)}"/>
    </g>`;
}

// 15. AM / PM Badges
function amBadge() {
    return `
    <g transform="translate(60, 60)" filter="url(#softShadow)">
        <rect width="96" height="46" rx="10" fill="#0284c7" stroke="#ffffff" stroke-width="2" opacity="0.95"/>
        <text x="48" y="32" font-family="'Interstate', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="26" fill="#ffffff" text-anchor="middle">AM</text>
    </g>`;
}

function pmBadge() {
    return `
    <g transform="translate(60, 60)" filter="url(#softShadow)">
        <rect width="96" height="46" rx="10" fill="#ea580c" stroke="#ffffff" stroke-width="2" opacity="0.95"/>
        <text x="48" y="32" font-family="'Interstate', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="26" fill="#ffffff" text-anchor="middle">PM</text>
    </g>`;
}

// Complete Map of all 82 Weather Condition Icons
const ICONS = {
    // Clear / Sun
    'Sun': (t) => dynamicSun(256, 256, 120, true, t),
    'MSun': (t) => `${dynamicSun(330, 190, 85, true, t)}${cloud(220, 310, 1.05, 'front', t)}`,
    'DPc': (t) => `${dynamicSun(330, 190, 85, true, t)}${cloud(220, 310, 1.05, 'front', t)}`,
    'DMc': (t) => `${dynamicSun(340, 180, 75, true, t)}${cloud(190, 270, 0.9, 'rear', t)}${cloud(240, 320, 1.1, 'front', t)}`,
    'Cld': (t) => `${cloud(190, 250, 0.95, 'rear', t)}${cloud(250, 310, 1.1, 'front', t)}`,

    // Clear / Night
    'NClr': (t) => `${dynamicStars(t)}${moon(256, 240, 110, t)}`,
    'NMClr': (t) => `${dynamicStars(t)}${moon(290, 210, 90, t)}${cloud(190, 340, 0.8, 'front', t)}`,
    'NPc': (t) => `${dynamicStars(t)}${moon(320, 190, 85, t)}${cloud(220, 310, 1.05, 'front', t)}`,
    'NMc': (t) => `${dynamicStars(t)}${moon(330, 180, 75, t)}${cloud(190, 270, 0.9, 'rear', t)}${cloud(240, 320, 1.1, 'front', t)}`,

    // Rain / Drizzle / Showers
    'Ra': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicRain(t, 10, false)}`,
    'LtRa': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicRain(t, 5, false)}`,
    'HvyRa': (t) => `${cloud(200, 210, 0.95, 'rear', t)}${cloud(240, 240, 1.1, 'storm', t)}${dynamicRain(t, 16, true)}`,
    'Sh': (t) => `${dynamicSun(340, 160, 70, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 8, false)}`,
    'SctSh': (t) => `${dynamicSun(340, 160, 70, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 6, false)}`,
    'NSctSh': (t) => `${dynamicStars(t)}${moon(340, 160, 70, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 6, false)}`,
    'Drz': (t) => `${cloud(240, 250, 1.05, 'front', t)}${dynamicDrizzle(t, 12)}`,
    'FrzDrz': (t) => `${cloud(240, 250, 1.05, 'front', t)}${dynamicDrizzle(t, 10)}${snowflake(340, 420, 20, t * 60)}`,
    'FrzRa': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicRain(t, 8, false)}${snowflake(330, 430, 22, t * 60)}`,
    'RaFrzRa': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicRain(t, 8, false)}${snowflake(330, 430, 22, t * 60)}`,

    // Snow / Flurries / Cold
    'Sn': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 7, false, false)}`,
    'LtSn': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 4, false, false)}`,
    'HvySn': (t) => `${cloud(190, 210, 0.95, 'rear', t)}${cloud(240, 240, 1.1, 'storm', t)}${dynamicSnow(t, 12, true, false)}`,
    'SnFl': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 5, false, false)}`,
    'SctFl': (t) => `${dynamicSun(340, 160, 70, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicSnow(t, 4, false, false)}`,
    'NSctFl': (t) => `${dynamicStars(t)}${moon(340, 160, 70, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicSnow(t, 4, false, false)}`,
    'SnSh': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 7, false, false)}`,
    'SctSnSh': (t) => `${dynamicSun(340, 160, 70, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicSnow(t, 5, false, false)}`,
    'NSctSnSh': (t) => `${dynamicStars(t)}${moon(340, 160, 70, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicSnow(t, 5, false, false)}`,
    'BlowSn': (t) => `${dynamicWind(256, 250, t)}${dynamicSnow(t, 8, true, true)}`,
    'Blizz': (t) => `${cloud(240, 210, 1.1, 'storm', t)}${dynamicWind(256, 320, t)}${dynamicSnow(t, 12, true, true)}`,
    'Frigid': (t) => `${snowflake(256, 256, 95, t * 45)}${snowflake(140, 160, 42, -t * 60)}${snowflake(370, 360, 48, t * 75)}`,

    // Sleet / Wintry Mix
    'Slt': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSleet(t, 8)}`,
    'SltFrzRa': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSleet(t, 6)}${dynamicRain(t, 6, false)}`,
    'SnSlt': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 5, false, false)}${dynamicSleet(t, 6)}`,
    'LtSnSlt': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 3, false, false)}${dynamicSleet(t, 4)}`,
    'SnFrzRa': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 5, false, false)}${dynamicRain(t, 6, false)}`,
    'LtSnFrzRa': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 3, false, false)}${dynamicRain(t, 4, false)}`,
    'RaSn': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicRain(t, 6, false)}${dynamicSnow(t, 5, false, false)}`,
    'RaSlt': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicRain(t, 6, false)}${dynamicSleet(t, 6)}`,
    'Mix': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicRain(t, 5, false)}${dynamicSnow(t, 4, false, false)}${dynamicSleet(t, 5)}`,
    'LtMix': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicRain(t, 3, false)}${dynamicSnow(t, 3, false, false)}${dynamicSleet(t, 3)}`,
    'SnToRa': (t) => `${cloud(240, 240, 1.05, 'front', t)}${dynamicSnow(t, 4, false, false)}${dynamicRain(t, 6, false)}`,

    // Thunderstorms / Lightning
    'Ts': (t) => `${cloud(190, 200, 0.95, 'rear', t)}${cloud(240, 230, 1.1, 'storm', t)}${dynamicLightning(t, false)}${dynamicRain(t, 12, true)}`,
    'SctTs': (t) => `${dynamicSun(340, 160, 70, true, t)}${cloud(230, 240, 1.0, 'storm', t)}${dynamicLightning(t, false)}${dynamicRain(t, 7, false)}`,
    'NSctTs': (t) => `${dynamicStars(t)}${moon(340, 160, 70, t)}${cloud(230, 240, 1.0, 'storm', t)}${dynamicLightning(t, false)}${dynamicRain(t, 7, false)}`,
    'SctStrTs': (t) => `${cloud(190, 200, 0.95, 'rear', t)}${cloud(240, 230, 1.15, 'storm', t)}${dynamicLightning(t, true)}${dynamicRain(t, 16, true)}`,
    'NSctStrTs': (t) => `${dynamicStars(t)}${moon(340, 160, 70, t)}${cloud(230, 230, 1.15, 'storm', t)}${dynamicLightning(t, true)}${dynamicRain(t, 16, true)}`,
    'Thun': (t) => `${cloud(240, 230, 1.1, 'storm', t)}${dynamicLightning(t, false)}`,
    'TsMix': (t) => `${cloud(240, 230, 1.1, 'storm', t)}${dynamicLightning(t, false)}${dynamicSnow(t, 4, false, false)}${dynamicRain(t, 6, false)}`,
    'TsSlt': (t) => `${cloud(240, 230, 1.1, 'storm', t)}${dynamicLightning(t, false)}${dynamicSleet(t, 6)}${dynamicRain(t, 6, false)}`,
    'TsSn': (t) => `${cloud(240, 230, 1.1, 'storm', t)}${dynamicLightning(t, false)}${dynamicSnow(t, 9, true, false)}`,

    // Atmosphere / Wind / Fog
    'Fog': (t) => dynamicFog(t),
    'DrzFog': (t) => `${dynamicFog(t)}${dynamicDrizzle(t, 8)}`,
    'Haze': (t) => dynamicHaze(t),
    'Smoke': (t) => dynamicSmoke(t),
    'Dust': (t) => dynamicDust(t),
    'Wnd': (t) => dynamicWind(256, 280, t),
    'SunWnd': (t) => `${dynamicSun(256, 200, 90, true, t)}${dynamicWind(256, 320, t)}`,
    'PcWnd': (t) => `${dynamicSun(330, 170, 75, true, t)}${cloud(210, 270, 0.95, 'front', t)}${dynamicWind(256, 360, t)}`,
    'CldWnd': (t) => `${cloud(240, 250, 1.05, 'front', t)}${dynamicWind(256, 360, t)}`,
    'NClrWnd': (t) => `${dynamicStars(t)}${moon(256, 200, 90, t)}${dynamicWind(256, 320, t)}`,
    'NPcWnd': (t) => `${dynamicStars(t)}${moon(330, 170, 75, t)}${cloud(210, 270, 0.95, 'front', t)}${dynamicWind(256, 360, t)}`,
    'WndRa': (t) => `${dynamicWind(256, 250, t)}${dynamicRain(t, 14, true, -60)}`,
    'WndSn': (t) => `${dynamicWind(256, 250, t)}${dynamicSnow(t, 9, true, true)}`,

    // AM / PM Badges
    'AMDrz': (t) => `${amBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicDrizzle(t, 10)}`,
    'PMDrz': (t) => `${pmBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicDrizzle(t, 10)}`,
    'AMRa': (t) => `${amBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 8, false)}`,
    'PMRa': (t) => `${pmBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 8, false)}`,
    'AMSh': (t) => `${amBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 8, false)}`,
    'PMSh': (t) => `${pmBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 8, false)}`,
    'AMSn': (t) => `${amBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicSnow(t, 6, false, false)}`,
    'PMSn': (t) => `${pmBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicSnow(t, 6, false, false)}`,
    'AMSnSh': (t) => `${amBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicSnow(t, 6, false, false)}`,
    'PMSnSh': (t) => `${pmBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicSnow(t, 6, false, false)}`,
    'AMMix': (t) => `${amBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 5, false)}${dynamicSnow(t, 4, false, false)}`,
    'PMMix': (t) => `${pmBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 5, false)}${dynamicSnow(t, 4, false, false)}`,
    'AMTs': (t) => `${amBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 240, 1.0, 'storm', t)}${dynamicLightning(t, false)}${dynamicRain(t, 7, false)}`,
    'PMTs': (t) => `${pmBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 240, 1.0, 'storm', t)}${dynamicLightning(t, false)}${dynamicRain(t, 7, false)}`,
    'AMRaSn': (t) => `${amBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 5, false)}${dynamicSnow(t, 4, false, false)}`,
    'PMRaSn': (t) => `${pmBadge()}${dynamicSun(340, 160, 65, true, t)}${cloud(230, 260, 1.0, 'front', t)}${dynamicRain(t, 5, false)}${dynamicSnow(t, 4, false, false)}`,
    'AMFgPMSu': (t) => `${dynamicFog(t)}${dynamicSun(330, 180, 80, true, t)}`,

    // Placeholders
    'BlankIcon': () => '',
    'NA': () => ''
};

function getOutputDirForFps(fps) {
    if (fps === 24) return DIR_24FPS;
    if (fps === 30) return DIR_30FPS;
    return DIR_60FPS;
}

function transcodeFrom60fps(srcWebp, targetWebp, targetFps, tempDir) {
    // If tiny placeholder, just copy
    if (fs.existsSync(srcWebp) && fs.statSync(srcWebp).size < 2048) {
        fs.copyFileSync(srcWebp, targetWebp);
        return;
    }

    fs.mkdirSync(tempDir, { recursive: true });
    // Clean existing files in tempDir
    for (const f of fs.readdirSync(tempDir)) {
        try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
    }

    const animDumpBin = path.join(process.env.HOME || '/home/deck', '.local/bin/anim_dump');
    const binToUse = fs.existsSync(animDumpBin) ? animDumpBin : 'anim_dump';
    execSync(`${binToUse} -folder "${tempDir}" "${srcWebp}"`);

    const frameArgs = [];
    if (targetFps === 30) {
        for (let f = 0; f < 30; f++) {
            const srcIdx = f * 2;
            const pad = String(srcIdx).padStart(4, '0');
            const framePath = path.join(tempDir, `dump_${pad}.png`);
            if (!fs.existsSync(framePath)) {
                throw new Error(`Frame ${framePath} not found for 30fps extraction`);
            }
            frameArgs.push(`-d ${getFrameDuration(f, 30)} "${framePath}"`);
        }
    } else if (targetFps === 24) {
        for (let f = 0; f < 24; f++) {
            const srcIdx = Math.min(59, Math.round(f * 60 / 24));
            const pad = String(srcIdx).padStart(4, '0');
            const framePath = path.join(tempDir, `dump_${pad}.png`);
            if (!fs.existsSync(framePath)) {
                throw new Error(`Frame ${framePath} not found for 24fps extraction`);
            }
            frameArgs.push(`-d ${getFrameDuration(f, 24)} "${framePath}"`);
        }
    } else {
        throw new Error(`Unsupported target transcode fps: ${targetFps}`);
    }

    execSync(`img2webp -loop 0 -lossy -q 88 ${frameArgs.join(' ')} -o "${targetWebp}"`);

    // Clean temp frames
    for (const f of fs.readdirSync(tempDir)) {
        try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
    }
}

async function renderIconsWithPuppeteer(targetFps = 60, iconEntries = Object.entries(ICONS), outDir = getOutputDirForFps(targetFps)) {
    const totalIcons = iconEntries.length;
    console.log(`[IconGenerator] Launching Puppeteer for ${targetFps}fps procedural rendering (${totalIcons} icons, ${targetFps} frames each)...`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    let queueIndex = 0;
    let completedCount = 0;
    const startTime = Date.now();

    async function worker(workerId) {
        const page = await browser.newPage();
        await page.setViewport({ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, deviceScaleFactor: 1 });
        const tempFramesDir = path.join(ICONS_ROOT, `.temp_frames_${targetFps}fps_${workerId}`);
        fs.mkdirSync(tempFramesDir, { recursive: true });

        while (true) {
            const currentIdx = queueIndex++;
            if (currentIdx >= totalIcons) break;

            const [name, renderFn] = iconEntries[currentIdx];
            const iconStart = Date.now();

            if (name === 'BlankIcon' || name === 'NA') {
                const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWPORT_SIZE}" height="${VIEWPORT_SIZE}"></svg>`;
                await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;">${emptySvg}</body></html>`);
                const webpPath = path.join(outDir, `${name}.webp`);
                const stillPngPath = path.join(STILLS_DIR, `${name}.mv.png`);
                await page.screenshot({ path: webpPath, type: 'webp', omitBackground: true });
                if (!fs.existsSync(stillPngPath)) {
                    await page.screenshot({ path: stillPngPath, type: 'png', omitBackground: true });
                }
                completedCount++;
                continue;
            }

            const framePaths = [];
            const frameArgs = [];

            for (let f = 0; f < targetFps; f++) {
                const t = f / targetFps;
                const svgContent = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${VIEWPORT_SIZE}" height="${VIEWPORT_SIZE}">
                    ${defs()}
                    ${renderFn(t)}
                </svg>`;

                await page.setContent(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
                        svg { width: ${VIEWPORT_SIZE}px; height: ${VIEWPORT_SIZE}px; display: block; }
                    </style>
                </head>
                <body>
                    ${svgContent}
                </body>
                </html>`);

                const framePath = path.join(tempFramesDir, `f_${f}.png`);
                await page.screenshot({ path: framePath, omitBackground: true });
                framePaths.push(framePath);
                frameArgs.push(`-d ${getFrameDuration(f, targetFps)} ${framePath}`);

                if (f === 0) {
                    const stillPngPath = path.join(STILLS_DIR, `${name}.mv.png`);
                    if (!fs.existsSync(stillPngPath)) {
                        fs.copyFileSync(framePath, stillPngPath);
                    }
                }
            }

            const webpPath = path.join(outDir, `${name}.webp`);
            execSync(`img2webp -loop 0 -lossy -q 88 ${frameArgs.join(' ')} -o "${webpPath}"`);

            for (const fp of framePaths) {
                try { fs.unlinkSync(fp); } catch {}
            }

            const stat = fs.statSync(webpPath);
            completedCount++;
            const elapsed = ((Date.now() - iconStart) / 1000).toFixed(1);
            console.log(`[${completedCount}/${totalIcons}] Rendered ${targetFps}fps Icon: ${name.padEnd(12)} (${(stat.size / 1024).toFixed(1)} KB, ${elapsed}s) [W${workerId}]`);
        }

        fs.rmSync(tempFramesDir, { recursive: true, force: true });
        await page.close();
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
    await browser.close();

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[IconGenerator] Rendered ${totalIcons} icons for ${targetFps}fps in ${totalElapsed}s.`);
}

async function generateIconSet(targetFps = 60, options = {}) {
    const outDir = getOutputDirForFps(targetFps);
    fs.mkdirSync(outDir, { recursive: true });
    const iconEntries = Object.entries(ICONS);
    const totalIcons = iconEntries.length;

    // Check if 60fps set is available and we can use fast frame extraction
    const has60fps = fs.existsSync(DIR_60FPS) && fs.readdirSync(DIR_60FPS).filter(f => f.endsWith('.webp')).length >= 80;
    const canFastTranscode = (targetFps === 24 || targetFps === 30) && has60fps && !options.forceRender;

    if (canFastTranscode) {
        console.log(`[IconGenerator] Fast-generating ${targetFps}fps icons from 60fps master assets (${totalIcons} icons, ${CONCURRENCY} parallel workers)...`);
        const startTime = Date.now();
        let queueIndex = 0;
        let completedCount = 0;

        async function transcodeWorker(workerId) {
            const workerTempDir = path.join(ICONS_ROOT, `.transcode_${targetFps}_${workerId}`);
            fs.mkdirSync(workerTempDir, { recursive: true });

            while (true) {
                const currentIdx = queueIndex++;
                if (currentIdx >= totalIcons) break;

                const [name] = iconEntries[currentIdx];
                const srcWebp = path.join(DIR_60FPS, `${name}.webp`);
                const targetWebp = path.join(outDir, `${name}.webp`);

                if (name === 'BlankIcon' || name === 'NA' || (fs.existsSync(srcWebp) && fs.statSync(srcWebp).size < 2048)) {
                    if (fs.existsSync(srcWebp)) {
                        fs.copyFileSync(srcWebp, targetWebp);
                    }
                    completedCount++;
                    continue;
                }

                if (fs.existsSync(srcWebp)) {
                    transcodeFrom60fps(srcWebp, targetWebp, targetFps, workerTempDir);
                    completedCount++;
                    if (completedCount % 10 === 0 || completedCount === totalIcons) {
                        console.log(`[IconGenerator] Processed ${completedCount}/${totalIcons} icons for ${targetFps}fps...`);
                    }
                } else {
                    // Fallback to Puppeteer single render
                    await renderIconsWithPuppeteer(targetFps, [[name, ICONS[name]]], outDir);
                    completedCount++;
                }
            }

            fs.rmSync(workerTempDir, { recursive: true, force: true });
        }

        await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => transcodeWorker(i + 1)));
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[IconGenerator] Successfully generated all ${targetFps}fps icons in ${elapsed}s!`);
    } else {
        await renderIconsWithPuppeteer(targetFps, iconEntries, outDir);
    }
}

async function generateAllIconSets(options = {}) {
    console.log(`\n=== GENERATING 24 / 30 / 60 FPS WEATHER ICONS ===\n`);
    // 1. Ensure 60fps set is available first (or copy existing from large/ if present)
    const existingInLarge = fs.existsSync(LARGE_DIR) && fs.readdirSync(LARGE_DIR).filter(f => f.endsWith('.webp')).length >= 80;
    const existingIn60fps = fs.existsSync(DIR_60FPS) && fs.readdirSync(DIR_60FPS).filter(f => f.endsWith('.webp')).length >= 80;

    if (!existingIn60fps && existingInLarge && !options.forceRender) {
        console.log(`[IconGenerator] Populating 60fps master set from existing large/ icons...`);
        for (const file of fs.readdirSync(LARGE_DIR)) {
            if (file.endsWith('.webp')) {
                fs.copyFileSync(path.join(LARGE_DIR, file), path.join(DIR_60FPS, file));
            }
        }
    } else if (!existingIn60fps || options.forceRender) {
        await generateIconSet(60, options);
    }

    // 2. Generate 30fps set
    await generateIconSet(30, options);

    // 3. Generate 24fps set
    await generateIconSet(24, options);

    console.log(`\n=== ALL 24 / 30 / 60 FPS ICON SETS COMPLETE ===\n`);
}

function syncActiveIcons(targetFps = 60, appDir = path.join(__dirname, '..')) {
    const srcDir = path.join(appDir, 'webroot', 'images', 'icons', '2026', `${targetFps}fps`);
    const dstDir = path.join(appDir, 'webroot', 'images', 'icons', '2026', 'large');

    if (!fs.existsSync(srcDir)) {
        console.warn(`[IconSync] Warning: source directory ${srcDir} does not exist.`);
        return 0;
    }

    fs.mkdirSync(dstDir, { recursive: true });
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.webp'));
    for (const f of files) {
        fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
    }
    console.log(`[IconSync] Synchronized ${files.length} active icons in large/ to ${targetFps}fps.`);
    return files.length;
}

// CLI Execution
async function main() {
    const args = process.argv.slice(2);
    let target = 'all';
    let forceRender = false;

    for (const arg of args) {
        if (arg === '--force-render') {
            forceRender = true;
        } else if (['24', '30', '60', 'all'].includes(arg.toLowerCase())) {
            target = arg.toLowerCase();
        } else if (arg.startsWith('--fps=')) {
            target = arg.split('=')[1].toLowerCase();
        } else if (arg === '--all' || arg === '--all-fps') {
            target = 'all';
        }
    }

    if (target === 'all') {
        await generateAllIconSets({ forceRender });
    } else {
        const fpsNum = parseInt(target, 10);
        if ([24, 30, 60].includes(fpsNum)) {
            await generateIconSet(fpsNum, { forceRender });
        } else {
            console.error(`Unknown target fps '${target}'. Use 24, 30, 60, or all.`);
            process.exit(1);
        }
    }

    // Sync with active encoding preset
    try {
        const { getEncodingPreset } = require('../encoding-presets');
        const activePreset = getEncodingPreset(path.join(__dirname, '..'));
        console.log(`[IconGenerator] Active encoding preset: ${activePreset.resolution.toUpperCase()} @ ${activePreset.fps}fps`);
        syncActiveIcons(activePreset.fps, path.join(__dirname, '..'));
    } catch (e) {
        syncActiveIcons(60, path.join(__dirname, '..'));
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('\n[IconGenerator] Failed to generate icons:', err);
        process.exit(1);
    });
}

module.exports = {
    ICONS,
    getFrameDuration,
    generateIconSet,
    generateAllIconSets,
    syncActiveIcons,
};
