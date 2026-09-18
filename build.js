/*
 * build.js -- produce a single self-contained page from the source files.
 *
 *   node build.js
 *
 * The repository keeps the app as separate modules so it is readable and so
 * index.html can be opened straight off disk. Publishing wants one file with
 * nothing external, so this inlines the stylesheet and the scripts and drops
 * the document wrapper. Sources stay the single place anything is edited.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var root = __dirname;
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

var title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, 'Stage Lights'])[1].trim();
var body = (html.match(/<body>([\s\S]*?)<\/body>/) || [, ''])[1];
var fontLinks = (html.match(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>/g) || []).join('\n');

/* scripts in the order index.html loads them */
var scripts = (html.match(/<script src="([^"]+)"><\/script>/g) || [])
  .map(function (tag) { return tag.match(/src="([^"]+)"/)[1]; });

var css = fs.readFileSync(path.join(root, 'css/stage.css'), 'utf8');

var parts = [];
parts.push('<title>' + title + '</title>');
if (fontLinks) parts.push(fontLinks);
parts.push('<style>\n' + css.trim() + '\n</style>');
parts.push(body.replace(/<script src="[^"]+"><\/script>\s*/g, '').trim());
scripts.forEach(function (src) {
  parts.push('<script>\n' + fs.readFileSync(path.join(root, src), 'utf8').trim() + '\n</script>');
});

var out = parts.join('\n\n') + '\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/page.html'), out);

console.log('dist/page.html  ' + (out.length / 1024).toFixed(1) + ' KB  (' +
            scripts.length + ' scripts, ' + title + ')');
