// Ставит номер версии во все ссылки на файлы, чтобы телефон не показывал старую игру из кэша.
// Запуск: node tools/bump.mjs 5   → «версия 0.5» в меню и ?v=5 у всех скриптов и стилей
import fs from 'node:fs';

const v = process.argv[2];
if (!/^\d+$/.test(v || '')) { console.error('нужен номер: node tools/bump.mjs 5'); process.exit(1); }
const root = new URL('..', import.meta.url);
const edit = (rel, fn) => { const u = new URL(rel, root); fs.writeFileSync(u, fn(fs.readFileSync(u, 'utf8'))); };

edit('index.html', (s) => s
  .replace(/(style\.css|js\/main\.js)(\?v=\d+)?/g, `$1?v=${v}`)
  .replace(/версия 0\.\d+/, `версия 0.${v}`));
edit('car.html', (s) => s.replace(/(js\/showroom\.js)(\?v=\d+)?/g, `$1?v=${v}`));
for (const f of fs.readdirSync(new URL('js/', root))) {
  if (f.endsWith('.js')) edit('js/' + f, (s) => s
    .replace(/(from '\.\/[\w-]+\.js)(\?v=\d+)?'/g, `$1?v=${v}'`)
    .replace(/(fetch\('data\/[\w-]+\.json)(\?v=\d+)?'/g, `$1?v=${v}'`));
}
console.log('версия 0.' + v);
