import type { Page } from 'playwright';
import { db, getSetting, raiseAlert } from '../db/client.js';
import { CrowdWorksAdapter } from '../adapters/crowdworks.js';
import type { JobSummary } from '../adapters/types.js';
import { detectNg, type NgRule } from '../scoring/ng.js';
import {
  scoreJob, budgetMidpoint,
  type Weights, type Thresholds, type GenreProfile,
} from '../scoring/score.js';
import { randomDelay } from '../util/sleep.js';
import { isQuietHour, type Guardrails, AbortRun } from '../browser/guard.js';

interface BootstrapMode {
  enabled: boolean;
  min_budget: number;
  min_hourly_rate: number;
  target_completed: number;
}

export interface CrawlResult {
  queries: number;
  found: number;
  isNew: number;
  ngFiltered: number;
  detailFetched: number;
  scored: number;
}

export interface CrawlOptions {
  dryRun?: boolean;
  /** 詳細取得の上限。動作確認や様子見のときに使う */
  maxDetails?: number;
  /** 特定の検索条件だけ回す（label の部分一致） */
  onlyLabel?: string;
  /** 1条件あたりのページ数を上書きする */
  maxPages?: number;
  /** 深夜帯ガードを明示的に無視する（手動実行時のみ。定期バッチでは使わない） */
  force?: boolean;
}

export async function runCrawl(page: Page, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const [rules, weights, thresholds, bootstrap, guard, genre] = await Promise.all([
    getSetting<NgRule[]>('ng_rules'),
    getSetting<Weights>('scoring_weights'),
    getSetting<Thresholds>('thresholds'),
    getSetting<BootstrapMode>('bootstrap_mode'),
    getSetting<Guardrails>('guardrails'),
    getSetting<GenreProfile>('genre_profile'),
  ]);

  if (isQuietHour(guard)) {
    if (!opts.force) {
      throw new AbortRun(`深夜帯（${guard.quiet_hours.from}時〜${guard.quiet_hours.to}時）のため実行しません`);
    }
    console.warn(`⚠ 深夜帯ですが --force 指定のため実行します（定期バッチでは使わないこと）`);
  }

  // 実績がまだ無い間は、評価を取りにいくため下限を緩める
  const minBudget = bootstrap.enabled ? bootstrap.min_budget : thresholds.min_budget;

  let qb = db.from('search_queries').select('*').eq('enabled', true).eq('platform', 'crowdworks');
  if (opts.onlyLabel) qb = qb.ilike('label', `%${opts.onlyLabel}%`);
  const { data: queries, error: qErr } = await qb;
  if (qErr) throw new Error(`検索条件の読み込みに失敗: ${qErr.message}`);

  const adapter = new CrowdWorksAdapter(page);
  const result: CrawlResult = { queries: 0, found: 0, isNew: 0, ngFiltered: 0, detailFetched: 0, scored: 0 };

  for (const q of queries ?? []) {
    const groupSlug = (q.params as { group?: string }).group;
    if (!groupSlug) { console.warn(`  [${q.label}] params.group が未設定のためスキップ`); continue; }

    const { data: run } = await db.from('crawl_runs')
      .insert({ platform: 'crowdworks', query_label: q.label }).select('id').single();
    const runId = run?.id as string | undefined;
    let pagesCrawled = 0;

    try {
      const summaries = await adapter.search({
        group: groupSlug,
        maxPages: opts.maxPages ?? q.max_pages ?? 3,
        onPage: (p, n) => { pagesCrawled = p; console.log(`  [${q.label}] p${p}: ${n}件`); },
      });
      result.queries++;
      result.found += summaries.length;

      // 既知の案件を除く
      const ids = summaries.map((s) => s.externalId);
      const { data: existing } = await db.from('jobs')
        .select('external_id').eq('platform', 'crowdworks').in('external_id', ids);
      const known = new Set((existing ?? []).map((e) => e.external_id as string));
      const fresh = summaries.filter((s) => !known.has(s.externalId));
      result.isNew += fresh.length;
      console.log(`  [${q.label}] 新規 ${fresh.length}件 / 既知 ${known.size}件`);

      for (const s of fresh) {
        // --- 一次フィルタ: 詳細を取りに行く前に、一覧の情報だけで落とせるものは落とす ---
        const pre = detectNg(rules, {
          title: s.title, description: s.descriptionExcerpt,
          rawCategory: s.rawCategory, category: s.category,
        });
        const budgetMax = s.budgetMax ?? s.budgetMin;
        const tooCheap = budgetMax != null && budgetMax < minBudget;

        if (pre.ngFlags.length > 0 || tooCheap) {
          const flags = [...pre.ngFlags, ...(tooCheap ? ['budget_below_min'] : [])];
          if (!opts.dryRun) await saveJob(s, null, 'ng_filtered', flags, pre.warnFlags, pre.hits, null, weights, thresholds, genre);
          result.ngFiltered++;
          continue;
        }

        // --- 詳細取得（ここだけリクエストを使う）---
        if (opts.maxDetails != null && result.detailFetched >= opts.maxDetails) {
          console.log(`  詳細取得の上限 ${opts.maxDetails}件に到達したため以降はスキップ`);
          break;
        }
        await randomDelay(guard.page_delay_ms);
        const detail = await adapter.fetchDetail(s.url);
        result.detailFetched++;

        // --- 全文に対する本判定 ---
        const post = detectNg(rules, {
          title: s.title, description: detail.description,
          rawCategory: s.rawCategory, category: s.category,
        });

        const merged: JobSummary = {
          ...s,
          budgetMin: detail.budgetMin ?? s.budgetMin,
          budgetMax: detail.budgetMax ?? s.budgetMax,
          paymentType: detail.paymentType ?? s.paymentType,
          applicantCount: detail.applicantCount ?? s.applicantCount,
          deadline: detail.deadline ?? s.deadline,
          postedAt: detail.postedAt ?? s.postedAt,
          clientName: detail.clientName ?? s.clientName,
        };

        const mid = budgetMidpoint(merged.budgetMin, merged.budgetMax);
        const budgetNg = mid != null && mid < minBudget;
        const ngFlags = [...post.ngFlags, ...(budgetNg ? ['budget_below_min'] : [])];
        const status = ngFlags.length > 0 ? 'ng_filtered' : 'scored';
        if (ngFlags.length > 0) result.ngFiltered++; else result.scored++;

        if (!opts.dryRun) {
          await saveJob(merged, detail, status, ngFlags, post.warnFlags, post.hits, detail, weights, thresholds, genre);
        }
      }

      if (runId) {
        await db.from('crawl_runs').update({
          status: 'success', finished_at: new Date().toISOString(),
          pages_crawled: pagesCrawled, jobs_found: summaries.length, jobs_new: fresh.length,
        }).eq('id', runId);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (runId) {
        await db.from('crawl_runs').update({
          status: e instanceof AbortRun ? 'aborted' : 'failed',
          finished_at: new Date().toISOString(), pages_crawled: pagesCrawled, error_message: msg,
        }).eq('id', runId);
      }
      if (e instanceof AbortRun) throw e;
      await raiseAlert('error', 'crawl_failed', `[${q.label}] 収集に失敗: ${msg}`, { query: q.label });
    }

    await randomDelay(guard.page_delay_ms);
  }

  return result;
}

async function saveJob(
  s: JobSummary,
  detail: Awaited<ReturnType<CrowdWorksAdapter['fetchDetail']>> | null,
  status: string,
  ngFlags: string[],
  warnFlags: string[],
  hits: ReturnType<typeof detectNg>['hits'],
  detailForScore: Awaited<ReturnType<CrowdWorksAdapter['fetchDetail']>> | null,
  weights: Weights,
  thresholds: Thresholds,
  genre: GenreProfile,
) {
  const { data: job, error } = await db.from('jobs').upsert({
    platform: s.platform,
    external_id: s.externalId,
    url: s.url,
    title: s.title,
    description: detail?.description ?? s.descriptionExcerpt,
    category: s.category,
    raw_category: s.rawCategory,
    payment_type: s.paymentType,
    budget_min: s.budgetMin,
    budget_max: s.budgetMax,
    deadline: s.deadline,
    applicant_count: s.applicantCount,
    client_name: s.clientName,
    client_rating: detail?.clientRating ?? null,
    client_order_count: detail?.clientOrderCount ?? null,
    client_verified: detail?.clientVerified ?? null,
    posted_at: s.postedAt ? `${s.postedAt}T00:00:00+09:00` : null,
    detail_fetched_at: detail ? new Date().toISOString() : null,
    status,
  }, { onConflict: 'platform,external_id' }).select('id').single();

  if (error) { console.error('  jobs upsert 失敗:', error.message); return; }

  const sc = scoreJob({
    title: s.title,
    description: detail?.description ?? s.descriptionExcerpt,
    category: s.category,
    rawCategory: s.rawCategory,
    budgetMin: s.budgetMin,
    budgetMax: s.budgetMax,
    applicantCount: s.applicantCount,
    clientRating: detailForScore?.clientRating ?? null,
    clientOrderCount: detailForScore?.clientOrderCount ?? null,
    clientVerified: detailForScore?.clientVerified ?? null,
    completionRate: detailForScore?.completionRate ?? null,
    deadline: s.deadline,
    estimatedHours: null,   // LLM判定で埋める
    llmSpecificity: null,
    llmGenreMatch: null,
  }, weights, thresholds, genre);

  await db.from('job_scores').upsert({
    job_id: job.id,
    total_score: sc.totalScore,
    breakdown: { ...sc.breakdown, ng_hits: hits },
    ng_flags: ngFlags,
    warn_flags: warnFlags,
    hourly_rate: sc.hourlyRate,
    // NG除外済みならLLM判定は不要
    llm_status: ngFlags.length > 0 ? 'skipped' : 'pending',
  }, { onConflict: 'job_id' });
}
