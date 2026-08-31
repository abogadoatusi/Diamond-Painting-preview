/* index.html と CSS/JS を1枚の HTML にまとめる（claude.ai の Artifact 用）。
 * 使い方: node build.js  ->  dist/index.html
 * Artifact は <!doctype>〜<body> を自前で付けるので、ここでは
 * <title> / <style> / 本文 / <script> だけを出力する。 */
var fs = require('fs');
var path = require('path');

var html = fs.readFileSync('index.html', 'utf8');

/* Artifact のギャラリーでは説明句のない「名前」を使う */
var title = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'ダイヤモンドアート図案メーカー')
  .replace(/（[^）]*）\s*$/, '').trim();
var css = fs.readFileSync('styles.css', 'utf8');

var body = html.split('<body>')[1].split('</body>')[0];

/* サービスワーカー登録と外部読み込みは Artifact では使わないので取り除く */
body = body.replace(/<script>[\s\S]*?<\/script>/g, '');

var scripts = [];
body = body.replace(/[ \t]*<script src="([^"]+)"><\/script>\s*/g, function (m, src) {
  scripts.push(fs.readFileSync(src, 'utf8'));
  return '';
});
if (!scripts.length) throw new Error('取り込む JS が見つかりませんでした');

var js = scripts.join('\n');
[css, js, body].forEach(function (chunk, i) {
  if (/<\/script>/i.test(js) && i === 1) throw new Error('JS に </script> が含まれています');
});

var out = '<title>' + title + '</title>\n<style>\n' + css + '\n</style>\n' +
  body.trim() + '\n<script>\n' + js + '\n</script>\n';

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync(path.join('dist', 'index.html'), out);
console.log('dist/index.html  ' + (out.length / 1024).toFixed(0) + ' KB  (js ' + scripts.length + ' files)');
