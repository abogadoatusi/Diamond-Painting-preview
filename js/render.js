/* ビーズ格子を canvas に描画する（プレビュー / PNG 書き出し / PDF用サムネイル共通） */
var Render = (function () {

  function drawGrid(ctx, o) {
    var cols = o.cols, rows = o.rows, idx = o.idx, pal = o.palette;
    var cs = o.cell, ox = o.ox || 0, oy = o.oy || 0;
    var mode = o.mode || 'color';        // color | symbol | both
    var shape = o.shape || 'square';     // square | round
    var showSym = (mode === 'symbol' || mode === 'both') && cs >= 7;

    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(ox, oy, cols * cs, rows * cs);

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var p = pal[idx[y * cols + x]];
        if (!p) continue;
        var px = ox + x * cs, py = oy + y * cs;
        ctx.fillStyle = (mode === 'symbol') ? Color.tint(p.hex, 0.72) : p.hex;
        if (shape === 'round' && cs >= 4 && mode !== 'symbol') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(px, py, cs, cs);
          ctx.fillStyle = p.hex;
          ctx.beginPath();
          ctx.arc(px + cs / 2, py + cs / 2, cs * 0.46, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(px, py, cs, cs);
        }
      }
    }

    if (showSym) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = Math.round(cs * 0.68) + 'px "DejaVu Sans Mono", Menlo, Consolas, monospace';
      for (var yy = 0; yy < rows; yy++) {
        for (var xx = 0; xx < cols; xx++) {
          var q = pal[idx[yy * cols + xx]];
          if (!q) continue;
          ctx.fillStyle = (mode === 'symbol') ? '#222222' : Color.readableInk(q.hex);
          ctx.fillText(q.symbol || '?', ox + xx * cs + cs / 2, oy + yy * cs + cs * 0.54);
        }
      }
    }

    if (o.showGrid && cs >= 3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 0; gx <= cols; gx++) {
        ctx.moveTo(Math.round(ox + gx * cs) + 0.5, oy);
        ctx.lineTo(Math.round(ox + gx * cs) + 0.5, oy + rows * cs);
      }
      for (var gy = 0; gy <= rows; gy++) {
        ctx.moveTo(ox, Math.round(oy + gy * cs) + 0.5);
        ctx.lineTo(ox + cols * cs, Math.round(oy + gy * cs) + 0.5);
      }
      ctx.stroke();

      var every = o.gridEvery || 10;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var bx = 0; bx <= cols; bx += every) {
        ctx.moveTo(Math.round(ox + bx * cs) + 0.5, oy);
        ctx.lineTo(Math.round(ox + bx * cs) + 0.5, oy + rows * cs);
      }
      for (var by = 0; by <= rows; by += every) {
        ctx.moveTo(ox, Math.round(oy + by * cs) + 0.5);
        ctx.lineTo(ox + cols * cs, Math.round(oy + by * cs) + 0.5);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 書き出し用に丸ごと1枚の canvas を作る */
  function toCanvas(o) {
    var cv = document.createElement('canvas');
    cv.width = o.cols * o.cell;
    cv.height = o.rows * o.cell;
    var ctx = cv.getContext('2d');
    drawGrid(ctx, Object.assign({}, o, { ox: 0, oy: 0 }));
    return cv;
  }

  return { drawGrid: drawGrid, toCanvas: toCanvas };
})();
