/* 記号を「マスの中心」に正確に置くための、字形ごとの中心オフセット。
 *
 * canvas の textAlign='center' は字送り幅の中央、textBaseline='middle' は
 * フォントの em ボックスの中央を基準にするため、実際に描かれる字形
 * （インク）の中心とはズレる。大文字は上寄り、g や y は下寄り、* は大きく
 * 上寄りになる。ここでは字形のバウンディングボックスを実測して、
 * em 単位の補正値として返す。 */
var Glyph = (function () {
  var REF = 100;      // 測定用のフォントサイズ（結果は em 単位なので寸法に依存しない）
  var cache = {};
  var ctx = null;

  function context() {
    if (!ctx) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 8;
      ctx = cv.getContext('2d');
    }
    return ctx;
  }

  /* 戻り値 {kx, ky}（em単位）。
     textAlign='left' / textBaseline='alphabetic' として
       x = cx - kx * fontSize
       y = cy + ky * fontSize
     に描くと、字形の中心が (cx, cy) に一致する。 */
  function center(ch, family) {
    var key = family + ' ' + ch;
    if (cache[key]) return cache[key];

    var c = context();
    c.font = REF + 'px ' + family;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';

    var m = c.measureText(ch);
    var L = m.actualBoundingBoxLeft, R = m.actualBoundingBoxRight;
    var A = m.actualBoundingBoxAscent, D = m.actualBoundingBoxDescent;
    var k;
    if (typeof A === 'number' && typeof R === 'number' && (A + D) > 0) {
      k = { kx: (R - L) / 2 / REF, ky: (A - D) / 2 / REF };
    } else {
      /* 実測できない環境向け: 字送り幅の中央と、大文字の高さの半分で代用 */
      k = { kx: (m.width || REF * 0.5) / 2 / REF, ky: 0.358 };
    }
    cache[key] = k;
    return k;
  }

  return { center: center };
})();
