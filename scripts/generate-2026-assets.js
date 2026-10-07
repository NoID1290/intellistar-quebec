const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { getEncodingPreset } = require('../encoding-presets');

const BOXES_DIR = path.join(__dirname, '../webroot/images/boxes/2026');
const IMAGES_DIR = path.join(__dirname, '../webroot/images/2026');

[BOXES_DIR, IMAGES_DIR].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
});

async function generateAssets() {
    const preset = getEncodingPreset(path.join(__dirname, '..'));
    console.log(`[AssetGenerator] Active encoding preset: ${preset.resolution.toUpperCase()} @ ${preset.fps} fps (${preset.width}x${preset.height}, ${preset.bitrate})`);
    console.log('[AssetGenerator] Launching headless browser for HD asset rendering...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Helper to capture HTML snippet to PNG
    async function renderSnippet(html, width, height, outPath) {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { width: ${width}px; height: ${height}px; background: transparent; overflow: hidden; }
                </style>
            </head>
            <body>
                ${html}
            </body>
            </html>
        `, { waitUntil: 'load' });

        await page.screenshot({
            path: outPath,
            type: 'png',
            omitBackground: true
        });
        console.log(`✓ Rendered: ${path.basename(outPath)} (${width}x${height})`);
    }

    // --- 1. BOX PLATES ---
    // Common 2026 Box Template Styles
    const boxBaseStyle = `
        position: absolute;
        inset: 0;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(12, 30, 62, 0.96) 0%, rgba(16, 40, 80, 0.94) 50%, rgba(9, 23, 49, 0.97) 100%);
        border: 2px solid rgba(0, 229, 255, 0.55);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.85), inset 0 1px 2px rgba(255, 255, 255, 0.4), 0 0 25px rgba(0, 210, 255, 0.2);
        overflow: hidden;
    `;
    const boxTopRail = `
        <div style="position: absolute; top: 0; left: 0; right: 0; height: 5px; 
                    background: linear-gradient(90deg, #00e5ff 0%, #0077ff 50%, #00e5ff 100%); 
                    box-shadow: 0 0 14px #00e5ff;"></div>
    `;

    // 1.1 Current Box (1397 x 682)
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            <!-- Sub-divider between left-pane and right-pane -->
            <div style="position: absolute; top: 30px; bottom: 30px; left: 520px; width: 2px;
                        background: linear-gradient(180deg, rgba(0,200,255,0.3) 0%, rgba(255,255,255,0.15) 50%, transparent 100%);"></div>
            <!-- Left subtle glass panel for icon/temp -->
            <div style="position: absolute; top: 25px; bottom: 25px; left: 25px; width: 470px;
                        background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);"></div>
            <!-- Right subtle glass panel for labels/data -->
            <div style="position: absolute; top: 25px; bottom: 25px; left: 545px; right: 25px;
                        background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);"></div>
        </div>
    `, 1397, 682, path.join(BOXES_DIR, 'current_box.png'));

    // 1.2 Local Obs Box (8 Cities: 1397 x 727)
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            <!-- Row dividers for 4 city rows -->
            <div style="position: absolute; top: 180px; left: 30px; right: 30px; height: 1px; background: rgba(0,200,255,0.2);"></div>
            <div style="position: absolute; top: 337px; left: 30px; right: 30px; height: 1px; background: rgba(0,200,255,0.2);"></div>
            <div style="position: absolute; top: 494px; left: 30px; right: 30px; height: 1px; background: rgba(0,200,255,0.2);"></div>
            <div style="position: absolute; top: 651px; left: 30px; right: 30px; height: 1px; background: rgba(0,200,255,0.2);"></div>
        </div>
    `, 1397, 727, path.join(BOXES_DIR, 'local_obs_box.png'));

    // 1.3 Text Forecast Box (1397 x 682)
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            <div style="position: absolute; top: 30px; bottom: 30px; left: 30px; width: 850px;
                        background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);"></div>
        </div>
    `, 1397, 682, path.join(BOXES_DIR, 'text_forecast_box.png'));

    // 1.4 7-Day Box (1397 x 682)
    let dayDividers = '';
    for (let i = 1; i < 7; i++) {
        const x = Math.round(i * (1397 / 7));
        dayDividers += `<div style="position: absolute; top: 120px; bottom: 30px; left: ${x}px; width: 1.5px;
                                   background: linear-gradient(180deg, rgba(0,200,255,0.35) 0%, rgba(255,255,255,0.1) 80%, transparent 100%);"></div>`;
    }
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            ${dayDividers}
        </div>
    `, 1397, 682, path.join(BOXES_DIR, '7_day_box.png'));

    // 1.5 Air Quality Box (1397 x 682)
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            <div style="position: absolute; top: 30px; bottom: 30px; left: 30px; width: 680px;
                        background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);"></div>
            <div style="position: absolute; top: 30px; bottom: 30px; right: 30px; width: 620px;
                        background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);"></div>
        </div>
    `, 1397, 682, path.join(BOXES_DIR, 'aq_1_box.png'));

    // 1.6 Almanac Climo Box (1397 x 689)
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            <!-- Horizontal division between sun/moon and climo records -->
            <div style="position: absolute; top: 310px; left: 30px; right: 30px; height: 1.5px;
                        background: linear-gradient(90deg, transparent 0%, rgba(0,200,255,0.4) 30%, rgba(0,200,255,0.4) 70%, transparent 100%);"></div>
        </div>
    `, 1397, 689, path.join(BOXES_DIR, 'alm_climo_box.png'));

    // 1.7 Daypart Forecast Box (1393 x 689)
    let hourDividers = '';
    for (let i = 1; i < 4; i++) {
        const x = Math.round(i * (1393 / 4));
        hourDividers += `<div style="position: absolute; top: 120px; bottom: 30px; left: ${x}px; width: 1.5px;
                                    background: linear-gradient(180deg, rgba(0,200,255,0.3) 0%, rgba(255,255,255,0.1) 80%, transparent 100%);"></div>`;
    }
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            ${hourDividers}
        </div>
    `, 1393, 689, path.join(BOXES_DIR, 'daypart_box.png'));

    // 1.8 Regional Box (6 Cities: 1397 x 682)
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            <!-- Vertical Divider between left 3 and right 3 cities -->
            <div style="position: absolute; top: 50px; bottom: 30px; left: 698px; width: 1.5px;
                        background: linear-gradient(180deg, rgba(0,200,255,0.35) 0%, rgba(255,255,255,0.1) 80%, transparent 100%);"></div>
            <!-- Horizontal Dividers -->
            <div style="position: absolute; top: 250px; left: 30px; right: 30px; height: 1px; background: rgba(0,200,255,0.15);"></div>
            <div style="position: absolute; top: 450px; left: 30px; right: 30px; height: 1px; background: rgba(0,200,255,0.15);"></div>
        </div>
    `, 1397, 682, path.join(BOXES_DIR, 'regional_box.png'));

    // 1.9 Outdoor Activity Box (1028 x 677)
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            <div style="position: absolute; top: 30px; bottom: 30px; left: 30px; right: 30px;
                        background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);"></div>
        </div>
    `, 1028, 677, path.join(BOXES_DIR, 'outdoor_activity_box.png'));

    // 1.10 NWS Headlines / Severe Weather Bulletin Box (1397 x 727)
    await renderSnippet(`
        <div style="position: absolute; inset: 0; border-radius: 16px;
                    background: linear-gradient(135deg, rgba(48, 12, 16, 0.95) 0%, rgba(24, 6, 8, 0.96) 100%);
                    border: 2px solid rgba(239, 68, 68, 0.7);
                    box-shadow: 0 16px 50px rgba(0,0,0,0.8), 0 0 25px rgba(239, 68, 68, 0.35);
                    overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 6px;
                        background: linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #ef4444 100%);
                        box-shadow: 0 0 15px #ef4444;"></div>
        </div>
    `, 1397, 727, path.join(BOXES_DIR, 'nws_headlines_box.png'));

    // 1.11 Environment Canada Attribution Box (1397 x 682)
    await renderSnippet(`
        <div style="${boxBaseStyle}">
            ${boxTopRail}
            <div style="position: absolute; top: 25px; bottom: 25px; left: 25px; right: 25px;
                        background: rgba(255,255,255,0.02); border-radius: 14px; border: 1px solid rgba(255,255,255,0.07);"></div>
        </div>
    `, 1397, 682, path.join(BOXES_DIR, 'environment_canada_box.png'));

    // 1.12 Radar & Satellite Banners (1512 x 160)
    await renderSnippet(`
        <div style="position: absolute; inset: 0; border-radius: 14px;
                    background: linear-gradient(180deg, rgba(8, 22, 48, 0.95) 0%, rgba(5, 14, 32, 0.95) 100%);
                    border: 1.5px solid rgba(0, 200, 255, 0.45);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.7);
                    overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px;
                        background: linear-gradient(90deg, #00e5ff, #0077ff, #00e5ff); box-shadow: 0 0 10px #00e5ff;"></div>
        </div>
    `, 1512, 160, path.join(BOXES_DIR, 'radar_banner.png'));

    await renderSnippet(`
        <div style="position: absolute; inset: 0; border-radius: 14px;
                    background: linear-gradient(180deg, rgba(8, 22, 48, 0.95) 0%, rgba(5, 14, 32, 0.95) 100%);
                    border: 1.5px solid rgba(0, 200, 255, 0.45);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.7);
                    overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px;
                        background: linear-gradient(90deg, #00e5ff, #0077ff, #00e5ff); box-shadow: 0 0 10px #00e5ff;"></div>
        </div>
    `, 1512, 160, path.join(BOXES_DIR, 'radar_satellite_banner.png'));

    // 1.13 Map Banner (1505 x 105)
    await renderSnippet(`
        <div style="position: absolute; inset: 0; border-radius: 12px;
                    background: linear-gradient(180deg, rgba(8, 22, 48, 0.95) 0%, rgba(5, 14, 32, 0.95) 100%);
                    border: 1.5px solid rgba(0, 200, 255, 0.4);
                    box-shadow: 0 8px 25px rgba(0,0,0,0.6);
                    overflow: hidden;">
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 3.5px;
                        background: linear-gradient(90deg, #00e5ff, #0077ff, #00e5ff); box-shadow: 0 0 8px #00e5ff;"></div>
        </div>
    `, 1505, 105, path.join(BOXES_DIR, 'map_banner.png'));

    // --- 2. BROADCAST BACKGROUNDS (1620 x 1080) ---
    // 2.1 Domestic 2026 Background (Deep Space Sapphire + Isobar curves)
    const isobars = `
        <svg viewBox="0 0 1620 1080" style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;">
            <defs>
                <linearGradient id="curveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.25"/>
                    <stop offset="50%" stop-color="#0077ff" stop-opacity="0.15"/>
                    <stop offset="100%" stop-color="#00e5ff" stop-opacity="0.05"/>
                </linearGradient>
            </defs>
            <path d="M -100,200 C 300,50 800,350 1720,100" fill="none" stroke="url(#curveGrad)" stroke-width="2.5"/>
            <path d="M -100,380 C 400,220 900,550 1720,280" fill="none" stroke="url(#curveGrad)" stroke-width="2"/>
            <path d="M -100,560 C 500,400 1000,750 1720,460" fill="none" stroke="url(#curveGrad)" stroke-width="2"/>
            <path d="M -100,740 C 600,580 1100,950 1720,640" fill="none" stroke="url(#curveGrad)" stroke-width="1.8"/>
            <path d="M -100,920 C 700,760 1200,1150 1720,820" fill="none" stroke="url(#curveGrad)" stroke-width="1.5"/>
        </svg>
    `;

    await renderSnippet(`
        <div style="position: absolute; inset: 0; width: 1620px; height: 1080px;
                    background: radial-gradient(circle at 50% 25%, #0f274e 0%, #08162f 50%, #030a16 100%);
                    overflow: hidden;">
            <!-- Ambient Top Spotlight -->
            <div style="position: absolute; top: -200px; left: 20%; right: 20%; height: 500px;
                        background: radial-gradient(ellipse at 50% 0%, rgba(0, 210, 255, 0.22) 0%, transparent 70%);"></div>
            ${isobars}
            <!-- Tech Grid Dots -->
            <div style="position: absolute; inset: 0; 
                        background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
                        background-size: 36px 36px;"></div>
        </div>
    `, 1620, 1080, path.join(IMAGES_DIR, 'domestic.png'));

    // Also place a copy in webroot/images/domestic-2026.png for direct reference
    fs.copyFileSync(path.join(IMAGES_DIR, 'domestic.png'), path.join(__dirname, '../webroot/images/domestic-2026.png'));

    // 2.2 Domestic Bulletin 2026 Background (Severe Weather Amber/Red)
    await renderSnippet(`
        <div style="position: absolute; inset: 0; width: 1620px; height: 1080px;
                    background: radial-gradient(circle at 50% 25%, #4a0c10 0%, #250508 55%, #100204 100%);
                    overflow: hidden;">
            <div style="position: absolute; top: -200px; left: 20%; right: 20%; height: 500px;
                        background: radial-gradient(ellipse at 50% 0%, rgba(239, 68, 68, 0.3) 0%, transparent 70%);"></div>
            <!-- Alert Warning Isobars -->
            <svg viewBox="0 0 1620 1080" style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;">
                <path d="M -100,200 C 300,50 800,350 1720,100" fill="none" stroke="rgba(239, 68, 68, 0.25)" stroke-width="2.5"/>
                <path d="M -100,450 C 450,250 950,650 1720,350" fill="none" stroke="rgba(245, 158, 11, 0.2)" stroke-width="2"/>
                <path d="M -100,700 C 600,500 1100,900 1720,600" fill="none" stroke="rgba(239, 68, 68, 0.2)" stroke-width="2"/>
            </svg>
            <div style="position: absolute; inset: 0; 
                        background-image: radial-gradient(rgba(239, 68, 68, 0.08) 1.2px, transparent 1.2px);
                        background-size: 36px 36px;"></div>
        </div>
    `, 1620, 1080, path.join(IMAGES_DIR, 'domesticBulletin.png'));

    fs.copyFileSync(path.join(IMAGES_DIR, 'domesticBulletin.png'), path.join(__dirname, '../webroot/images/domesticBulletin-2026.png'));

    // --- 3. LOWER DISPLAY LINE (LDL) 2026 (1620 x 135) ---
    await renderSnippet(`
        <div style="position: absolute; inset: 0; width: 1620px; height: 135px;
                    background: linear-gradient(180deg, rgba(10, 26, 58, 0.98) 0%, rgba(6, 15, 33, 0.99) 100%);
                    border-top: 2.5px solid #00d2ff;
                    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.85), inset 0 1px 2px rgba(255, 255, 255, 0.25), 0 0 15px rgba(0, 210, 255, 0.25);
                    overflow: hidden;">
            <!-- Subtle glass sheen across the top third -->
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 45px;
                        background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, transparent 100%); pointer-events: none;"></div>
        </div>
    `, 1620, 135, path.join(IMAGES_DIR, 'blueldl.png'));

    // Also copy blueldl.png directly to webroot/images/2026/
    fs.copyFileSync(path.join(IMAGES_DIR, 'blueldl.png'), path.join(__dirname, '../webroot/images/2026/blueldl.png'));

    // --- 4. ACCENTS & BADGES ---
    // 4.1 Radar Legend (240 x 30)
    await renderSnippet(`
        <div style="width: 240px; height: 30px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.4);
                    background: linear-gradient(90deg, 
                        #04e9e7 0%, #019ff4 15%, #0300f4 30%, 
                        #02fd02 45%, #01c501 60%, #008e00 70%, 
                        #fdf802 80%, #e5bc00 87%, #fd0000 93%, #d40000 97%, #fd00fd 100%);
                    box-shadow: 0 2px 6px rgba(0,0,0,0.5);"></div>
    `, 240, 30, path.join(IMAGES_DIR, 'radarLegend.png'));

    // 4.2 Weekend Rectangle (190 x 50)
    await renderSnippet(`
        <div style="width: 190px; height: 50px; border-radius: 8px;
                    background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);
                    border: 1.5px solid #fde68a;
                    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.45);
                    display: flex; align-items: center; justify-content: center;">
            <span style="font-family: 'Interstate', 'Helvetica Neue', Arial, sans-serif; font-weight: 900;
                         font-size: 24px; color: #ffffff; letter-spacing: 1.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.4);">WEEK-END</span>
        </div>
    `, 190, 50, path.join(IMAGES_DIR, 'weekend_rectangle.png'));

    // 4.3 Air Quality Arrow (77 x 101)
    await renderSnippet(`
        <svg viewBox="0 0 77 101" width="77" height="101">
            <defs>
                <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ffffff"/>
                    <stop offset="50%" stop-color="#00e5ff"/>
                    <stop offset="100%" stop-color="#0077ff"/>
                </linearGradient>
                <filter id="arrowGlow">
                    <feGaussianBlur stdDeviation="3" result="blur"/>
                    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                </filter>
            </defs>
            <polygon points="10,50 65,10 65,36 75,36 75,64 65,64 65,90" 
                     fill="url(#arrowGrad)" stroke="#ffffff" stroke-width="2.5" filter="url(#arrowGlow)"/>
        </svg>
    `, 77, 101, path.join(IMAGES_DIR, 'aqarrow.png'));

    // 4.4 HD TWC Domestic Broadcast Badge (213 x 144)
    await renderSnippet(`
        <div style="width: 213px; height: 144px; display: flex; align-items: center; justify-content: center;">
            <div style="width: 170px; height: 120px; border-radius: 14px;
                        background: linear-gradient(135deg, #0077ff 0%, #0044cc 100%);
                        border: 2px solid #ffffff;
                        box-shadow: 0 8px 25px rgba(0, 68, 204, 0.6), inset 0 2px 3px rgba(255,255,255,0.4);
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        padding: 10px;">
                <div style="font-family: 'Interstate', 'Helvetica Neue', Arial, sans-serif; font-weight: 900; 
                            font-size: 26px; color: #ffffff; line-height: 28px; text-align: center; text-transform: uppercase;
                            letter-spacing: 1px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
                    The<br>Weather<br>Channel
                </div>
            </div>
        </div>
    `, 213, 144, path.join(IMAGES_DIR, 'twcDomesticLogo.png'));

    await browser.close();
    console.log('[AssetGenerator] All HD box plates, backgrounds, and UI assets successfully generated!');
}

if (require.main === module) {
    generateAssets().catch(err => {
        console.error('[AssetGenerator] Generation error:', err);
        process.exit(1);
    });
}

module.exports = {
    generateAssets,
};
