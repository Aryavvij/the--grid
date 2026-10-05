// Runs every suite in this folder and prints a summary. Usage: node tests/run-all.js
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const files = fs.readdirSync(__dirname).filter(f => /(\.test|-test)\.js$/.test(f)).sort();
let bad = 0, total = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' }), out = (r.stdout || '') + (r.stderr || '');
  const ok = (out.match(/^ok/gm) || []).length, fail = (out.match(/^FAIL|Error/gm) || []).length;
  total += ok; if (fail || r.status) bad++;
  console.log(`${fail || r.status ? 'FAIL' : 'ok  '} ${f.padEnd(22)} ${ok} checks${fail ? `, ${fail} failing` : ''}`);
}
console.log(`\n${total} checks, ${bad ? bad + ' suite(s) failing' : 'all suites passing'}`);
process.exit(bad ? 1 : 0);
