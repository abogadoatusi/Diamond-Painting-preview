/* ダイヤモンドアート図案メーカー — UI とアプリ本体 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SYMBOLS = ('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz' +
                 '0123456789+*=<>#@%&$?!~^').split('');
  var STORE_KEY = 'diamond-art-maker-v1';

  var S = {
    img: null, srcUrl: null,
    cols: 0, rows: 0, bead: 2.5,
    idx: null, palette: [], counts: [],
    sel: 0, edited: false, undo: [], cellPx: 10, everGenerated: false,
    editingIndex: -1
  };

  /* ================= 寸法計算 ================= */

  function beadSize() {
    var p = $('beadPreset').value;
    return p === 'custom' ? Math.max(0.5, +$('bead').value || 2.5) : +p;
  }

  function dims() {
    var pw = Math.max(20, +$('paperW').value || 100);
    var ph = Math.max(20, +$('paperH').value || 148);
    var m = Math.max(0, +$('margin').value || 0);
    var b = beadSize();
    var cols = Math.max(1, Math.floor((pw - 2 * m) / b + 1e-9));
    var rows = Math.max(1, Math.floor((ph - 2 * m) / b + 1e-9));
    var artW = cols * b, artH = rows * b;
    return {
      paperW: pw, paperH: ph, bead: b, cols: cols, rows: rows,
      artW: artW, artH: artH, ox: (pw - artW) / 2, oy: (ph - artH) / 2
    };
  }

  function fmt(n, d) { return n.toFixed(d == null ? 1 : d); }
  function comma(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function updateCalc() {
    var d = dims();
    var total = d.cols * d.rows;
    var bags = Math.ceil(total / Math.max(1, +$('perBag').value || 200));
    $('calcInfo').textContent =
      '図案の実寸: ' + fmt(d.artW) + ' × ' + fmt(d.artH) + ' mm\n' +
      'マス数: ' + d.cols + ' × ' + d.rows + ' = ' + comma(total) + ' 粒\n' +
      '用紙: ' + fmt(d.paperW, 0) + ' × ' + fmt(d.paperH, 0) + ' mm' +
      '（実際の余白 左右 ' + fmt(d.ox) + ' / 上下 ' + fmt(d.oy) + ' mm）\n' +
      'ビーズ間隔 ' + d.bead + ' mm ／ 総粒数の目安 約 ' + bags + ' 袋分';
    var head = (S.idx ? comma(S.cols * S.rows) + '粒 / ' + S.palette.length + '色 ／ ' : '') +
      fmt(d.artW) + '×' + fmt(d.artH) + 'mm（' + d.cols + '×' + d.rows + 'マス, ' + d.bead + 'mm）';
    $('dimInfo').textContent = head;
  }

  /* ================= 画像読み込み ================= */

  function loadImageFile(file) {
    if (!file || !/^image\//.test(file.type)) { status('画像ファイルを選んでください'); return; }
    var fr = new FileReader();
    fr.onload = function () { setImage(fr.result, true); };
    fr.readAsDataURL(file);
  }

  function setImage(dataUrl, autoGen, quiet) {
    var img = new Image();
    img.onload = function () {
      S.img = img; S.srcUrl = dataUrl;
      var t = $('thumb'); t.src = dataUrl; t.hidden = false;
      if (!quiet) status('画像を読み込みました（' + img.naturalWidth + '×' + img.naturalHeight + 'px）');
      if (autoGen) generate();
    };
    img.onerror = function () { status('画像を読み込めませんでした'); };
    img.src = dataUrl;
  }

  /* ================= 図案生成 ================= */

  function generate() {
    if (!S.img) { status('先に画像を選んでください'); return; }
    status('図案を計算しています…');
    setTimeout(generateNow, 20);
  }

  function generateNow() {
    var d = dims();
    S.cols = d.cols; S.rows = d.rows; S.bead = d.bead;

    var rgb = Quantize.sampleGrid(S.img, d.cols, d.rows, {
      fit: $('fit').value,
      bg: $('bg').value,
      zoom: (+$('zoom').value || 100) / 100,
      offsetX: (+$('offX').value || 0) / 100,
      offsetY: (+$('offY').value || 0) / 100
    });
    Quantize.adjust(rgb, {
      brightness: +$('brightness').value,
      contrast: +$('contrast').value,
      saturation: +$('saturation').value,
      gamma: +$('gamma').value
    });

    var palette;
    if ($('stock').value === 'lock' && S.palette.length) {
      palette = S.palette.map(function (p) { return { code: p.code, name: p.name, hex: p.hex }; });
    } else {
      var k = Math.max(2, Math.min(60, +$('colors').value || 20));
      var clusters = Quantize.kmeans(Quantize.toLabArray(rgb), k, 16);
      palette = Quantize.snapToStock(clusters, DMC_COLORS);
    }

    var idx = Quantize.mapToPalette(rgb, d.cols, d.rows, palette, $('dither').checked);
    if ($('despeckle').checked) idx = Quantize.despeckle(idx, d.cols, d.rows).idx;

    /* 使われなかった色を捨てて、多い順に並べ替える */
    var counts = new Array(palette.length).fill(0);
    for (var i = 0; i < idx.length; i++) counts[idx[i]]++;
    var order = palette.map(function (p, i) { return { p: p, c: counts[i], i: i }; })
      .filter(function (o) { return o.c > 0; })
      .sort(function (a, b) { return b.c - a.c; });
    var remap = new Int16Array(palette.length);
    order.forEach(function (o, n) { remap[o.i] = n; });
    for (var j = 0; j < idx.length; j++) idx[j] = remap[idx[j]];

    S.palette = order.map(function (o) {
      return { code: o.p.code, name: o.p.name || '', hex: o.p.hex };
    });
    assignSymbols();
    S.idx = idx;
    S.sel = 0;
    S.edited = false;
    S.undo = [];
    recount();
    renderPalette();
    draw();
    updateCalc();
    status('図案を作成しました（' + S.palette.length + '色 / ' + comma(idx.length) + '粒）');
    autosave();
    if (!S.everGenerated && isNarrow()) showPanel('preview');
    if (!S.everGenerated || S.cols * S.cellPx > $('canvasWrap').clientWidth) fitZoom(true);
    S.everGenerated = true;
  }

  function assignSymbols() {
    S.palette.forEach(function (p, i) { p.symbol = SYMBOLS[i % SYMBOLS.length]; });
  }

  function recount() {
    S.counts = new Array(S.palette.length).fill(0);
    if (!S.idx) return;
    for (var i = 0; i < S.idx.length; i++) {
      var v = S.idx[i];
      if (v >= 0 && v < S.counts.length) S.counts[v]++;
    }
  }

  /* ================= プレビュー描画 ================= */

  function viewMode() { return $('viewMode').querySelector('.on').dataset.v; }
  function tool() { return $('tool').querySelector('.on').dataset.t; }

  function draw() {
    var cv = $('canvas');
    if (!S.idx) { cv.hidden = true; $('placeholder').hidden = false; return; }
    cv.hidden = false; $('placeholder').hidden = true;

    var cell = +$('viewZoom').value;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var maxPx = 6000;
    while (Math.max(S.cols, S.rows) * cell * dpr > maxPx && dpr > 1) dpr -= 0.25;
    while (Math.max(S.cols, S.rows) * cell > maxPx && cell > 3) cell--;
    S.cellPx = cell;
    cv.width = S.cols * cell * dpr;
    cv.height = S.rows * cell * dpr;
    cv.style.width = (S.cols * cell) + 'px';
    cv.style.height = (S.rows * cell) + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Render.drawGrid(ctx, {
      cols: S.cols, rows: S.rows, idx: S.idx, palette: S.palette,
      cell: cell, mode: viewMode(), shape: $('shape').value,
      showGrid: $('showGrid').checked, gridEvery: 10
    });
  }

  /* 図案全体が画面に収まる表示倍率にする */
  function fitZoom(silent) {
    if (!S.cols) return;
    var wrap = $('canvasWrap');
    var w = wrap.clientWidth - 34, h = wrap.clientHeight - 34;
    if (w < 40 || h < 40) return;
    var c = Math.floor(Math.min(w / S.cols, h / S.rows));
    c = Math.max(3, Math.min(28, c));
    $('viewZoom').value = c;
    draw();
    if (!silent) status('全体が見える倍率にしました（1マス ' + c + 'px）');
  }

  function canvasCell(ev) {
    var cv = $('canvas'), r = cv.getBoundingClientRect();
    var cell = S.cellPx || +$('viewZoom').value;
    var x = Math.floor((ev.clientX - r.left) / cell);
    var y = Math.floor((ev.clientY - r.top) / cell);
    if (x < 0 || y < 0 || x >= S.cols || y >= S.rows) return null;
    return { x: x, y: y, i: y * S.cols + x };
  }

  var painting = false, lastPointerType = 'mouse';

  function pickAt(c) {
    setSelected(S.idx[c.i]);
    var row = $('paletteList').children[S.sel];
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    status('スポイト: ' + S.palette[S.sel].code + ' を選択しました');
  }

  function onCanvasDown(ev) {
    lastPointerType = ev.pointerType || 'mouse';
    if (!S.idx) return;
    var c = canvasCell(ev); if (!c) return;
    /* 指のときは既定でスクロールを優先。塗るのは click（＝スクロールでないタップ）で行う */
    if (ev.pointerType === 'touch' && !$('touchPaint').checked) return;
    if (tool() === 'pick' || ev.altKey) { pickAt(c); return; }
    pushUndo();
    painting = true;
    try { $('canvas').setPointerCapture(ev.pointerId); } catch (e) { /* 無視 */ }
    paint(c);
    ev.preventDefault();
  }

  function onCanvasUp() {
    if (painting) { painting = false; recount(); renderPalette(); autosave(); }
  }

  /* スクロールにならなかったタップだけが click として届く */
  function onCanvasClick(ev) {
    if (!S.idx) return;
    if (lastPointerType !== 'touch' || $('touchPaint').checked) return;
    var c = canvasCell(ev); if (!c) return;
    if (tool() === 'pick') { pickAt(c); return; }
    pushUndo(); paint(c); autosave();
  }

  function onCanvasMove(ev) {
    if (!S.idx) return;
    if (ev.pointerType === 'touch' && !painting) return;
    var c = canvasCell(ev);
    if (c) {
      var p = S.palette[S.idx[c.i]];
      $('status').textContent = '列 ' + (c.x + 1) + ' / 行 ' + (c.y + 1) +
        '　現在: ' + (p ? p.symbol + ' ' + p.code : '-') +
        '　実寸位置 ' + fmt(c.x * S.bead) + ', ' + fmt(c.y * S.bead) + ' mm';
    }
    if (painting && c) paint(c);
  }
  function paint(c) {
    if (S.idx[c.i] === S.sel) return;
    S.idx[c.i] = S.sel;
    S.edited = true;
    draw();
    if (!painting) { recount(); renderPalette(); }
  }
  function pushUndo() {
    S.undo.push(Int16Array.from(S.idx));
    if (S.undo.length > 40) S.undo.shift();
  }

  /* ================= パレット UI ================= */

  function setSelected(i) {
    S.sel = i;
    var rows = $('paletteList').children;
    for (var k = 0; k < rows.length; k++) rows[k].classList.toggle('sel', k === i);
  }

  function renderPalette() {
    var list = $('paletteList');
    list.innerHTML = '';
    var total = S.idx ? S.idx.length : 0;
    S.palette.forEach(function (p, i) {
      var row = document.createElement('div');
      row.className = 'prow' + (i === S.sel ? ' sel' : '');
      row.tabIndex = 0;

      var sw = document.createElement('button');
      sw.type = 'button'; sw.className = 'sw'; sw.style.background = p.hex;
      sw.title = '色とカラーコードを変更';
      sw.addEventListener('click', function (e) { e.stopPropagation(); openModal(i); });

      var sym = document.createElement('div');
      sym.className = 'sym'; sym.textContent = p.symbol || '';

      var meta = document.createElement('div');
      meta.className = 'pmeta';
      var code = document.createElement('input');
      code.className = 'pcode'; code.value = p.code; code.title = 'カラーコードを直接入力できます';
      code.addEventListener('change', function () {
        p.code = code.value.trim() || p.code;
        var hit = findDmc(p.code);
        if (hit) { p.hex = hit.hex; p.name = hit.name; }
        renderPalette(); draw(); autosave();
      });
      var nm = document.createElement('div');
      nm.className = 'pname';
      nm.textContent = (p.name || '') + '  ' + p.hex;
      meta.appendChild(code); meta.appendChild(nm);

      var right = document.createElement('div');
      var cnt = document.createElement('div');
      cnt.className = 'pcount';
      var c = S.counts[i] || 0;
      cnt.textContent = comma(c) + '粒' + (total ? '  ' + (c * 100 / total).toFixed(1) + '%' : '');
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'pdel'; del.textContent = '✕'; del.title = 'この色を削除（近い色へ置換）';
      del.addEventListener('click', function (e) { e.stopPropagation(); removeColor(i); });
      right.appendChild(cnt); right.appendChild(del);
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '4px';

      row.appendChild(sw); row.appendChild(sym); row.appendChild(meta); row.appendChild(right);
      row.addEventListener('click', function () { setSelected(i); });
      list.appendChild(row);
    });
  }

  function findDmc(code) {
    var q = String(code).replace(/^dmc\s*/i, '').trim().toUpperCase();
    for (var i = 0; i < DMC_COLORS.length; i++) {
      if (DMC_COLORS[i].code.toUpperCase() === q) return DMC_COLORS[i];
    }
    return null;
  }

  function removeColor(i) {
    if (S.palette.length <= 2) { status('色は2色以上必要です'); return; }
    if (!confirm('「' + S.palette[i].code + '」を削除して、近い色に置き換えます。よろしいですか？')) return;
    pushUndo();
    var labs = S.palette.map(function (p) { return Color.hexToLab(p.hex); });
    var best = -1, bd = Infinity;
    S.palette.forEach(function (p, j) {
      if (j === i) return;
      var d = Color.labDist2(labs[i], labs[j]);
      if (d < bd) { bd = d; best = j; }
    });
    for (var k = 0; k < S.idx.length; k++) {
      if (S.idx[k] === i) S.idx[k] = best;
      if (S.idx[k] > i) S.idx[k]--;
    }
    S.palette.splice(i, 1);
    if (S.sel >= S.palette.length) S.sel = S.palette.length - 1;
    assignSymbols(); recount(); renderPalette(); draw(); autosave();
    status('1色削除しました（残り ' + S.palette.length + '色）');
  }

  function addColor() {
    S.palette.push({ code: 'NEW' + (S.palette.length + 1), name: 'custom', hex: '#888888' });
    assignSymbols(); recount(); renderPalette();
    openModal(S.palette.length - 1);
  }

  /* ================= 色選択モーダル ================= */

  function openModal(i) {
    S.editingIndex = i;
    var p = S.palette[i];
    $('modalTitle').textContent = '色 ' + (i + 1) + ' を編集';
    $('mCode').value = p.code;
    $('mHex').value = Color.normalizeHex(p.hex) || '#000000';
    $('mHexText').value = Color.normalizeHex(p.hex) || '#000000';
    $('mSearch').value = '';
    renderDmcList('');
    $('modal').hidden = false;
    $('mCode').focus();
  }

  function renderDmcList(query) {
    var box = $('dmcList');
    box.innerHTML = '';
    var q = query.trim().toUpperCase();
    var items = DMC_COLORS;
    if (q) {
      items = DMC_COLORS.filter(function (c) {
        return c.code.toUpperCase().indexOf(q) >= 0 || (c.name || '').toUpperCase().indexOf(q) >= 0;
      });
    } else if (S.editingIndex >= 0) {
      var lab = Color.hexToLab($('mHex').value);
      items = DMC_COLORS.slice().sort(function (a, b) {
        return Color.labDist2(lab, Color.hexToLab(a.hex)) - Color.labDist2(lab, Color.hexToLab(b.hex));
      }).slice(0, 80);
    }
    items.slice(0, 400).forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'dmc-item';
      el.innerHTML = '<i style="background:' + c.hex + '"></i><span>' + c.code + '</span>';
      el.title = c.code + ' ' + (c.name || '') + ' ' + c.hex;
      el.addEventListener('click', function () {
        $('mCode').value = c.code;
        $('mHex').value = c.hex;
        $('mHexText').value = c.hex;
        box.querySelectorAll('.dmc-item').forEach(function (n) { n.classList.remove('on'); });
        el.classList.add('on');
        el.dataset.name = c.name;
      });
      box.appendChild(el);
    });
    if (!items.length) box.innerHTML = '<p class="hint">該当する色がありません</p>';
  }

  function applyModal() {
    var i = S.editingIndex;
    if (i < 0 || !S.palette[i]) { closeModal(); return; }
    var hex = Color.normalizeHex($('mHexText').value) || Color.normalizeHex($('mHex').value);
    var code = $('mCode').value.trim() || S.palette[i].code;
    var hit = findDmc(code);
    S.palette[i].code = code;
    S.palette[i].hex = hex || S.palette[i].hex;
    S.palette[i].name = hit && hit.hex === S.palette[i].hex ? hit.name : (hit ? hit.name : 'custom');
    closeModal(); renderPalette(); draw(); autosave();
    status('色 ' + code + ' を更新しました');
  }

  function closeModal() { $('modal').hidden = true; S.editingIndex = -1; }

  /* ================= CSV ================= */

  function exportCsv() {
    var lines = ['code,hex,name,symbol,count'];
    S.palette.forEach(function (p, i) {
      lines.push([p.code, p.hex, '"' + (p.name || '').replace(/"/g, '""') + '"',
                  p.symbol, S.counts[i] || 0].join(','));
    });
    saveFile(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }),
      fileBase() + '_palette.csv');
  }

  function importCsv(text) {
    var rows = text.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    var out = [];
    rows.forEach(function (line, n) {
      var cells = line.split(',');
      if (n === 0 && /code/i.test(cells[0])) return;
      var code = (cells[0] || '').trim().replace(/^"|"$/g, '');
      if (!code) return;
      var hex = Color.normalizeHex((cells[1] || '').trim().replace(/^"|"$/g, ''));
      var hit = findDmc(code);
      if (!hex && hit) hex = hit.hex;
      if (!hex) return;
      out.push({ code: code, hex: hex, name: (cells[2] || (hit ? hit.name : '')).replace(/^"|"$/g, '').trim() });
    });
    if (out.length < 2) { status('CSVを読み取れませんでした（code,hex の2列以上が必要です）'); return; }
    S.palette = out;
    assignSymbols();
    if (S.idx && S.img) {
      $('stock').value = 'lock';
      generate();
    } else {
      recount(); renderPalette();
    }
    status('CSVから ' + out.length + '色を読み込みました');
  }

  /* ================= 書き出し ================= */

  function fileBase() {
    var t = ($('title').value || 'diamond-art').trim();
    return t.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'diamond-art';
  }

  /* 保存処理。claude.ai の Artifact として開かれているときは
     downloads capability を、それ以外は通常のダウンロードを使う。 */
  var downloadsCap = null;
  function saver() {
    if (!downloadsCap) {
      downloadsCap = (window.claude && typeof window.claude.use === 'function')
        ? window.claude.use('downloads').catch(function () { return null; })
        : Promise.resolve(null);
    }
    return downloadsCap;
  }

  function saveFile(blob, name) {
    return saver().then(function (dl) {
      if (dl) {
        return dl.save({ filename: name, data: blob }).then(function () {
          status(name + ' を保存しました');
        }, function (err) {
          var code = err && err.code;
          status(code === 'declined' ? '保存をキャンセルしました'
               : code === 'too_large' ? 'ファイルが大きすぎて保存できません'
               : '保存できませんでした（' + (code || 'error') + '）');
        });
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    });
  }

  function exportPng() {
    if (!S.idx) { status('先に図案を作ってください'); return; }
    var cv = Render.toCanvas({
      cols: S.cols, rows: S.rows, idx: S.idx, palette: S.palette,
      cell: 14, mode: viewMode(), shape: $('shape').value,
      showGrid: $('showGrid').checked, gridEvery: 10
    });
    cv.toBlob(function (b) { saveFile(b, fileBase() + '.png'); }, 'image/png');
  }

  /* 日本語などを含む文字列を画像化して PDF に貼るためのヘルパー */
  function textImage(text, pxHeight) {
    var pad = 6, fontPx = pxHeight;
    var cv = document.createElement('canvas');
    var ctx = cv.getContext('2d');
    ctx.font = '600 ' + fontPx + 'px "Hiragino Sans","Noto Sans JP","Yu Gothic UI",sans-serif';
    var w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    cv.width = Math.max(2, w); cv.height = Math.ceil(fontPx * 1.5);
    ctx = cv.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '600 ' + fontPx + 'px "Hiragino Sans","Noto Sans JP","Yu Gothic UI",sans-serif';
    ctx.fillStyle = '#111111'; ctx.textBaseline = 'middle';
    ctx.fillText(text, pad, cv.height / 2);
    return { url: cv.toDataURL('image/jpeg', 0.92), ratio: cv.width / cv.height };
  }

  function exportPdf() {
    if (!S.idx) { status('先に図案を作ってください'); return; }
    status('PDFを生成しています…');
    setTimeout(function () {
      try { buildPdf(); status('PDFを書き出しました'); }
      catch (e) { console.error(e); status('PDF生成でエラー: ' + e.message); }
    }, 30);
  }

  function buildPdf() {
    var d = dims();
    var doc = new MiniPDF.Doc();
    var title = ($('title').value || '').trim();
    var round = $('shape').value === 'round';
    var perBag = Math.max(1, +$('perBag').value || 200);

    /* ---- 1) 実寸チャート ---- */
    if ($('pdfActual').checked) {
      var pg = doc.addPage(d.paperW, d.paperH);
      pg.rect(0, 0, d.paperW, d.paperH, '#FFFFFF');
      var fill = $('pdfActualFill').checked;
      var syms = $('pdfActualSym').checked;
      var b = d.bead;
      var symSize = b * MiniPDF.MM * 0.60;

      if (fill) {
        for (var y = 0; y < S.rows; y++) {
          for (var x = 0; x < S.cols; x++) {
            var p = S.palette[S.idx[y * S.cols + x]];
            if (!p) continue;
            var cx = d.ox + x * b, cy = d.oy + y * b;
            var t = Color.tint(p.hex, 0.55);
            if (round) pg.circle(cx + b / 2, cy + b / 2, b * 0.46, t);
            else pg.rect(cx, cy, b, b, t);
          }
        }
      }
      /* 罫線 */
      for (var gx = 0; gx <= S.cols; gx++) {
        var major = gx % 10 === 0 || gx === S.cols;
        pg.line(d.ox + gx * b, d.oy, d.ox + gx * b, d.oy + d.artH,
          major ? '#8A939C' : '#D3D8DD', major ? 0.12 : 0.05);
      }
      for (var gy = 0; gy <= S.rows; gy++) {
        var majorY = gy % 10 === 0 || gy === S.rows;
        pg.line(d.ox, d.oy + gy * b, d.ox + d.artW, d.oy + gy * b,
          majorY ? '#8A939C' : '#D3D8DD', majorY ? 0.12 : 0.05);
      }
      if (syms) {
        for (var sy = 0; sy < S.rows; sy++) {
          for (var sx = 0; sx < S.cols; sx++) {
            var q = S.palette[S.idx[sy * S.cols + sx]];
            if (!q) continue;
            pg.glyph(q.symbol, d.ox + sx * b + b / 2, d.oy + sy * b + b / 2, symSize, '#232A31');
          }
        }
      }
      pg.rect(d.ox, d.oy, d.artW, d.artH, null, '#3A424A', 0.25);
      /* トンボ（余白がある場合のみ） */
      if (d.ox > 2.5 && d.oy > 2.5) {
        [[d.ox, d.oy], [d.ox + d.artW, d.oy], [d.ox, d.oy + d.artH], [d.ox + d.artW, d.oy + d.artH]]
          .forEach(function (c) {
            pg.line(c[0] - 2, c[1], c[0] - 0.6, c[1], '#000000', 0.12);
            pg.line(c[0] + 0.6, c[1], c[0] + 2, c[1], '#000000', 0.12);
            pg.line(c[0], c[1] - 2, c[0], c[1] - 0.6, '#000000', 0.12);
            pg.line(c[0], c[1] + 0.6, c[0], c[1] + 2, '#000000', 0.12);
          });
      }
      if (d.oy >= 3.2) {
        pg.text(fmt(d.artW) + ' x ' + fmt(d.artH) + ' mm  /  ' + S.cols + ' x ' + S.rows +
          ' = ' + comma(S.cols * S.rows) + ' beads  /  ' + d.bead + ' mm ' +
          (round ? 'round' : 'square') + '  /  print at 100%',
          d.paperW / 2, d.paperH - 1.2, 4.2, { align: 'center', color: '#8A939C' });
      }
    }

    /* ---- 2) 拡大チャート（A4） ---- */
    if ($('pdfBig').checked) {
      var cell = Math.max(3, +$('bigCell').value || 6);
      var PW = 210, PH = 297, M = 12, gut = 7, headH = 12;
      var capC = Math.max(1, Math.floor((PW - 2 * M - gut) / cell));
      var capR = Math.max(1, Math.floor((PH - 2 * M - gut - headH) / cell));
      var tx = Math.ceil(S.cols / capC), ty = Math.ceil(S.rows / capR);
      /* 端に細長いページが出ないよう、タイルを均等に割る */
      var cpp = Math.ceil(S.cols / tx), rpp = Math.ceil(S.rows / ty);
      var tImg = title ? textImage(title, 40) : null;
      var page = 0;
      for (var ti = 0; ti < ty; ti++) {
        for (var tj = 0; tj < tx; tj++) {
          page++;
          var c0 = tj * cpp, c1 = Math.min(S.cols, c0 + cpp);
          var r0 = ti * rpp, r1 = Math.min(S.rows, r0 + rpp);
          var bp = doc.addPage(PW, PH);
          bp.rect(0, 0, PW, PH, '#FFFFFF');
          if (tImg) bp.image(tImg.url, M, M - 6, 5 * tImg.ratio, 5);
          bp.text('Enlarged chart  ' + page + ' / ' + (tx * ty) +
            '   columns ' + (c0 + 1) + '-' + c1 + ' , rows ' + (r0 + 1) + '-' + r1 +
            '   (1 cell = ' + cell + ' mm on this sheet, actual bead ' + d.bead + ' mm)',
            M, M + 2, 8, { bold: true, color: '#232A31' });

          var gx0 = M + gut, gy0 = M + headH;
          var nc = c1 - c0, nr = r1 - r0;
          for (var yy = 0; yy < nr; yy++) {
            for (var xx = 0; xx < nc; xx++) {
              var pp = S.palette[S.idx[(r0 + yy) * S.cols + (c0 + xx)]];
              if (!pp) continue;
              var px = gx0 + xx * cell, py = gy0 + yy * cell;
              bp.rect(px, py, cell, cell, Color.tint(pp.hex, 0.5));
              bp.glyph(pp.symbol, px + cell / 2, py + cell / 2, cell * MiniPDF.MM * 0.5, '#1A1F25');
            }
          }
          for (var lx = 0; lx <= nc; lx++) {
            var mj = (c0 + lx) % 10 === 0 || lx === nc;
            bp.line(gx0 + lx * cell, gy0, gx0 + lx * cell, gy0 + nr * cell,
              mj ? '#39424C' : '#AEB6BE', mj ? 0.3 : 0.1);
            if ((c0 + lx) % 5 === 0 && lx < nc) {
              bp.text(String(c0 + lx + 1), gx0 + lx * cell + cell / 2, gy0 - 1.2, 5,
                { align: 'center', color: '#6B7580' });
            }
          }
          for (var ly = 0; ly <= nr; ly++) {
            var mjy = (r0 + ly) % 10 === 0 || ly === nr;
            bp.line(gx0, gy0 + ly * cell, gx0 + nc * cell, gy0 + ly * cell,
              mjy ? '#39424C' : '#AEB6BE', mjy ? 0.3 : 0.1);
            if ((r0 + ly) % 5 === 0 && ly < nr) {
              bp.text(String(r0 + ly + 1), gx0 - 1.2, gy0 + ly * cell + cell / 2, 5,
                { align: 'right', middle: true, color: '#6B7580' });
            }
          }
        }
      }
    }

    /* ---- 3) 色一覧 ---- */
    if ($('pdfLegend').checked) {
      var LW = 210, LH = 297, LM = 14;
      var rowsPerCol = 40, rowH = 5.4;
      var order = S.palette.map(function (p, i) { return { p: p, c: S.counts[i] || 0 }; })
        .sort(function (a, b) { return b.c - a.c; });
      var total = S.cols * S.rows;

      var prev = Render.toCanvas({
        cols: S.cols, rows: S.rows, idx: S.idx, palette: S.palette,
        cell: 6, mode: 'color', shape: $('shape').value, showGrid: false
      });
      var prevUrl = prev.toDataURL('image/jpeg', 0.9);
      var tImg2 = title ? textImage(title, 44) : null;

      var lp = doc.addPage(LW, LH);
      lp.rect(0, 0, LW, LH, '#FFFFFF');
      var y0 = LM;
      if (tImg2) { lp.image(tImg2.url, LM, y0, 7 * tImg2.ratio, 7); y0 += 9; }
      lp.text('Diamond painting - color list', LM, y0 + 3, 11, { bold: true });
      y0 += 6;

      var pw2 = 52, ph2 = 52 * (S.rows / S.cols);
      if (ph2 > 62) { ph2 = 62; pw2 = 62 * (S.cols / S.rows); }
      lp.image(prevUrl, LM, y0 + 2, pw2, ph2);
      lp.rect(LM, y0 + 2, pw2, ph2, null, '#AEB6BE', 0.2);

      var ix = LM + pw2 + 8, iy = y0 + 7;
      [
        'Finished size : ' + fmt(d.artW) + ' x ' + fmt(d.artH) + ' mm',
        'Paper size    : ' + fmt(d.paperW, 0) + ' x ' + fmt(d.paperH, 0) + ' mm',
        'Grid          : ' + S.cols + ' x ' + S.rows + ' cells',
        'Bead          : ' + d.bead + ' mm ' + (round ? 'round' : 'square'),
        'Total beads   : ' + comma(total),
        'Colors        : ' + S.palette.length,
        'Beads per bag : ' + perBag
      ].forEach(function (line, n) {
        lp.text(line, ix, iy + n * 5.2, 8.4, { color: '#232A31' });
      });

      var startY = y0 + ph2 + 10;
      var colW = (LW - 2 * LM - 8) / 2;
      var cursor = { page: lp, x: LM, y: startY, col: 0, n: 0 };

      function header(pg2, x, y) {
        var c = '#6B7580';
        pg2.text('sym', x + 9, y, 7.2, { bold: true, color: c, align: 'center' });
        pg2.text('code', x + 14.5, y, 7.2, { bold: true, color: c });
        pg2.text('beads', x + colW - 30, y, 7.2, { bold: true, color: c, align: 'right' });
        pg2.text('bags', x + colW - 12, y, 7.2, { bold: true, color: c, align: 'right' });
        pg2.text('hex', x + colW - 8, y, 7.2, { bold: true, color: c });
        pg2.line(x, y + 1.4, x + colW - 4, y + 1.4, '#AEB6BE', 0.15);
      }
      header(cursor.page, cursor.x, cursor.y);
      cursor.y += 4.6;

      order.forEach(function (o) {
        if (cursor.y + rowH > LH - LM) {
          if (cursor.col === 0) {
            cursor.col = 1;
            cursor.x = LM + colW + 8;
            cursor.y = startY;
          } else {
            cursor.page = doc.addPage(LW, LH);
            cursor.page.rect(0, 0, LW, LH, '#FFFFFF');
            cursor.col = 0; cursor.x = LM; cursor.y = LM + 4;
          }
          header(cursor.page, cursor.x, cursor.y);
          cursor.y += 4.6;
        }
        var pg3 = cursor.page, X = cursor.x, Y = cursor.y;
        pg3.rect(X, Y, 4.4, 4.4, o.p.hex, '#8A939C', 0.12);
        var mid = Y + 2.2;
        pg3.glyph(o.p.symbol, X + 9, mid, 8, '#1D2329');
        pg3.text(String(o.p.code), X + 14.5, mid, 8, { middle: true });
        pg3.text(comma(o.c), X + colW - 30, mid, 8, { align: 'right', middle: true });
        pg3.text(String(Math.ceil(o.c * 1.1 / perBag)), X + colW - 12, mid, 8,
          { align: 'right', middle: true });
        pg3.text(o.p.hex, X + colW - 8, mid, 6, { middle: true, color: '#9AA3AC' });
        cursor.y += rowH;
      });

      cursor.page.text('bags = ceil(beads x 1.1 / ' + perBag + ')  incl. 10% spare',
        LM, LH - LM + 4, 6.6, { color: '#9AA3AC' });
    }

    saveFile(doc.build(), fileBase() + '.pdf');
  }

  /* ================= 保存・復元 ================= */

  function projectData(includeImage) {
    return {
      v: 1,
      title: $('title').value,
      settings: collectSettings(),
      cols: S.cols, rows: S.rows, bead: S.bead,
      palette: S.palette,
      idx: S.idx ? Array.from(S.idx) : null,
      src: includeImage ? S.srcUrl : null
    };
  }

  var SETTING_IDS = ['fit', 'zoom', 'offX', 'offY', 'bg', 'preset', 'paperW', 'paperH',
    'margin', 'shape', 'beadPreset', 'bead', 'colors', 'stock', 'dither', 'despeckle',
    'brightness', 'contrast', 'saturation', 'gamma', 'title', 'pdfActual', 'pdfActualFill',
    'pdfActualSym', 'pdfBig', 'bigCell', 'pdfLegend', 'perBag', 'showGrid', 'viewZoom'];

  function collectSettings() {
    var o = {};
    SETTING_IDS.forEach(function (id) {
      var el = $(id); if (!el) return;
      o[id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return o;
  }

  function applySettings(o) {
    if (!o) return;
    SETTING_IDS.forEach(function (id) {
      if (!(id in o)) return;
      var el = $(id); if (!el) return;
      if (el.type === 'checkbox') el.checked = !!o[id]; else el.value = o[id];
    });
    syncOutputs();
    $('beadCustomRow').hidden = $('beadPreset').value !== 'custom';
  }

  function saveProject() {
    saveFile(new Blob([JSON.stringify(projectData(true))], { type: 'application/json' }),
      fileBase() + '.json');
    status('プロジェクトを保存しました');
  }

  function loadProject(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { status('ファイルを読み込めませんでした'); return; }
    applySettings(o.settings);
    S.palette = o.palette || [];
    S.cols = o.cols; S.rows = o.rows; S.bead = o.bead || beadSize();
    S.idx = o.idx ? Int16Array.from(o.idx) : null;
    S.edited = true;
    assignSymbols(); recount(); renderPalette(); updateCalc();
    if (o.src) setImage(o.src, false, true);
    draw();
    status('プロジェクトを読み込みました（' + S.palette.length + '色 / ' +
      comma(S.cols * S.rows) + '粒）');
  }

  function autosave() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(projectData(true)));
    } catch (e) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(projectData(false))); }
      catch (e2) { /* 容量オーバーは黙って諦める */ }
    }
  }

  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try { loadProject(raw); return true; } catch (e) { return false; }
  }

  /* ================= イベント ================= */

  function status(msg) { $('status').textContent = msg; }

  function isNarrow() { return window.matchMedia('(max-width:1180px)').matches; }

  function showPanel(name) {
    document.querySelectorAll('.layout > .panel').forEach(function (p) {
      p.classList.toggle('active', p.dataset.panel === name);
    });
    $('tabbar').querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.p === name);
    });
    if (name === 'preview') draw();
    window.scrollTo(0, 0);
  }

  function syncOutputs() {
    $('zoomOut').textContent = ((+$('zoom').value) / 100).toFixed(2) + '×';
    $('offXOut').textContent = $('offX').value;
    $('offYOut').textContent = $('offY').value;
    $('brightnessOut').textContent = $('brightness').value;
    $('contrastOut').textContent = $('contrast').value;
    $('saturationOut').textContent = $('saturation').value;
    $('gammaOut').textContent = $('gamma').value;
  }

  var regenTimer = null;
  function scheduleRegen() {
    updateCalc();
    if (!S.img) return;
    if (S.edited) { status('設定を変えました。手作業の修正を残したまま作り直す場合は「図案を作る」を押してください'); return; }
    clearTimeout(regenTimer);
    regenTimer = setTimeout(generate, 260);
  }

  function bind() {
    $('btnPick').addEventListener('click', function () { $('file').click(); });
    $('file').addEventListener('change', function (e) { loadImageFile(e.target.files[0]); });

    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]);
    });

    $('preset').addEventListener('change', function () {
      var v = $('preset').value;
      if (v !== 'custom') {
        var m = v.split('x');
        $('paperW').value = m[0]; $('paperH').value = m[1];
      }
      scheduleRegen();
    });
    $('beadPreset').addEventListener('change', function () {
      $('beadCustomRow').hidden = $('beadPreset').value !== 'custom';
      if ($('beadPreset').value !== 'custom') $('bead').value = $('beadPreset').value;
      if ($('beadPreset').value === '2.8') $('shape').value = 'round';
      if ($('beadPreset').value === '2.5') $('shape').value = 'square';
      scheduleRegen();
    });

    ['paperW', 'paperH', 'margin', 'bead', 'colors', 'stock', 'fit', 'bg',
     'dither', 'despeckle', 'zoom', 'offX', 'offY',
     'brightness', 'contrast', 'saturation', 'gamma'].forEach(function (id) {
      $(id).addEventListener('input', function () { syncOutputs(); scheduleRegen(); });
      $(id).addEventListener('change', function () { syncOutputs(); scheduleRegen(); });
    });
    $('perBag').addEventListener('input', updateCalc);
    $('shape').addEventListener('change', function () { draw(); updateCalc(); });

    $('btnGenerate').addEventListener('click', generate);

    $('viewMode').addEventListener('click', function (e) {
      if (e.target.tagName !== 'BUTTON') return;
      this.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
      e.target.classList.add('on'); draw();
    });
    $('tool').addEventListener('click', function (e) {
      if (e.target.tagName !== 'BUTTON') return;
      this.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
      e.target.classList.add('on');
    });
    $('showGrid').addEventListener('change', draw);
    $('btnFit').addEventListener('click', function () { fitZoom(false); });
    $('viewZoom').addEventListener('input', draw);
    $('btnUndo').addEventListener('click', function () {
      if (!S.undo.length) { status('元に戻せる操作がありません'); return; }
      S.idx = S.undo.pop();
      recount(); renderPalette(); draw(); autosave();
      status('元に戻しました');
    });

    var cv = $('canvas');
    cv.addEventListener('pointerdown', onCanvasDown);
    cv.addEventListener('click', onCanvasClick);
    window.addEventListener('pointermove', onCanvasMove);
    window.addEventListener('pointerup', onCanvasUp);
    window.addEventListener('pointercancel', onCanvasUp);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    $('touchPaint').addEventListener('change', function () {
      cv.classList.toggle('touch-paint', this.checked);
      status(this.checked ? '指でなぞって塗るモードです（キャンバス上ではスクロールしません）'
                          : 'タップで1粒ずつ塗ります。キャンバス上を指で動かすとスクロールします');
    });

    $('tabbar').addEventListener('click', function (e) {
      if (e.target.tagName === 'BUTTON') showPanel(e.target.dataset.p);
    });

    $('btnAdd').addEventListener('click', addColor);
    $('btnCsvOut').addEventListener('click', exportCsv);
    $('btnCsvIn').addEventListener('click', function () { $('csvFile').click(); });
    $('csvFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { importCsv(String(fr.result)); };
      fr.readAsText(f);
      e.target.value = '';
    });

    $('modalClose').addEventListener('click', closeModal);
    $('mApply').addEventListener('click', applyModal);
    $('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    $('mHex').addEventListener('input', function () { $('mHexText').value = $('mHex').value.toUpperCase(); });
    $('mHexText').addEventListener('change', function () {
      var h = Color.normalizeHex($('mHexText').value);
      if (h) { $('mHex').value = h; $('mHexText').value = h; }
    });
    $('mCode').addEventListener('change', function () {
      var hit = findDmc($('mCode').value);
      if (hit) { $('mHex').value = hit.hex; $('mHexText').value = hit.hex; }
    });
    $('mSearch').addEventListener('input', function () { renderDmcList(this.value); });

    $('btnPng').addEventListener('click', exportPng);
    $('btnPdf').addEventListener('click', exportPdf);
    $('btnSave').addEventListener('click', saveProject);
    $('btnLoad').addEventListener('click', function () { $('projFile').click(); });
    $('projFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { loadProject(String(fr.result)); };
      fr.readAsText(f);
      e.target.value = '';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('modal').hidden) closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && S.undo.length) {
        e.preventDefault(); $('btnUndo').click();
      }
    });
    window.addEventListener('beforeunload', autosave);
  }

  if (navigator.maxTouchPoints > 0 || window.matchMedia('(hover:none)').matches) {
    document.body.classList.add('is-touch');
  }
  bind();
  syncOutputs();
  updateCalc();
  if (!restore()) status('画像を選んで「図案を作る」を押してください');
})();
