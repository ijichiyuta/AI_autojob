/**
 * 会員限定公開で詳細が読めなかった案件を、ログイン後に取り直す。
 *   npm run refetch [-- --limit 30]
 */
import { openContext, firstPage } from '../browser/context.js';
import { CrowdWorksAdapter } from '../adapters/crowdworks.js';
import { checkLogin, isMembersOnly } from '../browser/session.js';
import { db, getSetting } from '../db/client.js';
import { detectNg, type NgRule } from '../scoring/ng.js';
import { scoreJob, budgetMidpoint, type Weights, type Thresholds, type GenreProfile } from '../scoring/score.js';
import { extraWarnFlags } from '../scoring/flags.js';
import { normalizeCategory } from '../adapters/crowdworks.js';
import { randomDelay } from '../util/sleep.js';
import type { Guardrails } from '../browser/guard.js';

function arg(n: string) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; }
const limit = Number(arg('limit') ?? 30);

const ctx = await openContext({ headless: true });
const page = await firstPage(ctx);

try {
  const login = await checkLogin(page);
  if (!login.loggedIn) {
    console.error('未ログインです。先に npm run login を実行してください。');
    process.exitCode = 1;
  } else {
    console.log(`ログイン済み${login.userName ? `（${login.userName}）` : ''}。取り直しを開始します\n`);

    // members_only フラグが立っているもの＋本文に会員限定と書かれているもの
    const { data: flagged } = await db.from('jobs').select('*').eq('members_only', true).limit(limit);
    const { data: byText } = await db.from('jobs')
      .select('*').ilike('description', '%会員限定公開%').limit(limit);
    const seen = new Set<string>();
    const targets = [...(flagged ?? []), ...(byText ?? [])].filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id); return true;
    }).slice(0, limit);

    console.log(`対象 ${targets.length}件\n`);

    const [rules, weights, thresholds, bootstrap, genre, guard] = await Promise.all([
      getSetting<NgRule[]>('ng_rules'),
      getSetting<Weights>('scoring_weights'),
      getSetting<Thresholds>('thresholds'),
      getSetting<{ enabled: boolean; min_budget: number }>('bootstrap_mode'),
      getSetting<GenreProfile>('genre_profile'),
      getSetting<Guardrails>('guardrails'),
    ]);
    const minBudget = bootstrap.enabled ? bootstrap.min_budget : thresholds.min_budget;
    const adapter = new CrowdWorksAdapter(page);

    let updated = 0;
    let stillLocked = 0;

    for (const j of targets) {
      await randomDelay(guard.page_delay_ms);
      const d = await adapter.fetchDetail(j.url);

      if (isMembersOnly(d.description)) {
        stillLocked++;
        console.log(`  [まだ読めない] ${j.title.slice(0, 44)}`);
        continue;
      }

      const category = normalizeCategory(j.raw_category, j.title);
      const budgetMin = d.budgetMin ?? j.budget_min;
      const budgetMax = d.budgetMax ?? j.budget_max;
      const ng = detectNg(rules, { title: j.title, description: d.description, rawCategory: j.raw_category, category, paymentType: d.paymentType ?? j.payment_type });
      const mid = budgetMidpoint(budgetMin, budgetMax);
      const ngFlags = [...ng.ngFlags, ...(mid != null && mid < minBudget ? ['budget_below_min'] : [])];
      const status = ngFlags.length > 0 ? 'ng_filtered' : 'scored';

      const sc = scoreJob({
        title: j.title, description: d.description, category, rawCategory: j.raw_category,
        budgetMin, budgetMax,
        applicantCount: d.applicantCount ?? j.applicant_count,
        clientRating: d.clientRating, clientOrderCount: d.clientOrderCount,
        clientVerified: d.clientVerified, completionRate: d.completionRate,
        deadline: d.deadline ?? j.deadline,
        estimatedHours: null, llmSpecificity: null, llmGenreMatch: null,
      }, weights, thresholds, genre);

      await db.from('jobs').update({
        description: d.description, category,
        budget_min: budgetMin, budget_max: budgetMax,
        payment_type: d.paymentType ?? j.payment_type,
        deadline: d.deadline ?? j.deadline,
        applicant_count: d.applicantCount ?? j.applicant_count,
        client_rating: d.clientRating, client_order_count: d.clientOrderCount,
        client_verified: d.clientVerified,
        detail_fetched_at: new Date().toISOString(),
        members_only: false,
        status,
      }).eq('id', j.id);

      await db.from('job_scores').upsert({
        job_id: j.id,
        total_score: sc.totalScore,
        breakdown: { ...sc.breakdown, ng_hits: ng.hits },
        ng_flags: ngFlags,
        warn_flags: Array.from(new Set([
          ...ng.warnFlags,
          ...extraWarnFlags({ applicantCount: d.applicantCount ?? j.applicant_count, budgetMin, budgetMax, category }),
        ])),
        hourly_rate: sc.hourlyRate,
        // 本文が変わったのでLLM判定はやり直す
        llm_status: ngFlags.length > 0 ? 'skipped' : 'pending',
        scored_at: new Date().toISOString(),
      }, { onConflict: 'job_id' });

      updated++;
      console.log(`  [${status === 'scored' ? '候補' : 'NG '}] ${sc.totalScore}点 ${j.title.slice(0, 40)}`);
    }

    console.log(`\n取り直し ${updated}件 / まだ読めない ${stillLocked}件`);
    if (updated > 0) console.log('LLM判定が必要です: npm run llm:export');
  }
} finally {
  await ctx.close().catch(() => {});
}
