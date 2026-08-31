/* 色変換ユーティリティ（sRGB <-> CIE Lab、色差 CIE76） */
var Color = (function () {
  function hexToRgb(hex) {
    var h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    function p(v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }
    return '#' + (p(r) + p(g) + p(b)).toUpperCase();
  }

  function normalizeHex(hex) {
    var rgb = hexToRgb(hex);
    return rgb ? rgbToHex(rgb[0], rgb[1], rgb[2]) : null;
  }

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function rgbToLab(r, g, b) {
    var R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    var x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
    var y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750);
    var z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
    function f(t) { return t > 0.008856451679 ? Math.cbrt(t) : (7.787037 * t + 16 / 116); }
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function hexToLab(hex) {
    var rgb = hexToRgb(hex) || [0, 0, 0];
    return rgbToLab(rgb[0], rgb[1], rgb[2]);
  }

  /* 明度重みを少し上げた CIE76 距離（平方） */
  function labDist2(a, b) {
    var dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return dl * dl * 1.2 + da * da + db * db;
  }

  /* 記号やテキストを載せるときの読みやすい前景色 */
  function readableInk(hex) {
    var rgb = hexToRgb(hex) || [255, 255, 255];
    var l = 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
    return l > 0.42 ? '#101010' : '#FFFFFF';
  }

  /* 白側に混ぜて薄くする（実寸チャートの下地用） */
  function tint(hex, ratio) {
    var rgb = hexToRgb(hex) || [255, 255, 255];
    return rgbToHex(
      rgb[0] + (255 - rgb[0]) * ratio,
      rgb[1] + (255 - rgb[1]) * ratio,
      rgb[2] + (255 - rgb[2]) * ratio
    );
  }

  return {
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, normalizeHex: normalizeHex,
    rgbToLab: rgbToLab, hexToLab: hexToLab, labDist2: labDist2,
    readableInk: readableInk, tint: tint
  };
})();
