/* 画像 -> ビーズ格子 への変換（サンプリング / 減色 / パレット割当） */
var Quantize = (function () {

  /* 画像を cols x rows の格子にサンプリングして RGB 配列を返す。
     fit: 'cover'（はみ出しトリミング）/ 'contain'（全体を収めて余白は bg 色） */
  function sampleGrid(img, cols, rows, opts) {
    opts = opts || {};
    var fit = opts.fit || 'cover';
    var bg = opts.bg || '#FFFFFF';
    var cv = document.createElement('canvas');
    cv.width = cols; cv.height = rows;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cols, rows);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var scale = (fit === 'contain')
      ? Math.min(cols / iw, rows / ih)
      : Math.max(cols / iw, rows / ih);
    scale *= (opts.zoom || 1);
    var dw = iw * scale, dh = ih * scale;
    var dx = (cols - dw) / 2 + (opts.offsetX || 0) * cols;
    var dy = (rows - dh) / 2 + (opts.offsetY || 0) * rows;

    /* 縮小率が大きいときは段階的に縮めてモアレを防ぐ */
    var src = img;
    if (dw < iw / 2) {
      var tw = iw, th = ih, tmp = null;
      var cur = document.createElement('canvas');
      cur.width = iw; cur.height = ih;
      cur.getContext('2d').drawImage(img, 0, 0);
      while (tw / 2 > dw) {
        tw = Math.max(1, Math.round(tw / 2));
        th = Math.max(1, Math.round(th / 2));
        tmp = document.createElement('canvas');
        tmp.width = tw; tmp.height = th;
        var tc = tmp.getContext('2d');
        tc.imageSmoothingQuality = 'high';
        tc.drawImage(cur, 0, 0, tw, th);
        cur = tmp;
      }
      src = cur;
    }
    ctx.drawImage(src, dx, dy, dw, dh);

    var data = ctx.getImageData(0, 0, cols, rows).data;
    var out = new Float32Array(cols * rows * 3);
    var bgRgb = Color.hexToRgb(bg) || [255, 255, 255];
    for (var i = 0, n = cols * rows; i < n; i++) {
      var a = data[i * 4 + 3] / 255;
      out[i * 3]     = data[i * 4]     * a + bgRgb[0] * (1 - a);
      out[i * 3 + 1] = data[i * 4 + 1] * a + bgRgb[1] * (1 - a);
      out[i * 3 + 2] = data[i * 4 + 2] * a + bgRgb[2] * (1 - a);
    }
    return out;
  }

  /* 明るさ / コントラスト / 彩度 / ガンマ の調整（-100..100, 0..200, 50..150） */
  function adjust(rgb, o) {
    var br = (o.brightness || 0) * 2.55;
    var ct = (o.contrast || 0) / 100;
    var cf = (1 + ct) * (ct > 0 ? (1 + ct) : 1);
    var sat = (o.saturation == null ? 100 : o.saturation) / 100;
    var gamma = (o.gamma == null ? 100 : o.gamma) / 100;
    for (var i = 0; i < rgb.length; i += 3) {
      var r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
      r += br; g += br; b += br;
      r = (r - 128) * cf + 128; g = (g - 128) * cf + 128; b = (b - 128) * cf + 128;
      var y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat;
      if (gamma !== 1) {
        r = 255 * Math.pow(Math.max(0, r) / 255, 1 / gamma);
        g = 255 * Math.pow(Math.max(0, g) / 255, 1 / gamma);
        b = 255 * Math.pow(Math.max(0, b) / 255, 1 / gamma);
      }
      rgb[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
      rgb[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      rgb[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    return rgb;
  }

  function toLabArray(rgb) {
    var n = rgb.length / 3, lab = new Float32Array(rgb.length);
    for (var i = 0; i < n; i++) {
      var l = Color.rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
      lab[i * 3] = l[0]; lab[i * 3 + 1] = l[1]; lab[i * 3 + 2] = l[2];
    }
    return lab;
  }

  /* k-means++（Lab 空間）でクラスタ中心を求める */
  function kmeans(lab, k, iterations) {
    var n = lab.length / 3;
    k = Math.min(k, n);
    var centers = new Float32Array(k * 3);
    var d2 = new Float32Array(n);
    var rnd = mulberry32(20240501);

    var first = Math.floor(rnd() * n);
    centers[0] = lab[first * 3]; centers[1] = lab[first * 3 + 1]; centers[2] = lab[first * 3 + 2];
    for (var i = 0; i < n; i++) d2[i] = dist2(lab, i, centers, 0);

    for (var c = 1; c < k; c++) {
      var sum = 0, j;
      for (j = 0; j < n; j++) sum += d2[j];
      var target = rnd() * sum, acc = 0, pick = n - 1;
      for (j = 0; j < n; j++) { acc += d2[j]; if (acc >= target) { pick = j; break; } }
      centers[c * 3] = lab[pick * 3];
      centers[c * 3 + 1] = lab[pick * 3 + 1];
      centers[c * 3 + 2] = lab[pick * 3 + 2];
      for (j = 0; j < n; j++) {
        var dd = dist2(lab, j, centers, c);
        if (dd < d2[j]) d2[j] = dd;
      }
    }

    var assign = new Int32Array(n);
    var sums = new Float64Array(k * 3), counts = new Int32Array(k);
    for (var it = 0; it < (iterations || 14); it++) {
      sums.fill(0); counts.fill(0);
      for (var p = 0; p < n; p++) {
        var best = 0, bd = Infinity;
        for (var q = 0; q < k; q++) {
          var d = dist2(lab, p, centers, q);
          if (d < bd) { bd = d; best = q; }
        }
        assign[p] = best;
        counts[best]++;
        sums[best * 3] += lab[p * 3];
        sums[best * 3 + 1] += lab[p * 3 + 1];
        sums[best * 3 + 2] += lab[p * 3 + 2];
      }
      for (var m = 0; m < k; m++) {
        if (!counts[m]) continue;
        centers[m * 3] = sums[m * 3] / counts[m];
        centers[m * 3 + 1] = sums[m * 3 + 1] / counts[m];
        centers[m * 3 + 2] = sums[m * 3 + 2] / counts[m];
      }
    }
    var res = [];
    for (var z = 0; z < k; z++) {
      res.push({ lab: [centers[z * 3], centers[z * 3 + 1], centers[z * 3 + 2]], count: counts[z] });
    }
    return res.filter(function (r) { return r.count > 0; })
              .sort(function (a, b) { return b.count - a.count; });
  }

  function dist2(arr, i, centers, c) {
    var dl = arr[i * 3] - centers[c * 3];
    var da = arr[i * 3 + 1] - centers[c * 3 + 1];
    var db = arr[i * 3 + 2] - centers[c * 3 + 2];
    return dl * dl * 1.2 + da * da + db * db;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* クラスタ中心を「使える色（DMC等）」に重複なくスナップする */
  function snapToStock(clusters, stock) {
    var stockLab = stock.map(function (s) { return Color.hexToLab(s.hex); });
    var used = {}, picked = [];
    clusters.forEach(function (cl) {
      var best = -1, bd = Infinity;
      for (var i = 0; i < stock.length; i++) {
        if (used[i]) continue;
        var d = Color.labDist2(cl.lab, stockLab[i]);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) {
        used[best] = true;
        picked.push({ code: stock[best].code, name: stock[best].name, hex: stock[best].hex });
      }
    });
    return picked;
  }

  /* パレットへの割当。dither=true で Floyd–Steinberg 誤差拡散 */
  function mapToPalette(rgb, cols, rows, palette, dither, strength) {
    var pLab = palette.map(function (p) { return Color.hexToLab(p.hex); });
    var work = dither ? Float32Array.from(rgb) : rgb;
    var idx = new Int16Array(cols * rows);
    var k = (strength == null ? 0.85 : strength);

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var lab = Color.rgbToLab(work[i * 3], work[i * 3 + 1], work[i * 3 + 2]);
        var best = 0, bd = Infinity;
        for (var p = 0; p < pLab.length; p++) {
          var d = Color.labDist2(lab, pLab[p]);
          if (d < bd) { bd = d; best = p; }
        }
        idx[i] = best;
        if (dither) {
          var pr = Color.hexToRgb(palette[best].hex);
          var er = (work[i * 3] - pr[0]) * k;
          var eg = (work[i * 3 + 1] - pr[1]) * k;
          var eb = (work[i * 3 + 2] - pr[2]) * k;
          spread(work, cols, rows, x + 1, y,     er, eg, eb, 7 / 16);
          spread(work, cols, rows, x - 1, y + 1, er, eg, eb, 3 / 16);
          spread(work, cols, rows, x,     y + 1, er, eg, eb, 5 / 16);
          spread(work, cols, rows, x + 1, y + 1, er, eg, eb, 1 / 16);
        }
      }
    }
    return idx;
  }

  function spread(work, cols, rows, x, y, er, eg, eb, f) {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    var i = (y * cols + x) * 3;
    work[i] += er * f; work[i + 1] += eg * f; work[i + 2] += eb * f;
  }

  /* 孤立した1粒（周囲8マスに同色なし）を周囲の最頻色へ吸収する */
  function despeckle(idx, cols, rows) {
    var out = Int16Array.from(idx), changed = 0;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x, v = idx[i], same = 0, tally = {};
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            var nv = idx[ny * cols + nx];
            if (nv === v) same++;
            tally[nv] = (tally[nv] || 0) + 1;
          }
        }
        if (same === 0) {
          var bestV = v, bestC = -1;
          for (var key in tally) if (tally[key] > bestC) { bestC = tally[key]; bestV = +key; }
          out[i] = bestV; changed++;
        }
      }
    }
    return { idx: out, changed: changed };
  }

  return {
    sampleGrid: sampleGrid, adjust: adjust, toLabArray: toLabArray,
    kmeans: kmeans, snapToStock: snapToStock, mapToPalette: mapToPalette,
    despeckle: despeckle
  };
})();
