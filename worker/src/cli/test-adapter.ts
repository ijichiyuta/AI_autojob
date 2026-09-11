/** アダプタの動作確認: 一覧1ページ + 詳細1件 */
import { openContext, firstPage } from '../browser/context.js';
import { CrowdWorksAdapter } from '../adapters/crowdworks.js';

const group = process.argv[2] ?? 'development';
const ctx = await openContext({ headless: true });
const page = await firstPage(ctx);
const adapter = new CrowdWorksAdapter(page);

try {
  console.log(`=== search(${group}, 1ページ) ===`);
  const jobs = await adapter.search({ group, maxPages: 1 });
  console.log(`取得: ${jobs.length}件\n`);

  jobs.slice(0, 5).forEach((j, i) => {
    console.log(`[${i + 1}] ${j.title.slice(0, 50)}`);
    console.log(`    id=${j.externalId} cat=${j.category}(${j.rawCategory})`);
    console.log(`    ${j.paymentType} ${j.budgetMin?.toLocaleString()}〜${j.budgetMax?.toLocaleString()}円  応募${j.applicantCount}人  ${j.clientName}  掲載${j.postedAt}`);
  });

  // 取れなかった項目の割合を出す（セレクタ健全性の指標）
  console.log('\n=== 欠損率 ===');
  for (const k of ['rawCategory','descriptionExcerpt','paymentType','budgetMin','applicantCount','clientName','postedAt'] as const) {
    const miss = jobs.filter((j) => j[k] === null || j[k] === undefined).length;
    console.log(`  ${k.padEnd(20)} ${miss}/${jobs.length} 欠損`);
  }

  const target = jobs[0];
  if (target) {
    console.log(`\n=== fetchDetail(${target.url}) ===`);
    const d = await adapter.fetchDetail(target.url);
    console.log({
      paymentType: d.paymentType,
      budget: [d.budgetMin, d.budgetMax],
      deadline: d.deadline, postedAt: d.postedAt,
      applicant: d.applicantCount, contracted: d.contractedCount, recruit: d.recruitCount,
      client: d.clientName, rating: d.clientRating,
      orders: d.clientOrderCount, verified: d.clientVerified, completion: d.completionRate,
      descLen: d.description?.length ?? 0,
    });
    console.log('\n詳細本文の冒頭:', (d.description ?? '').slice(0, 200).replace(/\n/g, ' '));
  }
} finally {
  await ctx.close();
}
