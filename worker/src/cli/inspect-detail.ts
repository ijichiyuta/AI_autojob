/** 案件詳細ページの構造を調べる */
import { openContext, firstPage } from '../browser/context.js';

const url = process.argv[2] ?? 'https://crowdworks.jp/public/jobs/13408046';
const ctx = await openContext({ headless: true });
const page = await firstPage(ctx);

try {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500);
  console.log('status:', res?.status(), '| url:', page.url());

  const out = await page.evaluate(`(() => {
    var lines = [];
    lines.push('===== 本文テキスト（全体）=====');
    lines.push(document.body.innerText.slice(0, 4000));
    lines.push('');
    lines.push('===== 定義リスト（dt/dd）=====');
    Array.prototype.slice.call(document.querySelectorAll('dt')).forEach(function (dt) {
      var dd = dt.nextElementSibling;
      lines.push('  [' + (dt.textContent||'').trim() + '] = ' + ((dd && dd.textContent) || '').trim().replace(/\\s+/g,' ').slice(0,120));
    });
    lines.push('');
    lines.push('===== th/td テーブル =====');
    Array.prototype.slice.call(document.querySelectorAll('th')).forEach(function (th) {
      var td = th.nextElementSibling;
      lines.push('  [' + (th.textContent||'').trim() + '] = ' + ((td && td.textContent) || '').trim().replace(/\\s+/g,' ').slice(0,120));
    });
    lines.push('');
    lines.push('===== クラス名（_xxx_ の意味部分のみ、重複除去）=====');
    var names = {};
    Array.prototype.slice.call(document.querySelectorAll('*[class]')).forEach(function (el) {
      (el.getAttribute('class')||'').split(/\\s+/).forEach(function (c) {
        var m = c.match(/^_([a-zA-Z]+)_[a-z0-9]{5}_\\d+$/);
        if (m) names[m[1]] = 1;
      });
    });
    lines.push('  ' + Object.keys(names).sort().join(', '));
    return lines.join('\\n');
  })()`);
  console.log(out);
} finally {
  await ctx.close();
}
