/* 依存ライブラリなしの最小 PDF ライター。
 * ・単位は mm、原点は「ページ左上」（画面座標と同じ向き）
 * ・フォントは標準14書体の Helvetica / Helvetica-Bold（埋め込み不要・ASCII のみ）
 * ・日本語は canvas で画像化してから image() で貼る */
var MiniPDF = (function () {
  var MM = 72 / 25.4;

  var W = {' ':278,'!':278,'"':355,'#':556,'$':556,'%':889,'&':667,"'":191,'(':333,')':333,
    '*':389,'+':584,',':278,'-':333,'.':278,'/':278,'0':556,'1':556,'2':556,'3':556,'4':556,
    '5':556,'6':556,'7':556,'8':556,'9':556,':':278,';':278,'<':584,'=':584,'>':584,'?':556,
    '@':1015,'A':667,'B':667,'C':722,'D':722,'E':667,'F':611,'G':778,'H':722,'I':278,'J':500,
    'K':667,'L':556,'M':833,'N':722,'O':778,'P':667,'Q':778,'R':722,'S':667,'T':611,'U':722,
    'V':667,'W':944,'X':667,'Y':667,'Z':611,'[':278,'\\':278,']':278,'^':469,'_':556,'`':333,
    'a':556,'b':556,'c':500,'d':556,'e':556,'f':278,'g':556,'h':556,'i':222,'j':222,'k':500,
    'l':222,'m':833,'n':556,'o':556,'p':556,'q':556,'r':333,'s':500,'t':278,'u':556,'v':500,
    'w':722,'x':500,'y':500,'z':500,'{':334,'|':260,'}':334,'~':584};

  function ascii(s) {
    return String(s).replace(/[^\x20-\x7E]/g, function (c) { return c === '×' ? 'x' : '?'; });
  }
  function textWidth(s, size, bold) {
    s = ascii(s);
    var w = 0;
    for (var i = 0; i < s.length; i++) w += (W[s[i]] || 556);
    return w / 1000 * size * (bold ? 1.03 : 1);
  }
  function esc(s) { return ascii(s).replace(/([\\()])/g, '\\$1'); }
  function num(v) { return (Math.round(v * 1000) / 1000).toString(); }
  function rgbOf(hex) {
    var c = Color.hexToRgb(hex) || [0, 0, 0];
    return num(c[0] / 255) + ' ' + num(c[1] / 255) + ' ' + num(c[2] / 255);
  }

  function Page(doc, wmm, hmm) {
    this.doc = doc; this.w = wmm; this.h = hmm; this.ops = []; this.images = [];
  }
  Page.prototype.X = function (x) { return num(x * MM); };
  Page.prototype.Y = function (y) { return num((this.h - y) * MM); };

  Page.prototype.rect = function (x, y, w, h, fill, stroke, lw) {
    var s = '';
    if (fill) s += rgbOf(fill) + ' rg ';
    if (stroke) s += rgbOf(stroke) + ' RG ' + num((lw || 0.2) * MM) + ' w ';
    s += this.X(x) + ' ' + this.Y(y + h) + ' ' + num(w * MM) + ' ' + num(h * MM) + ' re ';
    s += fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.ops.push(s);
    return this;
  };

  Page.prototype.line = function (x1, y1, x2, y2, color, lw) {
    this.ops.push(rgbOf(color || '#000') + ' RG ' + num((lw || 0.2) * MM) + ' w ' +
      this.X(x1) + ' ' + this.Y(y1) + ' m ' + this.X(x2) + ' ' + this.Y(y2) + ' l S');
    return this;
  };

  Page.prototype.circle = function (cx, cy, r, fill, stroke, lw) {
    var k = 0.5523 * r;
    var p = [];
    function pt(x, y) { return num(x * MM) + ' ' + num(y * MM); }
    var Y = this.h;
    function fy(y) { return Y - y; }
    p.push(pt(cx, fy(cy - r)) + ' m');
    p.push(pt(cx + k, fy(cy - r)) + ' ' + pt(cx + r, fy(cy - k)) + ' ' + pt(cx + r, fy(cy)) + ' c');
    p.push(pt(cx + r, fy(cy + k)) + ' ' + pt(cx + k, fy(cy + r)) + ' ' + pt(cx, fy(cy + r)) + ' c');
    p.push(pt(cx - k, fy(cy + r)) + ' ' + pt(cx - r, fy(cy + k)) + ' ' + pt(cx - r, fy(cy)) + ' c');
    p.push(pt(cx - r, fy(cy - k)) + ' ' + pt(cx - k, fy(cy - r)) + ' ' + pt(cx, fy(cy - r)) + ' c');
    var s = '';
    if (fill) s += rgbOf(fill) + ' rg ';
    if (stroke) s += rgbOf(stroke) + ' RG ' + num((lw || 0.2) * MM) + ' w ';
    s += p.join(' ') + ' ' + (fill && stroke ? 'B' : fill ? 'f' : 'S');
    this.ops.push(s);
    return this;
  };

  /* y はベースライン位置(mm)。align: left|center|right */
  Page.prototype.text = function (str, x, y, size, opt) {
    opt = opt || {};
    var bold = !!opt.bold;
    var w = textWidth(str, size, bold);
    var tx = x;
    if (opt.align === 'center') tx = x - w / 2;
    else if (opt.align === 'right') tx = x - w;
    this.ops.push('BT ' + rgbOf(opt.color || '#000') + ' rg /' + (bold ? 'F2' : 'F1') + ' ' +
      num(size) + ' Tf ' + num(tx * MM) + ' ' + this.Y(y) + ' Td (' + esc(str) + ') Tj ET');
    return this;
  };

  /* 中央そろえで「セル内」に収める記号描画 */
  Page.prototype.glyph = function (ch, cx, cy, size, color) {
    this.text(ch, cx, cy + size * 0.36 / MM, size, { align: 'center', color: color });
    return this;
  };

  /* JPEG の dataURL を貼る */
  Page.prototype.image = function (dataUrl, x, y, w, h) {
    var id = this.doc._addImage(dataUrl);
    this.images.push(id);
    this.ops.push('q ' + num(w * MM) + ' 0 0 ' + num(h * MM) + ' ' +
      this.X(x) + ' ' + this.Y(y + h) + ' cm /Im' + id + ' Do Q');
    return this;
  };

  function Doc() { this.pages = []; this.imgs = []; }

  Doc.prototype.addPage = function (wmm, hmm) {
    var p = new Page(this, wmm, hmm);
    this.pages.push(p);
    return p;
  };

  Doc.prototype._addImage = function (dataUrl) {
    for (var i = 0; i < this.imgs.length; i++) if (this.imgs[i].url === dataUrl) return i;
    var comma = dataUrl.indexOf(',');
    var bin = atob(dataUrl.slice(comma + 1));
    var dim = jpegSize(bin);
    this.imgs.push({ url: dataUrl, bin: bin, w: dim[0], h: dim[1] });
    return this.imgs.length - 1;
  };

  function jpegSize(bin) {
    var i = 2;
    while (i < bin.length) {
      if (bin.charCodeAt(i) !== 0xFF) { i++; continue; }
      var marker = bin.charCodeAt(i + 1);
      var len = (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3);
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return [(bin.charCodeAt(i + 7) << 8) | bin.charCodeAt(i + 8),
                (bin.charCodeAt(i + 5) << 8) | bin.charCodeAt(i + 6)];
      }
      i += 2 + len;
    }
    return [1, 1];
  }

  Doc.prototype.build = function () {
    var objs = [];                      // 1-origin
    function put(body) { objs.push(body); return objs.length; }

    var catalogId = put('');            // 1
    var pagesId = put('');              // 2
    var f1 = put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var f2 = put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    var imgIds = this.imgs.map(function (im) {
      return put('<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        im.bin.length + ' >>\nstream\n' + im.bin + '\nendstream');
    });

    var kids = [];
    this.pages.forEach(function (p) {
      var content = p.ops.join('\n');
      var cid = put('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      var xo = p.images.length
        ? ' /XObject << ' + p.images.map(function (i) { return '/Im' + i + ' ' + imgIds[i] + ' 0 R'; }).join(' ') + ' >>'
        : '';
      var pid = put('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' +
        num(p.w * MM) + ' ' + num(p.h * MM) + '] /Resources << /Font << /F1 ' + f1 +
        ' 0 R /F2 ' + f2 + ' 0 R >>' + xo + ' >> /Contents ' + cid + ' 0 R >>');
      kids.push(pid);
    });

    objs[catalogId - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
    objs[pagesId - 1] = '<< /Type /Pages /Count ' + kids.length + ' /Kids [' +
      kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] >>';

    var out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    var offsets = [];
    objs.forEach(function (body, i) {
      offsets.push(out.length);
      out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) {
      out += ('0000000000' + o).slice(-10) + ' 00000 n \n';
    });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalogId + ' 0 R >>\n' +
           'startxref\n' + xref + '\n%%EOF\n';

    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
    return new Blob([bytes], { type: 'application/pdf' });
  };

  Doc.prototype.save = function (filename) {
    var url = URL.createObjectURL(this.build());
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };

  return { Doc: Doc, textWidth: textWidth, MM: MM };
})();
