/* ============================================================
   scan.js — photo of a remote  ->  clean diagram (all in the browser)

   Load AFTER the main script in index.html:
       <script src="/scan.js"></script>

   The photo is downscaled to ~800px in a canvas, analysed, then thrown
   away. What is kept is tiny: the body outline (82 ints) + aspect ratio
   + one entry per button. The ESP32 never sees an image.
   ============================================================ */
(() => {
  const $ = id => document.getElementById(id);
  const WORK = 800; // longest side used for analysis

  /* ---------- image helpers ---------- */
  function label(bin, w, h) {            // 4-connected components
    const lab = new Int32Array(w * h), st = new Int32Array(w * h), comps = [null];
    let id = 0;
    for (let s = 0; s < w * h; s++) {
      if (!bin[s] || lab[s]) continue;
      id++; let sp = 0, a = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      st[sp++] = s; lab[s] = id;
      while (sp) {
        const p = st[--sp], x = p % w, y = (p / w) | 0; a++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && bin[p - 1] && !lab[p - 1]) { lab[p - 1] = id; st[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1] && !lab[p + 1]) { lab[p + 1] = id; st[sp++] = p + 1; }
        if (y > 0 && bin[p - w] && !lab[p - w]) { lab[p - w] = id; st[sp++] = p - w; }
        if (y < h - 1 && bin[p + w] && !lab[p + w]) { lab[p + w] = id; st[sp++] = p + w; }
      }
      comps.push({ a, x0, y0, x1, y1 });
    }
    return { lab, comps };
  }
  function morph(b, w, h, erode) {       // 3x3 erode / dilate
    const o = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const c = b[p - w - 1] + b[p - w] + b[p - w + 1] + b[p - 1] + b[p] + b[p + 1] + b[p + w - 1] + b[p + w] + b[p + w + 1];
      o[p] = erode ? (c === 9 ? 1 : 0) : (c > 0 ? 1 : 0);
    }
    return o;
  }
  const median = a => { a.sort((x, y) => x - y); return a[a.length >> 1] || 0; };
  const iou = (a, b) => {
    const iw = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), ih = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (iw <= 0 || ih <= 0) return 0;
    const i = iw * ih; return i / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i);
  };

  /* ---------- pull button candidates out of a binary map ---------- */
  function findBoxes(bin, w, h, pad) {
    const { lab, comps } = label(bin, w, h), out = [];
    for (let id = 1; id < comps.length; id++) {
      const c = comps[id], bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      if (bw < w * 0.045 || bh < h * 0.014 || bw > w * 0.95 || bh > h * 0.3) continue;
      if (bw * bh > w * h * 0.2 || Math.max(bw / bh, bh / bw) > 8) continue;
      let filled = 0;                    // scanline fill, so printed labels don't count as holes
      for (let y = c.y0; y <= c.y1; y++) {
        let l = -1, r = -1;
        for (let x = c.x0; x <= c.x1; x++) if (lab[y * w + x] === id) { if (l < 0) l = x; r = x; }
        if (l >= 0) filled += r - l + 1;
      }
      const fill = filled / (bw * bh);
      if (fill < 0.6) continue;
      out.push({ x0: c.x0 - pad, y0: c.y0 - pad, x1: c.x1 + 1 + pad, y1: c.y1 + 1 + pad, fill });
    }
    return out;
  }

  /* ---------- the whole analysis ---------- */
  function analyze(img, w, h, o) {
    const d = img.data, N = w * h;
    // 1. background colour = median of the border ring, then flood from the edges
    const ring = [[], [], []];
    for (let i = 0; i < N; i++) {
      const x = i % w, y = (i / w) | 0;
      if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) for (let k = 0; k < 3; k++) ring[k].push(d[i * 4 + k]);
    }
    const bg = ring.map(median);
    const notFg = new Uint8Array(N);
    for (let i = 0; i < N; i++)
      notFg[i] = Math.max(Math.abs(d[i * 4] - bg[0]), Math.abs(d[i * 4 + 1] - bg[1]), Math.abs(d[i * 4 + 2] - bg[2])) <= o.bg ? 1 : 0;
    const L = label(notFg, w, h), isBg = new Uint8Array(L.comps.length);
    for (let i = 0; i < N; i++) {
      const x = i % w, y = (i / w) | 0;
      if (L.lab[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) isBg[L.lab[i]] = 1;
    }
    const raw = new Uint8Array(N);
    for (let i = 0; i < N; i++) raw[i] = L.lab[i] && isBg[L.lab[i]] ? 0 : 1;
    // keep only the biggest blob = the remote
    const M = label(raw, w, h); let best = 0;
    for (let i = 1; i < M.comps.length; i++) if (!best || M.comps[i].a > M.comps[best].a) best = i;
    if (!best) return { boxes: [], crop: { x: 0, y: 0, w, h }, ar: w / h, outline: [] };
    const bb = M.comps[best], cw = bb.x1 - bb.x0 + 1, ch = bb.y1 - bb.y0 + 1;

    // 2. crop everything to the remote
    const m = new Uint8Array(cw * ch), g = new Float32Array(cw * ch), rgb = [[], [], []];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const si = (y + bb.y0) * w + x + bb.x0, di = y * cw + x;
      m[di] = M.lab[si] === best ? 1 : 0;
      const r = d[si * 4], gg = d[si * 4 + 1], b = d[si * 4 + 2];
      g[di] = 0.299 * r + 0.587 * gg + 0.114 * b;
      if (m[di] && (di % 3 === 0)) { rgb[0].push(r); rgb[1].push(gg); rgb[2].push(b); }
    }
    const body = rgb.map(median);

    // 3. body outline: left/right extent at 41 heights
    const outline = []; let pl = 0, pr = 1000;
    for (let i = 0; i <= 40; i++) {
      const yc = Math.round(i / 40 * (ch - 1)); let l = cw, r = -1;
      for (let y = Math.max(0, yc - 1); y <= Math.min(ch - 1, yc + 1); y++)
        for (let x = 0; x < cw; x++) if (m[y * cw + x]) { if (x < l) l = x; if (x > r) r = x; }
      if (r >= 0) { pl = Math.round(l / (cw - 1) * 1000); pr = Math.round(r / (cw - 1) * 1000); }
      outline.push(pl, pr);
    }

    // keep away from the silhouette edge
    let inner = m; for (let i = 0; i < 3; i++) inner = morph(inner, cw, ch, true);

    // 4a. edge-enclosed regions (works when buttons have outlines)
    const mag = new Uint16Array(cw * ch), hist = new Uint32Array(1024); let cnt = 0;
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      const p = y * cw + x;
      const gx = -g[p - cw - 1] + g[p - cw + 1] - 2 * g[p - 1] + 2 * g[p + 1] - g[p + cw - 1] + g[p + cw + 1];
      const gy = -g[p - cw - 1] - 2 * g[p - cw] - g[p - cw + 1] + g[p + cw - 1] + 2 * g[p + cw] + g[p + cw + 1];
      const v = Math.min(1023, Math.hypot(gx, gy) | 0); mag[p] = v;
      if (m[p]) { hist[v]++; cnt++; }
    }
    let acc = 0, t = 1023; const want = cnt * o.edge / 100;
    while (t > 8 && acc < want) acc += hist[t--];
    const E = new Uint8Array(cw * ch);
    for (let i = 0; i < E.length; i++) E[i] = mag[i] > t ? 1 : 0;
    const Ed = morph(E, cw, ch, false), binA = new Uint8Array(cw * ch);
    for (let i = 0; i < binA.length; i++) binA[i] = inner[i] && !Ed[i] ? 1 : 0;
    const A = findBoxes(binA, cw, ch, 2);

    // 4b. colour blobs (works for filled buttons, even without clear outlines)
    let binB = new Uint8Array(cw * ch);
    for (let i = 0; i < binB.length; i++) {
      const s = ((((i / cw) | 0) + bb.y0) * w + (i % cw) + bb.x0) * 4;
      binB[i] = inner[i] && Math.max(Math.abs(d[s] - body[0]), Math.abs(d[s + 1] - body[1]), Math.abs(d[s + 2] - body[2])) > o.col ? 1 : 0;
    }
    binB = morph(morph(binB, cw, ch, true), cw, ch, false);
    const B = findBoxes(binB, cw, ch, 0);

    // 5. merge: most rectangular first, drop duplicates, drop containers (panels, d-pad rings)
    const all = A.concat(B).sort((a, b) => b.fill - a.fill), keep = [];
    for (const b of all) if (!keep.some(k => iou(k, b) > 0.5)) keep.push(b);
    const boxes = keep.filter(b => {
      const inside = keep.filter(o2 => o2 !== b && (o2.x0 + o2.x1) / 2 > b.x0 && (o2.x0 + o2.x1) / 2 < b.x1 &&
        (o2.y0 + o2.y1) / 2 > b.y0 && (o2.y0 + o2.y1) / 2 < b.y1 &&
        (o2.x1 - o2.x0) * (o2.y1 - o2.y0) < 0.6 * (b.x1 - b.x0) * (b.y1 - b.y0)).length;
      return inside < 3;
    }).map(b => {
      const bw = b.x1 - b.x0, bh = b.y1 - b.y0, ar = bw / bh, sq = ar > 0.8 && ar < 1.25;
      const shape = sq ? (b.fill < 0.88 ? 'circle' : 'square') : (b.fill < 0.925 ? 'pill' : 'bar');
      return { x: (b.x0 + bw / 2) / cw, y: (b.y0 + bh / 2) / ch, w: bw / cw, h: bh / ch, shape };
    });
    boxes.sort((a, b) => (Math.round(a.y * 50) * 10 + a.x) - (Math.round(b.y * 50) * 10 + b.x));
    return { boxes, outline, ar: cw / ch, crop: { x: bb.x0, y: bb.y0, w: cw, h: ch } };
  }

  /* ---------- diagram -> SVG data URL ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render(r, withButtons) {
    const dg = r.diagram, W = 1000, H = Math.round(W / dg.ar), o = dg.outline, n = o.length / 2;
    const Lp = [], Rp = [];
    for (let i = 0; i < n; i++) { const y = Math.round(i / (n - 1) * H); Lp.push(o[i * 2] + ',' + y); Rp.unshift(o[i * 2 + 1] + ',' + y); }
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<polygon points="${Lp.concat(Rp).join(' ')}" fill="#182119" stroke="#34493e" stroke-width="8" stroke-linejoin="round"/>`;
    if (withButtons) {
      const k = W / (dg.ref || 340);
      (r.buttons || []).forEach(b => {
        const w = b.w * k, h = b.h * k, cx = (b.x || 50) / 100 * W, cy = (b.y || 50) / 100 * H, mn = Math.min(b.w, b.h);
        const rx = b.shape === 'circle' ? w / 2 : b.shape === 'pill' ? Math.min(w, h) / 2 : b.shape === 'bar' ? 9 * k : Math.max(10, mn * 0.18) * k;
        const ry = b.shape === 'circle' ? h / 2 : rx;
        const fs = Math.max(12, Math.min(h * 0.4, w / Math.max(2, (b.name || '').length * 0.62), 30));
        s += `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${rx}" ry="${ry}" fill="#22302a" stroke="${b.captured ? '#57e39a' : '#4a6355'}" stroke-width="4"/>` +
          `<text x="${cx}" y="${cy}" fill="#e9f1ec" font-family="sans-serif" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${esc(b.name || '')}</text>`;
      });
    }
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s + '</svg>');
  }

  /* ---------- UI: mode-sheet entry + scan overlay ---------- */
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none'; document.body.appendChild(file);

  const opt = document.createElement('div');
  opt.className = 'mode-opt';
  opt.innerHTML = '<div class="m-ico">✨</div><div><h4>Scan a photo into a diagram</h4><p>Finds the buttons and their shapes right in your browser</p></div>';
  opt.onclick = () => { closeModeSheet(); file.value = ''; file.click(); };
  const sheet = document.querySelector('#modeSheet .capture-card');
  sheet.insertBefore(opt, sheet.querySelector('.row'));

  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.id = 'scanOverlay';
  const slider = (id, name, min, max, val) =>
    `<div class="field" style="margin-top:12px"><label>${name}</label><input type="range" id="${id}" min="${min}" max="${max}" value="${val}" style="width:100%;accent-color:var(--accent)"></div>`;
  ov.innerHTML = `<div class="capture-card" style="max-width:440px;max-height:92vh;overflow:auto;text-align:left">
    <h3 style="text-align:center">Scan remote</h3>
    <canvas id="scanCv" style="display:block;margin:12px auto;max-width:100%;max-height:44vh;border-radius:12px;background:var(--bg2)"></canvas>
    <div class="status-line" id="scanInfo" style="text-align:center;margin-top:0">Reading photo…</div>
    ${slider('scBg', 'Background tolerance', 10, 90, 38)}
    ${slider('scEdge', 'Outline sensitivity', 6, 35, 16)}
    ${slider('scCol', 'Colour sensitivity', 10, 90, 28)}
    <div class="capture-actions"><button class="ghost-btn" id="scanCancel">Cancel</button>
    <button class="primary-btn" id="scanGo" disabled>Build diagram</button></div></div>`;
  document.body.appendChild(ov);

  let src = null, res = null, timer = null;
  const params = () => ({ bg: +$('scBg').value, edge: +$('scEdge').value, col: +$('scCol').value });

  function run() {
    if (!src) return;
    res = analyze(src.img, src.w, src.h, params());
    const c = $('scanCv'), cr = res.crop;
    c.width = cr.w; c.height = cr.h;
    const x = c.getContext('2d');
    x.drawImage(src.cv, cr.x, cr.y, cr.w, cr.h, 0, 0, cr.w, cr.h);
    x.lineWidth = Math.max(2, cr.w / 120); x.strokeStyle = '#ff8a3d'; x.fillStyle = 'rgba(255,138,61,.22)';
    res.boxes.forEach(b => {
      const bx = (b.x - b.w / 2) * cr.w, by = (b.y - b.h / 2) * cr.h, bw = b.w * cr.w, bh = b.h * cr.h;
      x.beginPath();
      if (b.shape === 'circle') x.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, 7);
      else if (x.roundRect) x.roundRect(bx, by, bw, bh, b.shape === 'pill' ? Math.min(bw, bh) / 2 : 6);
      else x.rect(bx, by, bw, bh);
      x.fill(); x.stroke();
    });
    $('scanInfo').textContent = res.boxes.length + ' buttons found — adjust if some are missing or extra';
    $('scanGo').disabled = !res.boxes.length;
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 120); };
  ['scBg', 'scEdge', 'scCol'].forEach(id => $(id).addEventListener('input', later));
  $('scanCancel').onclick = () => { ov.classList.remove('active'); src = null; };

  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    ov.classList.add('active'); $('scanInfo').textContent = 'Reading photo…'; $('scanGo').disabled = true;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, WORK / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.imageSmoothingQuality = 'high'; cx.drawImage(bmp, 0, 0, cv.width, cv.height);
      src = { cv, w: cv.width, h: cv.height, img: cx.getImageData(0, 0, cv.width, cv.height) };
      if (bmp.close) bmp.close();
      setTimeout(run, 30);
    } catch (e) {
      $('scanInfo').textContent = "Couldn't read that image";
    }
  });

  $('scanGo').onclick = () => {
    if (!res || !res.boxes.length) return;
    const boxes = res.boxes;
    ov.classList.remove('active');
    draft = { id: 'r_' + Date.now(), name: '', emoji: '', mode: 'photo', photo: null, buttons: [],
              diagram: { ar: +res.ar.toFixed(4), ref: 340, outline: res.outline } };
    isEditingExisting = false;
    openBuilder();
    const img = $('photoImg');
    (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => requestAnimationFrame(() => {
      const ref = $('photoWrap').clientWidth || 340; draft.diagram.ref = ref;
      draft.buttons = boxes.map((b, i) => ({
        id: 'b_' + Date.now() + '_' + i, name: 'Btn ' + (i + 1), shape: b.shape,
        w: Math.max(MIN_SIZE, Math.round(b.w * ref)), h: Math.max(MIN_SIZE, Math.round(b.h * ref)),
        x: +(b.x * 100).toFixed(2), y: +(b.y * 100).toFixed(2), captured: false, code: null, emoji: ''
      }));
      clampAllMarkers(); updateSaveEnabled();
      showToast(boxes.length + ' buttons placed — tap one to rename it');
    }));
    src = null;
  };

  /* ---------- hooks into the existing app (no edits to index.html needed) ---------- */
  const _openBuilder = openBuilder;
  openBuilder = function () {                       // builder shows the bare silhouette; markers are the buttons
    if (draft && draft.diagram) draft.photo = render(draft, false);
    _openBuilder();
  };
  const _save = saveCurrentRemote;
  saveCurrentRemote = function () {                 // bake names + shapes into the picture used on the Run screen
    if (draft && draft.diagram) {
      draft.diagram.ref = $('photoWrap').clientWidth || draft.diagram.ref;
      draft.photo = render(draft, true);
    }
    _save();
  };
  const _refresh = refreshRemotes;
  refreshRemotes = async function () {              // diagram remotes redraw from ESP32 data, so any phone can show them
    await _refresh();
    remotes.forEach(r => { if (r.diagram && r.diagram.outline) r.photo = render(r, true); });
  };
})();
