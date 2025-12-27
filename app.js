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

  // Video step size
  const videoStepSec = document.getElementById('videoStepSec');
  const videoStepSecVal = document.getElementById('videoStepSecVal');

  // Drawing slot size
  const stepSec = document.getElementById('stepSec');
  const stepSecVal = document.getElementById('stepSecVal');

  const rate = document.getElementById('rate');
  const rateVal = document.getElementById('rateVal');

  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const playBtn = document.getElementById('playBtn');
  const stepPlayBtn = document.getElementById('stepPlayBtn');
  const holdBtn = document.getElementById('holdBtn');
  const snapToSlotBtn = document.getElementById('snapToSlotBtn');
  const interactBtn = document.getElementById('interactBtn');
  const helpBtn = document.getElementById('helpBtn');

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

  const timeReadout = document.getElementById('timeReadout');
  const modeBadge = document.getElementById('modeBadge');

  // Mode
  const Mode = { NONE:'none', YT:'youtube', LOCAL:'local' };
  let mode = Mode.NONE;

  // YouTube
  let ytPlayer = null;
  let ytReady = false;

  // Hold
  let holdEnabled = false;
  let holdTime = 0;

  // Interact mode (canvas click-through)
  let interactEnabled = false;

  // Loop
  let loopEnabled = false;
  let loopIn = 0;
  let loopOut = 0;

  // Step-play (discrete stepping playback)
  let stepPlayEnabled = false;
  let stepPlayTimer = null;

  // Drawing state
  let drawEnabled = true;
  let tool = 'pen';
  let isDrawing = false;
  let currentStroke = null;

  // slotKey -> {points, strokes}
  const slots = new Map();

  // Utils
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const roundTo = (n, step) => Math.round(n / step) * step;

  function getVideoStepSec(){ return Number(videoStepSec.value); }
  function getStepSec(){ return Number(stepSec.value); } // drawing slot size
  function getPointRadius(){ return Number(pointSize.value); }

  // When we "jump to loop out", land slightly inside the loop so enforceLoop doesn't immediately snap to loopIn
  function loopOutSafe(){
    if (!loopValid()) return loopOut;
    const eps = Math.min(0.02, Math.max(0.002, getVideoStepSec() * 0.05)); // 0.2%–2% of a step
    return Math.max(loopIn, loopOut - eps);
  }

  function slotTimeFromT(t){
    const s = getStepSec();
    const st = roundTo(Math.max(0,t), s);
    return Number(st.toFixed(3));
  }
  function slotKey(st){ return st.toFixed(3); }
  function ensureSlot(st){
    const k = slotKey(st);
    if (!slots.has(k)) slots.set(k, { points: [], strokes: [] });
    return slots.get(k);
  }
  function viewerPointToNorm(clientX, clientY){
    const r = viewer.getBoundingClientRect();
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  }
  function normToViewerPx(p){
    const r = viewer.getBoundingClientRect();
    return { x: p.x * r.width, y: p.y * r.height };
  }

  // Playback abstraction
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
  function isPlayingNow(){
    if (stepPlayTimer) return true; // step-play counts as "playing"
    if (mode === Mode.YT && ytReady && ytPlayer) return ytPlayer.getPlayerState() === 1;
    if (mode === Mode.LOCAL) return !video.paused;
    return false;
  }
  function setPlaybackRate(v){
    if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.setPlaybackRate(v);
    if (mode === Mode.LOCAL) video.playbackRate = v;
  }
  function seekTo(t){
    const dur = getDuration();
    const nt = Math.max(0, Math.min(dur || t, t));
    if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.seekTo(nt, true);
    if (mode === Mode.LOCAL) video.currentTime = nt;
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
  function clampToLoop(t){
    if (!loopEnabled || !loopValid()) return t;
    if (t < loopIn) return loopIn;
    if (t > loopOut) return loopOutSafe();
    // if you land exactly on loopOut, pull inside the loop
    if (Math.abs(t - loopOut) < 0.0005) return loopOutSafe();
    return t;
  }
  function updateLoopStatus(){
    if (!loopEnabled) { loopStatus.textContent = 'Loop inactive.'; return; }
    if (!loopValid()) { loopStatus.textContent = 'Loop ON but invalid (Out must be > In).'; return; }
    loopStatus.textContent = `Looping: ${loopIn.toFixed(2)}s → ${loopOut.toFixed(2)}s`;
  }
  function enforceLoop(){
    if (!loopEnabled || !loopValid() || !isPlayable()) return;
    const t = getCurrentTime();
    // only enforce when truly beyond loopOut (not when we intentionally set a "safe" just-inside time)
    if (t >= loopOut - 0.0005){
      seekTo(loopIn);
      if (holdEnabled && mode === Mode.YT) holdTime = loopIn;
    }
  }

  // Loop slider helpers
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

      if (loopEnabled && loopValid()){
        const ct = clampToLoop(getCurrentTime());
        seekTo(ct);
        if (holdEnabled && mode === Mode.YT){ holdTime = ct; applyHoldFreeze(); }
      }
      updateButtons();
      updateLoopSliderUI();
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
    const p = pointerPctFromEvent(e);
    const t = pctToTime(p);
    const target = (loopEnabled && loopValid()) ? clampToLoop(t) : t;
    seekTo(target);
    if (holdEnabled && mode === Mode.YT){
      holdTime = getCurrentTime();
      applyHoldFreeze();
    }
    updateLoopSliderUI();
  });

  // Hold (stable freeze)
  function applyHoldFreeze(){
    if (mode !== Mode.YT || !ytReady || !ytPlayer) return;
    ytPlayer.pauseVideo();
    ytPlayer.seekTo(holdTime, true);
  }
  function setHoldEnabled(on){
    if (mode !== Mode.YT || !isPlayable()) on = false;
    holdEnabled = on;
    if (holdEnabled){
      holdTime = clampToLoop(getCurrentTime());
      applyHoldFreeze();
    }
    updateButtons();
  }

  // Interact mode
  function setInteractEnabled(on){
    interactEnabled = on;
    canvas.style.pointerEvents = interactEnabled ? 'none' : 'auto';
    interactBtn.textContent = `Interact: ${interactEnabled ? 'On' : 'Off'}`;
    toggleDrawBtn.textContent = `Draw: ${(!interactEnabled && drawEnabled) ? 'On' : 'Off'}`;
  }

  // Step-play
  function stopStepPlay(){
    if (stepPlayTimer){
      clearInterval(stepPlayTimer);
      stepPlayTimer = null;
    }
    updateButtons();
  }
  function startStepPlay(){
    if (!isPlayable()) return;
    // Stepped playback is driven by discrete seeks; keep native media paused.
    if (mode === Mode.YT && ytReady && ytPlayer) ytPlayer.pauseVideo();
    if (mode === Mode.LOCAL) video.pause();

    setHoldEnabled(false);
    stopStepPlay();

    const intervalMs = Math.max(10, Math.round((getVideoStepSec() * 1000) / Math.max(0.05, Number(rate.value))));
    stepPlayTimer = setInterval(() => {
      stepAdvance(+getVideoStepSec());
    }, intervalMs);

    updateButtons();
  }
  function toggleStepPlay(){
    stepPlayEnabled = !stepPlayEnabled;
    if (stepPlayEnabled) startStepPlay();
    else stopStepPlay();
    updateButtons();
  }

  // UI helpers
  function setMode(next){
    // switching modes should stop step-play
    stepPlayEnabled = false;
    stopStepPlay();

    if (mode === Mode.YT && next !== Mode.YT) holdEnabled = false;
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
    updateButtons();
    render();
    updateLoopSliderUI();
  }

  function updateButtons(){
    playBtn.textContent = isPlayingNow() ? 'Pause' : 'Play';
    stepPlayBtn.textContent = `Step Play: ${stepPlayEnabled ? 'On' : 'Off'}`;
    holdBtn.textContent = `Hold: ${holdEnabled ? 'On' : 'Off'}`;
    loopBtn.textContent = `Loop: ${loopEnabled ? 'On' : 'Off'}`;
    updateLoopStatus();
  }

  function bindRange(rangeEl, labelEl, fmt=(v)=>v){
    const upd = () => labelEl.textContent = fmt(rangeEl.value);
    rangeEl.addEventListener('input', () => {
      upd();
      // step-play timing depends on video step and rate
      if (rangeEl === videoStepSec || rangeEl === rate){
        if (stepPlayEnabled){
          startStepPlay(); // restart timer with new interval
        }
      }
      render();
      updateLoopSliderUI();
    });
    upd();
  }

  bindRange(videoStepSec, videoStepSecVal, v => Number(v).toFixed(2));
  bindRange(stepSec, stepSecVal, v => Number(v).toFixed(2));
  bindRange(rate, rateVal, v => Number(v).toFixed(2));
  rate.addEventListener('input', () => setPlaybackRate(Number(rate.value)));

  bindRange(videoOpacity, videoOpacityVal, v => Number(v).toFixed(2));
  videoOpacity.addEventListener('input', () => video.style.opacity = String(videoOpacity.value));
  video.style.opacity = String(videoOpacity.value);

  bindRange(ytDim, ytDimVal, v => Number(v).toFixed(2));
  ytDim.addEventListener('input', () => ytDimOverlay.style.opacity = String(ytDim.value));
  ytDimOverlay.style.opacity = String(ytDim.value);

  bindRange(penSize, penSizeVal, v => String(v));
  bindRange(pointSize, pointSizeVal, v => String(v));
  bindRange(onionPrev, onionPrevVal, v => String(v));
  bindRange(onionNext, onionNextVal, v => String(v));
  bindRange(falloff, falloffVal, v => Number(v).toFixed(2));
  bindRange(ghostMax, ghostMaxVal, v => Number(v).toFixed(2));

  const bindColor = (el, labelEl) => {
    const upd = () => labelEl.textContent = el.value.toLowerCase();
    el.addEventListener('input', () => { upd(); render(); });
    upd();
  };
  bindColor(prevColor, prevColorVal);
  bindColor(nextColor, nextColorVal);

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

  // Playback controls
  function playNative(){
    if (!isPlayable()) return;
    setHoldEnabled(false);
    if (mode === Mode.YT) ytPlayer.playVideo();
    if (mode === Mode.LOCAL) video.play();
    updateButtons();
  }
  function pauseNative(){
    if (!isPlayable()) return;
    if (mode === Mode.YT) ytPlayer.pauseVideo();
    if (mode === Mode.LOCAL) video.pause();
    updateButtons();
  }

  function play(){
    if (!isPlayable()) return;
    if (stepPlayEnabled){
      startStepPlay();
      return;
    }
    playNative();
  }
  function pause(){
    stopStepPlay();
    pauseNative();
  }
  function togglePlay(){
    if (!isPlayable()) return;
    if (isPlayingNow()) pause();
    else play();
  }

  // Advance without forcing pause (used by step-play timer)
  function stepAdvance(delta){
    if (!isPlayable()) return;

    const t = getCurrentTime();
    let nt = t + delta;
    const eps = 0.002;

    if (loopEnabled && loopValid()){
      if (delta < 0 && t <= loopIn + eps){
        nt = loopOutSafe();
      } else if (delta > 0 && t >= loopOut - eps){
        nt = loopIn;
      } else {
        if (nt < loopIn) nt = loopOutSafe();
        if (nt > loopOut) nt = loopIn;
        if (Math.abs(nt - loopOut) < 0.0005) nt = loopOutSafe();
      }
    } else {
      nt = Math.max(0, Math.min(getDuration() || nt, nt));
    }

    seekTo(nt);

    if (holdEnabled && mode === Mode.YT){
      holdTime = nt;
      applyHoldFreeze();
    }

    render();
    updateLoopSliderUI();
  }

  // Manual step (always pauses)
  function stepBySeconds(delta){
    if (!isPlayable()) return;
    pause();
    stepAdvance(delta);
  }

  function snapToSlot(){
    if (!isPlayable()) return;
    pause();
    const st = slotTimeFromT(getCurrentTime());
    const target = (loopEnabled && loopValid()) ? clampToLoop(st) : st;
    seekTo(target);
    if (holdEnabled && mode === Mode.YT){
      holdTime = target;
      applyHoldFreeze();
    }
    render();
    updateLoopSliderUI();
  }

  backBtn.addEventListener('click', () => stepBySeconds(-getVideoStepSec()));
  nextBtn.addEventListener('click', () => stepBySeconds(getVideoStepSec()));
  playBtn.addEventListener('click', togglePlay);

  stepPlayBtn.addEventListener('click', toggleStepPlay);

  holdBtn.addEventListener('click', () => setHoldEnabled(!holdEnabled));
  snapToSlotBtn.addEventListener('click', snapToSlot);

  interactBtn.addEventListener('click', () => setInteractEnabled(!interactEnabled));

  helpBtn.addEventListener('click', () => {
    alert(
      "Step Play:\n" +
      "• Plays by hopping forward in fixed Video step sizes (discrete stepping playback).\n" +
      "• Playback rate affects how fast those steps happen.\n\n" +
      "Loop stepping:\n" +
      "• Forward past Out wraps to In.\n" +
      "• Back past In wraps to just-inside Out (so it doesn't snap back instantly).\n\n" +
      "Snap to Slot:\n" +
      "• Moves video time to the nearest drawing-slot grid.\n\n" +
      "Interact Mode:\n" +
      "• Disables drawing so you can click inside YouTube to close overlays."
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

    if (loopEnabled && loopValid() && isPlayable()){
      const t = clampToLoop(getCurrentTime());
      seekTo(t);
      if (holdEnabled && mode === Mode.YT){
        holdTime = t;
        applyHoldFreeze();
      }
    }
    updateButtons();
    render();
    updateLoopSliderUI();
  }

  setInBtn.addEventListener('click', () => {
    if (!isPlayable()) return;
    loopIn = getCurrentTime();
    syncLoopInputs();
    updateButtons();
    updateLoopSliderUI();
  });

  setOutBtn.addEventListener('click', () => {
    if (!isPlayable()) return;
    loopOut = getCurrentTime();
    syncLoopInputs();
    updateButtons();
    updateLoopSliderUI();
  });

  loopBtn.addEventListener('click', () => setLoopEnabled(!loopEnabled));

  loopInEl.addEventListener('change', () => { parseLoopInputs(); updateButtons(); render(); updateLoopSliderUI(); });
  loopOutEl.addEventListener('change', () => { parseLoopInputs(); updateButtons(); render(); updateLoopSliderUI(); });

  jumpInBtn.addEventListener('click', () => {
    parseLoopInputs();
    pause();
    seekTo(loopIn);
    if (holdEnabled && mode === Mode.YT){
      holdTime = loopIn;
      applyHoldFreeze();
    }
    render();
    updateLoopSliderUI();
  });

  jumpOutBtn.addEventListener('click', () => {
    parseLoopInputs();
    pause();
    seekTo(loopOutSafe());
    if (holdEnabled && mode === Mode.YT){
      holdTime = loopOutSafe();
      applyHoldFreeze();
    }
    render();
    updateLoopSliderUI();
  });

  // Undo/Clear current slot
  function currentSlot(){ return slotTimeFromT(getCurrentTime()); }

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

  // Onion alpha
  function alphaForDistance(dist){
    const base = Number(ghostMax.value);
    const f = Number(falloff.value);
    const a = base * Math.pow(f, dist - 1);
    return Math.max(0, Math.min(1, a));
  }

  // Drawing render
  function drawPoint(p, alpha, colorHex){
    if (alpha <= 0.001) return;
    const px = normToViewerPx(p);
    const radius = getPointRadius();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
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
    ctx.globalCompositeOperation = 'source-over';
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
    const st = slotTimeFromT(t);
    timeReadout.textContent = `t=${t.toFixed(3)}s · slot=${st.toFixed(3)}s`;

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

  // HARD-BIND HOTKEYS (capture phase)
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

    if (e.code === 'KeyI'){
      setInteractEnabled(!interactEnabled);
      return;
    }

    if (e.code === 'Space'){
      togglePlay();
      return;
    }

    if (e.code === 'ArrowLeft'){
      const mult = e.shiftKey ? 4 : 1;
      stepBySeconds(-getVideoStepSec() * mult);
      return;
    }

    if (e.code === 'ArrowRight'){
      const mult = e.shiftKey ? 4 : 1;
      stepBySeconds(getVideoStepSec() * mult);
      return;
    }
  }, true);

  // Local file
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (ytPlayer && ytReady) ytPlayer.stopVideo();
    ytReady = false;
    setHoldEnabled(false);

    stepPlayEnabled = false;
    stopStepPlay();

    slots.clear();
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
    video.pause();
    video.currentTime = 0;

    loopIn = 0;
    loopOut = 0;
    loopEnabled = false;
    syncLoopInputs();
    updateButtons();

    setMode(Mode.LOCAL);
    setPlaybackRate(Number(rate.value));
    render();
    updateLoopSliderUI();
  });

  // Unload
  unloadBtn.addEventListener('click', () => {
    slots.clear();
    setHoldEnabled(false);

    stepPlayEnabled = false;
    stopStepPlay();

    loopEnabled = false;
    updateButtons();

    video.pause();
    video.removeAttribute('src');
    video.load();

    if (ytPlayer && ytReady) ytPlayer.stopVideo();

    setMode(Mode.NONE);
    render();
    updateLoopSliderUI();
  });

  // Local time updates + loop
  video.addEventListener('timeupdate', () => { enforceLoop(); render(); updateLoopSliderUI(); });
  video.addEventListener('loadedmetadata', () => {
    setPlaybackRate(Number(rate.value));
    loopIn = 0;
    loopOut = video.duration || 0;
    loopEnabled = false;
    syncLoopInputs();
    updateButtons();
    render();
    updateLoopSliderUI();
  });

  // YouTube loading
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

    video.pause();
    video.removeAttribute('src');
    video.load();

    slots.clear();
    ytReady = false;
    setHoldEnabled(false);

    stepPlayEnabled = false;
    stopStepPlay();

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
          setPlaybackRate(Number(rate.value));

          loopIn = 0;
          loopOut = ytPlayer.getDuration() || 0;
          loopEnabled = false;
          syncLoopInputs();
          updateButtons();

          ytPlayer.seekTo(0, true);
          ytPlayer.pauseVideo();
          render();
          updateLoopSliderUI();
        },
        onStateChange: () => { updateButtons(); }
      }
    });
  }

  loadYtBtn.addEventListener('click', () => loadYouTube(ytUrl.value));

  // RAF loop (YT loop enforcement + hold stabilization + slider playhead)
  function rafLoop(){
    if (mode === Mode.YT && isPlayable()){
      enforceLoop();
      if (holdEnabled){
        const t = getCurrentTime();
        if (Math.abs(t - holdTime) > 0.02){
          applyHoldFreeze();
        }
      }
    }
    render();
    updateLoopSliderUI();
    requestAnimationFrame(rafLoop);
  }
  requestAnimationFrame(rafLoop);

  // View defaults
  function bindRangeSimple(rangeEl, on){
    rangeEl.addEventListener('input', on);
    on();
  }
  bindRangeSimple(videoOpacity, () => video.style.opacity = String(videoOpacity.value));
  bindRangeSimple(ytDim, () => ytDimOverlay.style.opacity = String(ytDim.value));

  // Init defaults
  setTool('pen');
  setDrawEnabled(true);
  setInteractEnabled(false);

  function init(){
    setMode(Mode.NONE);
    resizeCanvas();
    updateButtons();
    updateLoopSliderUI();
  }
  init();
})();
