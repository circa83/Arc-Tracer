// app.js
(() => {
  // Elements
  const viewer = document.getElementById('viewer');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  const ytWrap = document.getElementById('ytWrap');
  const ytDimOverlay = document.getElementById('ytDimOverlay');
  const video = document.getElementById('video');

  const ytUrl = document.getElementById('ytUrl');
  const loadYtBtn = document.getElementById('loadYtBtn');
  const unloadBtn = document.getElementById('unloadBtn');
  const fileInput = document.getElementById('fileInput');

  const backBtn = document.getElementById('backBtn');
  const playBtn = document.getElementById('playBtn');
  const nextBtn = document.getElementById('nextBtn');
  const stepPlayBtn = document.getElementById('stepPlayBtn');
  const interactBtn = document.getElementById('interactBtn');
  const snapBtn = document.getElementById('snapBtn');
  const helpBtn = document.getElementById('helpBtn');

  const videoSpeed = document.getElementById('videoSpeed');
  const videoSpeedVal = document.getElementById('videoSpeedVal');

  const stepSec = document.getElementById('stepSec');
  const stepSecVal = document.getElementById('stepSecVal');

  const stepFps = document.getElementById('stepFps');
  const stepFpsVal = document.getElementById('stepFpsVal');

  const videoOpacity = document.getElementById('videoOpacity');
  const videoOpacityVal = document.getElementById('videoOpacityVal');
  const ytDim = document.getElementById('ytDim');
  const ytDimVal = document.getElementById('ytDimVal');

  const toolPen = document.getElementById('toolPen');
  const toolPoint = document.getElementById('toolPoint');
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const toggleDrawBtn = document.getElementById('toggleDrawBtn');

  const penSize = document.getElementById('penSize');
  const penSizeVal = document.getElementById('penSizeVal');
  const pointSize = document.getElementById('pointSize');
  const pointSizeVal = document.getElementById('pointSizeVal');

  const onionPrev = document.getElementById('onionPrev');
  const onionPrevVal = document.getElementById('onionPrevVal');
  const onionNext = document.getElementById('onionNext');
  const onionNextVal = document.getElementById('onionNextVal');
  const prevColor = document.getElementById('prevColor');
  const prevColorVal = document.getElementById('prevColorVal');
  const nextColor = document.getElementById('nextColor');
  const nextColorVal = document.getElementById('nextColorVal');
  const falloff = document.getElementById('falloff');
  const falloffVal = document.getElementById('falloffVal');
  const ghostMax = document.getElementById('ghostMax');
  const ghostMaxVal = document.getElementById('ghostMaxVal');

  const setInBtn = document.getElementById('setInBtn');
  const setOutBtn = document.getElementById('setOutBtn');
  const loopBtn = document.getElementById('loopBtn');
  const loopInEl = document.getElementById('loopIn');
  const loopOutEl = document.getElementById('loopOut');
  const jumpInBtn = document.getElementById('jumpInBtn');
  const jumpOutBtn = document.getElementById('jumpOutBtn');
  const loopStatus = document.getElementById('loopStatus');

  const loopBar = document.getElementById('loopBar');
  const loopRange = document.getElementById('loopRange');
  const loopInHandle = document.getElementById('loopInHandle');
  const loopOutHandle = document.getElementById('loopOutHandle');
  const loopPlayhead = document.getElementById('loopPlayhead');

  const timeReadout = document.getElementById('timeReadout');
  const statusReadout = document.getElementById('statusReadout');
  const modeBadge = document.getElementById('modeBadge');

  // Mode + YouTube
  const Mode = { NONE:'none', YT:'youtube', LOCAL:'local' };
  let mode = Mode.NONE;
  let ytPlayer = null;
  let ytReady = false;

  // Interact mode (canvas click-through)
  let interactEnabled = false;

  // Loop
  let loopEnabled = false;
  let loopIn = 0;
  let loopOut = 0;

  // Playback modes
  // Native = actual video play (continuous).
  // Step-play = discrete seek jumps at Step FPS.
  let stepPlayEnabled = false;
  let stepTimer = null;
  let lastStepMs = 0;

  // Drawing state
  let drawEnabled = true;
  let tool = 'pen';
  let isDrawing = false;
  let currentStroke = null;

  // stepKey -> {points, strokes}
  const slots = new Map();

  // Utils
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const roundTo = (n, step) => Math.round(n / step) * step;

  function getStepSec(){ return Number(stepSec.value); }
  function getStepFps(){ return Number(stepFps.value); }
  function getVideoSpeed(){ return Number(videoSpeed.value); }
  function getPointRadius(){ return Number(pointSize.value); }

  function isPlayable(){
    if (mode === Mode.YT) return ytReady && ytPlayer;
    if (mode === Mode.LOCAL) return isFinite(video.duration);
    return false;
  }
  function getCurrentTime(){
    if (mode === Mode.YT && ytReady && ytPlayer) return ytPlayer.getCurrentTime() || 0;
    if (mode === Mode.LOCAL) return video.currentTime || 0;
    return 0;
  }
  function getDuration(){
    if (mode === Mode.YT && ytReady && ytPlayer) return ytPlayer.getDuration() || 0;
    if (mode === Mode.LOCAL) return video.duration || 0;
    return 0;
  }
  function seekTo(t){
    const dur = getDuration();
    const nt = Math.max(0, Math.min(dur || t, t));
    if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.seekTo(nt, true);
    if (mode === Mode.LOCAL) video.currentTime = nt;
  }

  function isNativePlaying(){
    if (!isPlayable()) return false;
    if (mode === Mode.LOCAL) return !video.paused;
    if (mode === Mode.YT && ytReady && ytPlayer) return ytPlayer.getPlayerState() === 1;
    return false;
  }

  function pauseNative(){
    if (!isPlayable()) return;
    if (mode === Mode.LOCAL) video.pause();
    if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.pauseVideo();
  }
  function playNative(){
    if (!isPlayable()) return;
    // If native play starts, step-play must stop.
    stopStepPlay();
    if (mode === Mode.LOCAL) video.play();
    if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.playVideo();
  }

  // Loop helpers
  function parseLoopInputs(){
    loopIn = Math.max(0, Number(loopInEl.value) || 0);
    loopOut = Math.max(0, Number(loopOutEl.value) || 0);
  }
  function syncLoopInputs(){
    loopInEl.value = loopIn.toFixed(2);
    loopOutEl.value = loopOut.toFixed(2);
  }
  function loopValid(){ return loopOut > loopIn + 0.001; }
  function loopOutSafe(){
    if (!loopValid()) return loopOut;
    const eps = Math.min(0.02, Math.max(0.002, getStepSec() * 0.05));
    return Math.max(loopIn, loopOut - eps);
  }
  function clampToLoop(t){
    if (!loopEnabled || !loopValid()) return t;
    if (t < loopIn) return loopIn;
    if (t >= loopOut) return loopOutSafe();
    return t;
  }
  function enforceLoop(){
    if (!loopEnabled || !loopValid() || !isPlayable()) return;
    const t = getCurrentTime();
    if (t >= loopOut - 0.0005){
      seekTo(loopIn);
    }
  }

  // UI Loop slider mapping
  function timeToPct(t){
    const d = getDuration() || 0;
    if (d <= 0) return 0;
    return Math.max(0, Math.min(1, t / d));
  }
  function pctToTime(p){
    const d = getDuration() || 0;
    return Math.max(0, Math.min(d, p * d));
  }
  function updateLoopSliderUI(){
    const d = getDuration() || 0;
    if (d <= 0) return;

    loopIn = Math.max(0, Math.min(d, loopIn));
    loopOut = Math.max(0, Math.min(d, loopOut));

    const inP = timeToPct(loopIn);
    const outP = timeToPct(loopOut);
    const tP = timeToPct(getCurrentTime());

    const w = loopBar.getBoundingClientRect().width || 1;
    const inX = inP * w;
    const outX = outP * w;
    const tX = tP * w;

    loopInHandle.style.left = `${inX}px`;
    loopOutHandle.style.left = `${outX}px`;

    const left = Math.min(inX, outX);
    const right = Math.max(inX, outX);
    loopRange.style.left = `${left}px`;
    loopRange.style.width = `${Math.max(0, right - left)}px`;

    loopPlayhead.style.left = `${tX}px`;
  }
  function pointerPctFromEvent(e){
    const r = loopBar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)));
  }
  function beginDrag(which, startEvent){
    startEvent.preventDefault();
    startEvent.stopPropagation();

    const move = (e) => {
      const p = pointerPctFromEvent(e);
      const t = pctToTime(p);
      if (which === 'in') loopIn = t;
      if (which === 'out') loopOut = t;
      loopInEl.value = loopIn.toFixed(2);
      loopOutEl.value = loopOut.toFixed(2);
      updateLoopSliderUI();
      updateLoopStatus();
      if (loopEnabled && loopValid()){
        seekTo(clampToLoop(getCurrentTime()));
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  loopInHandle.addEventListener('pointerdown', (e) => beginDrag('in', e));
  loopOutHandle.addEventListener('pointerdown', (e) => beginDrag('out', e));
  loopBar.addEventListener('pointerdown', (e) => {
    const t = pctToTime(pointerPctFromEvent(e));
    seekTo(loopEnabled && loopValid() ? clampToLoop(t) : t);
    updateLoopSliderUI();
  });

  function updateLoopStatus(){
    if (!loopEnabled) { loopStatus.textContent = 'Loop inactive.'; return; }
    if (!loopValid()) { loopStatus.textContent = 'Loop ON but invalid (Out must be > In).'; return; }
    loopStatus.textContent = `Looping: ${loopIn.toFixed(2)}s → ${loopOut.toFixed(2)}s`;
  }

  // Unified step grid for drawings
  function stepTimeFromT(t){
    const s = getStepSec();
    const st = roundTo(Math.max(0, t), s);
    return Number(st.toFixed(3));
  }
  function slotKey(st){ return st.toFixed(3); }
  function ensureSlot(st){
    const k = slotKey(st);
    if (!slots.has(k)) slots.set(k, { points: [], strokes: [] });
    return slots.get(k);
  }
  function currentSlot(){ return stepTimeFromT(getCurrentTime()); }

  // Step / Seek controls (manual)
  function stepAdvance(delta){
    if (!isPlayable()) return;

    // Manual step should stop BOTH play modes, then seek.
    stopStepPlay();
    pauseNative();

    const t = getCurrentTime();
    let nt = t + delta;
    const eps = 0.002;

    if (loopEnabled && loopValid()){
      if (delta < 0 && t <= loopIn + eps) nt = loopOutSafe();
      else if (delta > 0 && t >= loopOut - eps) nt = loopIn;
      else {
        if (nt < loopIn) nt = loopOutSafe();
        if (nt >= loopOut) nt = loopIn;
      }
      nt = clampToLoop(nt);
    } else {
      nt = Math.max(0, Math.min(getDuration() || nt, nt));
    }

    seekTo(nt);
    render();
    updateLoopSliderUI();
    updateStatus();
  }

  // Step play (discrete stepping at Step FPS)
  function startStepPlay(){
    if (!isPlayable()) return;
    // Step play owns the timeline: native playback must be paused.
    pauseNative();

    stepPlayEnabled = true;
    stepPlayBtn.textContent = 'Step Play: On';
    lastStepMs = performance.now();

    if (stepTimer) cancelAnimationFrame(stepTimer);

    const tick = (now) => {
      if (!stepPlayEnabled) return;

      const intervalMs = 1000 / Math.max(1, getStepFps()); // frame-rate style
      if (now - lastStepMs >= intervalMs){
        lastStepMs = now;
        // advance exactly one step per tick
        const s = getStepSec();
        const t = getCurrentTime();
        let nt = t + s;

        if (loopEnabled && loopValid()){
          if (t >= loopOut - 0.0005) nt = loopIn;
          if (nt >= loopOut) nt = loopIn;
          nt = clampToLoop(nt);
        } else {
          nt = Math.max(0, Math.min(getDuration() || nt, nt));
        }

        seekTo(nt);
        render();
        updateLoopSliderUI();
      }

      stepTimer = requestAnimationFrame(tick);
    };

    stepTimer = requestAnimationFrame(tick);
    updateStatus();
  }

  function stopStepPlay(){
    stepPlayEnabled = false;
    stepPlayBtn.textContent = 'Step Play: Off';
    if (stepTimer){
      cancelAnimationFrame(stepTimer);
      stepTimer = null;
    }
    updateStatus();
  }

  function toggleStepPlay(){
    if (!isPlayable()) return;
    if (stepPlayEnabled) stopStepPlay();
    else startStepPlay();
  }

  // Interact mode
  function setInteractEnabled(on){
    interactEnabled = on;
    canvas.style.pointerEvents = interactEnabled ? 'none' : 'auto';
    interactBtn.textContent = `Interact: ${interactEnabled ? 'On' : 'Off'}`;
    toggleDrawBtn.textContent = `Draw: ${(!interactEnabled && drawEnabled) ? 'On' : 'Off'}`;
  }

  function updateStatus(){
    const v = isNativePlaying() ? 'Playing' : 'Paused';
    const sp = stepPlayEnabled ? 'On' : 'Off';
    statusReadout.textContent = `Video: ${v} · Step Play: ${sp}`;
    playBtn.textContent = isNativePlaying() ? 'Pause' : 'Play';
  }

  // Bind UI
  function bindRange(rangeEl, labelEl, fmt=(v)=>v){
    const upd = () => labelEl.textContent = fmt(rangeEl.value);
    rangeEl.addEventListener('input', () => {
      upd();
      // If step FPS changes while stepping, it just affects next tick rate automatically.
      render();
      updateLoopSliderUI();
      updateStatus();
    });
    upd();
  }

  bindRange(videoSpeed, videoSpeedVal, v => Number(v).toFixed(2));
  bindRange(stepSec, stepSecVal, v => Number(v).toFixed(2));
  bindRange(stepFps, stepFpsVal, v => String(v));
  bindRange(videoOpacity, videoOpacityVal, v => Number(v).toFixed(2));
  bindRange(ytDim, ytDimVal, v => Number(v).toFixed(2));
  bindRange(penSize, penSizeVal, v => String(v));
  bindRange(pointSize, pointSizeVal, v => String(v));
  bindRange(onionPrev, onionPrevVal, v => String(v));
  bindRange(onionNext, onionNextVal, v => String(v));
  bindRange(falloff, falloffVal, v => Number(v).toFixed(2));
  bindRange(ghostMax, ghostMaxVal, v => Number(v).toFixed(2));

  videoOpacity.addEventListener('input', () => video.style.opacity = String(videoOpacity.value));
  ytDim.addEventListener('input', () => ytDimOverlay.style.opacity = String(ytDim.value));
  video.style.opacity = String(videoOpacity.value);
  ytDimOverlay.style.opacity = String(ytDim.value);

  // Tools
  function setTool(nextTool){
    tool = nextTool;
    toolPen.dataset.active = (tool === 'pen');
    toolPoint.dataset.active = (tool === 'point');
  }
  toolPen.addEventListener('click', () => setTool('pen'));
  toolPoint.addEventListener('click', () => setTool('point'));

  function setDrawEnabled(on){
    drawEnabled = on;
    if (!interactEnabled) toggleDrawBtn.textContent = `Draw: ${drawEnabled ? 'On' : 'Off'}`;
  }
  toggleDrawBtn.addEventListener('click', () => {
    if (interactEnabled) return;
    setDrawEnabled(!drawEnabled);
  });

  // Playback buttons
  backBtn.addEventListener('click', () => stepAdvance(-getStepSec()));
  nextBtn.addEventListener('click', () => stepAdvance(getStepSec()));

  playBtn.addEventListener('click', () => {
    if (!isPlayable()) return;
    if (isNativePlaying()){
      pauseNative();
    } else {
      // Native play takes control: stop step-play first, then play.
      stopStepPlay();
      // Apply speed to native playback only.
      if (mode === Mode.LOCAL) video.playbackRate = getVideoSpeed();
      if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.setPlaybackRate(getVideoSpeed());
      playNative();
    }
    updateStatus();
  });

  stepPlayBtn.addEventListener('click', toggleStepPlay);
  interactBtn.addEventListener('click', () => setInteractEnabled(!interactEnabled));

  // When videoSpeed changes, apply it to native playback immediately (if playing)
  videoSpeed.addEventListener('input', () => {
    if (!isPlayable()) return;
    if (mode === Mode.LOCAL) video.playbackRate = getVideoSpeed();
    if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.setPlaybackRate(getVideoSpeed());
  });

  // Snap to step
  snapBtn.addEventListener('click', () => {
    if (!isPlayable()) return;
    stopStepPlay();
    pauseNative();
    const st = stepTimeFromT(getCurrentTime());
    seekTo(loopEnabled && loopValid() ? clampToLoop(st) : st);
    render();
    updateLoopSliderUI();
    updateStatus();
  });

  helpBtn.addEventListener('click', () => {
    alert(
      "Two playback modes:\n\n" +
      "Play/Pause:\n" +
      "• Native continuous video playback.\n" +
      "• Controlled by Video Speed.\n\n" +
      "Step Play:\n" +
      "• Discrete 'seek-jump' playback.\n" +
      "• Step Size = how far each jump goes.\n" +
      "• Step FPS = how many jumps per second (like frame rate).\n\n" +
      "They are mutually exclusive: starting one stops the other."
    );
  });

  // Loop controls
  function setLoopEnabled(on){
    loopEnabled = on;
    parseLoopInputs();

    const d = getDuration() || 0;
    if (d > 0){
      loopIn = Math.max(0, Math.min(d, loopIn));
      loopOut = Math.max(0, Math.min(d, loopOut));
      syncLoopInputs();
    }
    updateLoopStatus();
    updateLoopSliderUI();

    if (loopEnabled && loopValid() && isPlayable()){
      seekTo(clampToLoop(getCurrentTime()));
    }
  }
  setInBtn.addEventListener('click', () => {
    if (!isPlayable()) return;
    loopIn = getCurrentTime();
    syncLoopInputs();
    updateLoopStatus();
    updateLoopSliderUI();
  });
  setOutBtn.addEventListener('click', () => {
    if (!isPlayable()) return;
    loopOut = getCurrentTime();
    syncLoopInputs();
    updateLoopStatus();
    updateLoopSliderUI();
  });
  loopBtn.addEventListener('click', () => {
    setLoopEnabled(!loopEnabled);
    loopBtn.textContent = `Loop: ${loopEnabled ? 'On' : 'Off'}`;
  });
  loopInEl.addEventListener('change', () => { parseLoopInputs(); updateLoopStatus(); updateLoopSliderUI(); });
  loopOutEl.addEventListener('change', () => { parseLoopInputs(); updateLoopStatus(); updateLoopSliderUI(); });
  jumpInBtn.addEventListener('click', () => { parseLoopInputs(); seekTo(loopIn); updateLoopSliderUI(); });
  jumpOutBtn.addEventListener('click', () => { parseLoopInputs(); seekTo(loopOutSafe()); updateLoopSliderUI(); });

  // Drawing + onion skin
  function alphaForDistance(dist){
    const base = Number(ghostMax.value);
    const f = Number(falloff.value);
    return Math.max(0, Math.min(1, base * Math.pow(f, dist - 1)));
  }
  function normToViewerPx(p){
    const r = viewer.getBoundingClientRect();
    return { x: p.x * r.width, y: p.y * r.height };
  }
  function viewerPointToNorm(clientX, clientY){
    const r = viewer.getBoundingClientRect();
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  }

  function drawPoint(p, alpha, colorHex){
    if (alpha <= 0.001) return;
    const px = normToViewerPx(p);
    const radius = getPointRadius();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(px.x, px.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = colorHex;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.stroke();
    ctx.restore();
  }
  function drawStroke(stroke, alpha, colorHex){
    if (alpha <= 0.001) return;
    if (!stroke.pts || stroke.pts.length < 2) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.lineWidth = stroke.size;
    ctx.strokeStyle = colorHex;
    ctx.beginPath();
    const p0 = normToViewerPx(stroke.pts[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i=1;i<stroke.pts.length;i++){
      const pi = normToViewerPx(stroke.pts[i]);
      ctx.lineTo(pi.x, pi.y);
    }
    ctx.stroke();

    ctx.lineWidth = Math.max(1, stroke.size - 1);
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.stroke();
    ctx.restore();
  }

  function render(){
    const r = viewer.getBoundingClientRect();
    ctx.clearRect(0,0,r.width,r.height);

    const t = getCurrentTime();
    const st = stepTimeFromT(t);
    timeReadout.textContent = `t=${t.toFixed(3)}s · step=${st.toFixed(3)}s`;

    if (!isPlayable()) return;

    const s = getStepSec();
    const prevCount = Number(onionPrev.value);
    const nextCount = Number(onionNext.value);
    const prevHex = prevColor.value;
    const nextHex = nextColor.value;

    for (let d=prevCount; d>=1; d--){
      const pst = Math.max(0, st - d*s);
      const data = slots.get(slotKey(Number(pst.toFixed(3))));
      if (!data) continue;
      const a = alphaForDistance(d);
      for (const st of data.strokes) drawStroke(st, a, prevHex);
      for (const p of data.points) drawPoint(p, a, prevHex);
    }

    for (let d=1; d<=nextCount; d++){
      const nst = st + d*s;
      const data = slots.get(slotKey(Number(nst.toFixed(3))));
      if (!data) continue;
      const a = alphaForDistance(d);
      for (const st of data.strokes) drawStroke(st, a, nextHex);
      for (const p of data.points) drawPoint(p, a, nextHex);
    }

    const cur = slots.get(slotKey(st));
    if (cur){
      for (const st of cur.strokes) drawStroke(st, 1, '#ffffff');
      for (const p of cur.points) drawPoint(p, 1, '#ffffff');
    }

    if (currentStroke && currentStroke.pts.length > 1){
      drawStroke(currentStroke, 1, '#ffffff');
    }
  }

  // Drawing events
  canvas.addEventListener('pointerdown', (e) => {
    if (interactEnabled) return;
    if (!drawEnabled || !isPlayable()) return;

    canvas.setPointerCapture(e.pointerId);
    const p = viewerPointToNorm(e.clientX, e.clientY);
    const st = currentSlot();
    const data = ensureSlot(st);

    if (tool === 'point'){
      data.points.push(p);
      render();
      return;
    }

    isDrawing = true;
    currentStroke = { size: Number(penSize.value), pts: [p] };
    render();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (interactEnabled) return;
    if (!drawEnabled || !isPlayable()) return;
    if (!isDrawing || tool !== 'pen') return;

    const p = viewerPointToNorm(e.clientX, e.clientY);
    const pts = currentStroke.pts;
    const last = pts[pts.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx*dx + dy*dy < 0.00002) return;

    pts.push(p);
    render();
  });

  function commitStroke(){
    if (!currentStroke) { isDrawing = false; return; }
    if (currentStroke.pts.length < 2) { currentStroke = null; isDrawing = false; return; }
    const st = currentSlot();
    const data = ensureSlot(st);
    data.strokes.push(currentStroke);
    currentStroke = null;
    isDrawing = false;
    render();
  }

  canvas.addEventListener('pointerup', () => { if (tool === 'pen' && !interactEnabled) commitStroke(); });
  canvas.addEventListener('pointercancel', () => { if (tool === 'pen' && !interactEnabled) commitStroke(); });

  // Undo/Clear
  undoBtn.addEventListener('click', () => {
    if (!isPlayable()) return;
    const st = currentSlot();
    const data = slots.get(slotKey(st));
    if (!data) return;
    if (data.strokes.length) data.strokes.pop();
    else if (data.points.length) data.points.pop();
    render();
  });

  clearBtn.addEventListener('click', () => {
    if (!isPlayable()) return;
    slots.delete(slotKey(currentSlot()));
    render();
  });

  clearAllBtn.addEventListener('click', () => {
    slots.clear();
    render();
  });

  // Resize canvas
  function resizeCanvas(){
    const rect = viewer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    render();
    updateLoopSliderUI();
  }
  new ResizeObserver(resizeCanvas).observe(viewer);

  // Hotkeys (hard-bound)
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    const isTypingField =
      t &&
      ((t.tagName === 'TEXTAREA') ||
        (t.tagName === 'INPUT' && ['text','search','url','email','number','password'].includes(t.type)) ||
        t.isContentEditable);

    if (isTypingField) return;

    if (e.code === 'Space' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyI'){
      e.preventDefault();
      e.stopPropagation();
    }

    if (e.code === 'KeyI'){ setInteractEnabled(!interactEnabled); return; }
    if (e.code === 'Space'){
      // Space toggles NATIVE play (not step-play)
      if (isNativePlaying()) pauseNative();
      else {
        stopStepPlay();
        if (mode === Mode.LOCAL) video.playbackRate = getVideoSpeed();
        if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.setPlaybackRate(getVideoSpeed());
        playNative();
      }
      updateStatus();
      return;
    }

    if (e.code === 'ArrowLeft'){
      const mult = e.shiftKey ? 4 : 1;
      stepAdvance(-getStepSec() * mult);
      return;
    }
    if (e.code === 'ArrowRight'){
      const mult = e.shiftKey ? 4 : 1;
      stepAdvance(getStepSec() * mult);
      return;
    }
  }, true);

  // Mode switching
  function setMode(next){
    stopStepPlay();
    pauseNative();
    mode = next;

    if (mode === Mode.YT){
      ytWrap.style.display = 'block';
      ytDimOverlay.style.display = 'block';
      video.style.display = 'none';
      modeBadge.textContent = 'Mode: YouTube';
    } else if (mode === Mode.LOCAL){
      ytWrap.style.display = 'none';
      ytDimOverlay.style.display = 'none';
      video.style.display = 'block';
      modeBadge.textContent = 'Mode: Local Video';
    } else {
      ytWrap.style.display = 'none';
      ytDimOverlay.style.display = 'none';
      video.style.display = 'none';
      modeBadge.textContent = 'Mode: None';
    }
    updateStatus();
    render();
    updateLoopSliderUI();
  }

  // Local file
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (ytPlayer && ytReady) ytPlayer.stopVideo();
    ytReady = false;

    stopStepPlay();
    slots.clear();

    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
    video.pause();
    video.currentTime = 0;
    video.playbackRate = getVideoSpeed();

    loopIn = 0; loopOut = 0; loopEnabled = false;
    syncLoopInputs();
    loopBtn.textContent = 'Loop: Off';
    updateLoopStatus();

    setMode(Mode.LOCAL);
  });

  // Local loop enforcement
  video.addEventListener('timeupdate', () => { enforceLoop(); updateLoopSliderUI(); render(); updateStatus(); });
  video.addEventListener('loadedmetadata', () => {
    loopIn = 0;
    loopOut = video.duration || 0;
    loopEnabled = false;
    syncLoopInputs();
    loopBtn.textContent = 'Loop: Off';
    updateLoopStatus();
    video.playbackRate = getVideoSpeed();
    updateLoopSliderUI();
    render();
    updateStatus();
  });

  // Unload
  unloadBtn.addEventListener('click', () => {
    stopStepPlay();
    slots.clear();
    loopEnabled = false;
    loopBtn.textContent = 'Loop: Off';
    updateLoopStatus();

    video.pause();
    video.removeAttribute('src');
    video.load();

    if (ytPlayer && ytReady) ytPlayer.stopVideo();

    setMode(Mode.NONE);
  });

  // YouTube
  function extractYouTubeId(input){
    const s = (input || '').trim();
    if (!s) return null;
    try {
      if (s.length === 11 && !s.includes('http')) return s;
      const u = new URL(s);
      if (u.hostname.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0] || null;
      if (u.hostname.includes('youtube.com')) {
        const id = u.searchParams.get('v');
        if (id) return id;
        const parts = u.pathname.split('/').filter(Boolean);
        const si = parts.indexOf('shorts');
        if (si >= 0 && parts[si+1]) return parts[si+1];
      }
    } catch {}
    return null;
  }
  function ensureYouTubeApi(){
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve();
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => resolve();
    });
  }

  async function loadYouTube(url){
    const id = extractYouTubeId(url);
    if (!id) { alert('Could not parse YouTube ID.'); return; }

    await ensureYouTubeApi();

    stopStepPlay();
    slots.clear();
    ytReady = false;

    // clear local
    video.pause();
    video.removeAttribute('src');
    video.load();

    setMode(Mode.YT);

    if (ytPlayer) { try { ytPlayer.destroy(); } catch {} ytPlayer = null; }

    ytPlayer = new YT.Player('ytPlayer', {
      videoId: id,
      playerVars: {
        controls: 0,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3,
        playsinline: 1
      },
      events: {
        onReady: () => {
          ytReady = true;

          loopIn = 0;
          loopOut = ytPlayer.getDuration() || 0;
          loopEnabled = false;
          syncLoopInputs();
          loopBtn.textContent = 'Loop: Off';
          updateLoopStatus();

          // Set native speed default
          ytPlayer.setPlaybackRate(getVideoSpeed());

          ytPlayer.seekTo(0, true);
          ytPlayer.pauseVideo();

          updateLoopSliderUI();
          render();
          updateStatus();
        },
        onStateChange: () => {
          // Keep loop enforcement for native play via RAF
          updateStatus();
        }
      }
    });
  }

  loadYtBtn.addEventListener('click', () => loadYouTube(ytUrl.value));

  // RAF loop for YouTube loop enforcement + UI updates
  function rafLoop(){
    if (mode === Mode.YT && isPlayable()){
      enforceLoop();
      updateLoopSliderUI();
    }
    render();
    updateStatus();
    requestAnimationFrame(rafLoop);
  }
  requestAnimationFrame(rafLoop);

  // Colors bindings
  const bindColor = (el, labelEl) => {
    const upd = () => labelEl.textContent = el.value.toLowerCase();
    el.addEventListener('input', () => { upd(); render(); });
    upd();
  };
  bindColor(prevColor, prevColorVal);
  bindColor(nextColor, nextColorVal);

  // Init
  setTool('pen');
  setDrawEnabled(true);
  setInteractEnabled(false);
  setMode(Mode.NONE);
  resizeCanvas();
  updateLoopStatus();
  updateStatus();
})();
