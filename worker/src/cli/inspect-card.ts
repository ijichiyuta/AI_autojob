/** 一覧カード1件の構造と、カテゴリ一覧を調べる */
import { openContext, firstPage } from '../browser/context.js';

const listUrl = process.argv[2] ?? 'https://crowdworks.jp/public/jobs/group/development';
const ctx = await openContext({ headless: true });
const page = await firstPage(ctx);

try {
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2000);

  const out = await page.evaluate(`(() => {
    var jobRe = /^\\/public\\/jobs\\/\\d+$/;
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href]'))
      .filter(function (a) { return jobRe.test(a.getAttribute('href') || ''); });
    if (!links.length) return 'case: 案件リンクなし';

    var el = links[0];
    while (el.parentElement) {
      var p = el.parentElement;
      var n = Array.prototype.slice.call(p.querySelectorAll('a[href]'))
        .filter(function (a) { return jobRe.test(a.getAttribute('href') || ''); }).length;
      if (n !== 1) break;
      el = p;
    }

    var cats = Array.prototype.slice.call(
      document.querySelectorAll('a[href^="/public/jobs/category/"]')
    ).map(function (a) { return a.getAttribute('href') + '  ' + (a.textContent || '').trim(); });

    var html = el.outerHTML.replace(/_([a-zA-Z]+)_[a-z0-9]{5}_\\d+/g, '_$1_«h»');

    return [
      '===== カードHTML =====', html.slice(0, 4500), '',
      '===== カードのテキスト =====', el.innerText, '',
      '===== カテゴリ一覧 =====',
      Array.from(new Set(cats)).join('\\n')
    ].join('\\n');
  })()`);
  console.log(out);
} finally {
  await ctx.close();
}
