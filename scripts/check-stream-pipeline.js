// Isolated synthetic browser -> capture (tab or Xvfb) -> FFmpeg -> HLS check.
// Does not launch the forecast, alter its configuration, or overwrite its stream cache.
// STREAM_CAPTURE_MODE=xvfb|puppeteer-stream selects the path; STREAM_CHECK_KEEP_DIR keeps the
// lossless reference PNG and encoded segments for native-pixel comparison of gradients and text.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const puppeteer = require('puppeteer');
const { launch, getStream, wss } = require('puppeteer-stream');
const config = require('../stream-config');
const { resolveVideoEncoder, probeHardwareDecode, buildBrowserLaunchOptions, hasXvfb, startXvfbServer, waitForXvfbDisplay } = require('../start-iptv');
const { videoFilter, vaapiEncoderArgs, rateControl, keyframeFrames, captureBitrate } = require('../stream-encoding');
const { installRafThrottle, ensureStreamBrowserCompatibility } = require('../stream-browser');

const DURATION = 12;
const W = config.captureWidth;
const H = config.captureHeight;

function testPage() {
  return `<style>body{margin:0;background:#0b1d33;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
    <canvas id="canvas" width="${W}" height="${H}"></canvas><script>
    const ctx=canvas.getContext('2d');const W=${W},H=${H};
    function draw(t){
      const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#19395b');g.addColorStop(1,'#0869a0');
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      // Static banding probes: a smooth dark ramp (worst case for 8-bit 4:2:0) and a grey ramp.
      const dark=ctx.createLinearGradient(0,0,W,0);dark.addColorStop(0,'#04101f');dark.addColorStop(1,'#123a66');
      ctx.fillStyle=dark;ctx.fillRect(0,H*0.55,W,H*0.18);
      const grey=ctx.createLinearGradient(0,0,W,0);grey.addColorStop(0,'#000');grey.addColorStop(1,'#fff');
      ctx.fillStyle=grey;ctx.fillRect(0,H*0.75,W,H*0.08);
      const panel=ctx.createLinearGradient(0,H*0.2,0,H*0.5);panel.addColorStop(0,'rgba(16,52,92,0.95)');panel.addColorStop(1,'rgba(6,24,48,0.95)');
      ctx.fillStyle=panel;ctx.fillRect(W*0.06,H*0.2,W*0.5,H*0.3);
      ctx.fillStyle='white';ctx.font=Math.round(H/16)+'px sans-serif';
      ctx.fillText('Steam Deck: text, gradients, motion and audio',W*0.04,H*0.14);
      ctx.font=Math.round(H/45)+'px sans-serif';ctx.fillStyle='#cfe3f5';
      ctx.fillText('Qualité de l\\'air · Particules fines (PM2.5) · MODÉRÉ · 7:20 PM · 21° · Humidité 54 %',W*0.08,H*0.27);
      ctx.fillText('Mises à jour | Prévisions 07:13:15 PM | Alertes -- | Radar 07:14:10 PM',W*0.08,H*0.31);
      ctx.fillStyle='#39bbad';ctx.fillRect((t/10)%(W-W*0.11),H*0.86,W*0.1,H*0.1);
      requestAnimationFrame(draw);
    }requestAnimationFrame(draw);
    const audio=new AudioContext();const oscillator=audio.createOscillator();const gain=audio.createGain();
    gain.gain.value=0.005;oscillator.connect(gain).connect(audio.destination);oscillator.start();
    </script>`;
}

function probeSegment(filename) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,color_range,color_space,color_primaries',
    '-of', 'json', filename], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(`ffprobe failed on ${filename}: ${probe.stderr}`);
  return JSON.parse(probe.stdout).streams[0];
}

function keyframeStats(filename) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=flags',
    '-of', 'csv=p=0', filename], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(`ffprobe failed on ${filename}: ${probe.stderr}`);
  const flags = probe.stdout.split(/\r?\n/).filter(Boolean);
  return { packets: flags.length, keyframes: flags.filter(f => f.includes('K')).length, firstIsKey: Boolean(flags[0]?.includes('K')) };
}

async function main() {
  const encoder = resolveVideoEncoder('h264_vaapi');
  if (encoder !== 'h264_vaapi') throw new Error('This diagnostic requires working h264_vaapi.');
  let mode = config.captureMode === 'auto' ? (process.platform === 'linux' && hasXvfb() ? 'xvfb' : 'puppeteer-stream') : config.captureMode;
  const isXvfb = mode === 'xvfb' || mode === 'x11grab';
  if (isXvfb && (process.platform !== 'linux' || !hasXvfb())) throw new Error('Xvfb capture requested but Xvfb is not available on this Linux host.');
  if (!isXvfb) mode = 'puppeteer-stream';
  // Use a display separate from the live pipeline's default so the check never collides with a running stream.
  const display = process.env.XVFB_DISPLAY || ':98';
  const keepDir = process.env.STREAM_CHECK_KEEP_DIR ? path.resolve(process.env.STREAM_CHECK_KEEP_DIR) : null;
  const directory = keepDir || fs.mkdtempSync(path.join(os.tmpdir(), 'intellistar-check-'));
  if (keepDir) fs.mkdirSync(keepDir, { recursive: true });

  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(testPage()); });
  let browser, stream, ffmpeg, xvfb;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    if (isXvfb) {
      xvfb = startXvfbServer(display, W, H);
      await waitForXvfbDisplay(xvfb, display);
    }
    const launchOptions = buildBrowserLaunchOptions(W, H, mode, isXvfb ? display : null);
    browser = isXvfb ? await puppeteer.launch(launchOptions) : ensureStreamBrowserCompatibility(await launch(puppeteer, launchOptions));
    const page = await browser.newPage();
    if (config.rafThrottle) await page.evaluateOnNewDocument(installRafThrottle, config.fps);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const cdp = await browser.target().createCDPSession();
    const { gpu } = await cdp.send('SystemInfo.getInfo');
    console.log('Browser GPU:', gpu.featureStatus);
    const glRenderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
    }).catch(() => null);
    console.log(`Chromium GL renderer: ${glRenderer || 'unknown'}${/llvmpipe|swiftshader|softpipe/i.test(glRenderer || '') ? ' (SOFTWARE rendering)' : ''}`);
    await page.screenshot({ path: path.join(directory, 'reference.png'), type: 'png' });

    const codec = config.captureVideoCodec === 'vp8' ? 'vp8' : 'h264';
    const hardwareDecode = !isXvfb && codec === 'h264' && config.hardwareDecode && probeHardwareDecode(encoder);
    const rates = rateControl(config);
    const gop = keyframeFrames(config);
    const intermediate = isXvfb ? 'raw x11grab (no intermediate encode)' : `${codec} tab capture @ ${(captureBitrate(config) / 1e6).toFixed(0)} Mbps`;
    console.log(`Checking ${config.preset} (${config.outputMode} policy): ${intermediate}, ${isXvfb ? 'no' : (hardwareDecode ? 'VAAPI' : 'CPU')} decode, ` +
      `VAAPI encode ${rates.target / 1e6}/${rates.maxrate / 1e6} Mbps ${rates.mode}, bufsize ${rates.bufsize / 1e6} Mb, GOP ${gop} frames`);

    const args = ['-hide_banner', '-loglevel', 'info', '-benchmark', '-vaapi_device', config.vaapiDevice,
      '-thread_queue_size', String(config.maxCaptureQueue), '-threads', String(config.ffmpegThreads)];
    if (isXvfb) {
      // Audio path is identical to production's browser pipe and not under test here; use silence.
      args.push('-f', 'x11grab', '-draw_mouse', '0', '-framerate', String(config.fps), '-video_size', `${W}x${H}`, '-i', `${display}.0+0,0`,
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-map', '0:v:0', '-map', '1:a:0');
    } else {
      if (hardwareDecode) args.push('-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi');
      args.push('-f', 'matroska,webm', '-i', 'pipe:0');
    }
    args.push('-t', String(DURATION),
      '-filter_threads', String(config.ffmpegThreads), '-vf', videoFilter(config, encoder, hardwareDecode),
      '-c:v', encoder, ...vaapiEncoderArgs(config, encoder),
      '-b:v', String(rates.target), '-maxrate', String(rates.maxrate), '-bufsize', String(rates.bufsize),
      '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', config.audioBitrate, '-ar', '48000',
      '-af', 'aresample=async=1:first_pts=0', '-f', 'hls', '-hls_time', '4', '-hls_list_size', '8',
      '-hls_flags', 'independent_segments+temp_file', path.join(directory, 'index.m3u8'));
    const started = Date.now();
    ffmpeg = spawn('ffmpeg', args, { stdio: [isXvfb ? 'ignore' : 'pipe', 'ignore', 'pipe'] });
    let output = '';
    ffmpeg.stderr.on('data', data => { output += data; });
    if (ffmpeg.stdin) ffmpeg.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ffmpeg.kill('SIGKILL'); reject(new Error('Capture check timed out')); }, 60000);
      ffmpeg.once('error', error => { clearTimeout(timer); reject(error); });
      ffmpeg.once('close', code => {
        clearTimeout(timer);
        console.log(output.split(/[\r\n]/).filter(line => /Stream #|bench:|Lsize=|Error|failed/.test(line)).join('\n'));
        if (code === 0) resolve(); else reject(new Error(`FFmpeg exited ${code}`));
      });
    });
    // Attach rejection handling before asynchronous capture initialization.
    done.catch(() => {});
    if (!isXvfb) {
      stream = await getStream(page, {
        audio: true, video: true, mimeType: `video/webm;codecs=${codec},opus`, frameSize: 250,
        videoBitsPerSecond: captureBitrate(config),
        audioBitsPerSecond: 192000,
        videoConstraints: { mandatory: { minWidth: W, maxWidth: W, minHeight: H, maxHeight: H, maxFrameRate: config.fps } },
      });
      stream.on('error', error => console.error(error.message));
      stream.pipe(ffmpeg.stdin);
    }
    await done;
    const wall = (Date.now() - started) / 1000;
    const speed = output.match(/speed=\s*([\d.]+)x/g)?.pop();
    console.log(`Wall time ${wall.toFixed(1)}s for ${DURATION}s of video; final FFmpeg ${speed || 'speed=n/a'}`);

    const playlist = fs.readFileSync(path.join(directory, 'index.m3u8'), 'utf8');
    if (!playlist.includes('#EXT-X-INDEPENDENT-SEGMENTS')) throw new Error('Missing independent segment flag');
    const segments = playlist.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
    if (segments.length !== 3) throw new Error(`Expected 3 four-second segments, got ${segments.length}`);
    let totalPackets = 0;
    for (const segment of segments) {
      const filename = path.join(directory, segment);
      const keys = keyframeStats(filename);
      if (!keys.firstIsKey) throw new Error(`${segment} does not start with a keyframe`);
      totalPackets += keys.packets;
      const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', filename, '-f', 'null', '-'], { encoding: 'utf8' });
      if (decode.status !== 0 || decode.stderr.trim()) throw new Error(`Segment decode failed: ${decode.stderr}`);
      console.log(`${segment}: ${keys.packets} frames, ${keys.keyframes} keyframe(s), ${(fs.statSync(filename).size / 1e6).toFixed(2)} MB`);
    }
    const info = probeSegment(path.join(directory, segments[0]));
    console.log(`Output: ${info.codec_name} ${info.profile} ${info.width}x${info.height} ${info.r_frame_rate} ${info.pix_fmt}` +
      ` range=${info.color_range || 'unspecified'} matrix=${info.color_space || 'unspecified'} primaries=${info.color_primaries || 'unspecified'}`);
    if (info.width !== config.outputWidth || info.height !== config.outputHeight) throw new Error(`Unexpected output size ${info.width}x${info.height}`);
    const expectedFrames = DURATION * config.fps;
    const continuity = (totalPackets / expectedFrames) * 100;
    console.log(`Frame continuity: ${totalPackets}/${expectedFrames} (${continuity.toFixed(1)}%)${continuity < 95 ? ' — capture is not keeping up' : ''}`);
    console.log(`PASS: ${DURATION} seconds of HLS, 3 independent keyframed segments, audio/video decoded successfully.`);
    console.log('CPU timings above measure FFmpeg only, not Chromium, Xvfb or total system consumption.');
    if (keepDir) console.log(`Kept reference.png and segments in ${keepDir}; extract a frame with: ffmpeg -i ${path.join(keepDir, segments[0])} -vframes 1 frame.png`);
  } finally {
    if (stream) stream.destroy();
    if (ffmpeg && ffmpeg.exitCode === null) ffmpeg.kill('SIGINT');
    if (browser) await browser.close();
    if (xvfb) { try { xvfb.kill('SIGTERM'); } catch (e) {} }
    server.close();
    if (!keepDir) fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { (await wss).close(); });