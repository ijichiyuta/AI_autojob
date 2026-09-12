import { db } from '../db/client.js';
const { data } = await db.from('job_board')
  .select('title,description,total_score,hourly_rate,estimated_hours,budget_min,budget_max,llm_genre_match,llm_specificity,llm_notes,breakdown')
  .eq('status','scored').eq('llm_status','done');
const find = (kw: string) => (data ?? []).filter((j) => j.title.includes(kw));

console.log('=== ① 81点の案件（ホワイトニング）===');
for (const j of find('ホワイトニング')) {
  console.log(`  ${j.total_score}点 予算${j.budget_min} 工数${j.estimated_hours}h 時給${j.hourly_rate} ジャンル一致${j.llm_genre_match}`);
  console.log('  ' + (j.description ?? '').replace(/\n/g,' ').slice(0, 700));
}

console.log('\n=== ② ジャンル一致が高い案件 top8（スコア順ではなく一致度順）===');
for (const j of (data ?? []).sort((a,b)=>(b.llm_genre_match??0)-(a.llm_genre_match??0)).slice(0,8)) {
  const b = j.budget_min == null ? '予算未提示' : `${j.budget_min?.toLocaleString()}円`;
  console.log(`  一致${String(j.llm_genre_match).padStart(3)} / ${String(j.total_score).padStart(2)}点 / ${b} / 時給${j.hourly_rate ?? '—'} / 工数${j.estimated_hours}h  ${j.title.slice(0,42)}`);
}

console.log('\n=== ③ hourly_rate の配点が支配していないか（上位5件の内訳）===');
for (const j of (data ?? []).sort((a,b)=>(b.total_score??0)-(a.total_score??0)).slice(0,5)) {
  const bd = j.breakdown as Record<string, any>;
  const parts = ['hourly_rate','client_quality','low_competition','specificity','genre_match','deadline_margin']
    .map((k)=>`${k}:${bd?.[k]?.points ?? '—'}/${bd?.[k]?.max}`).join(' ');
  console.log(`  ${j.total_score}点  ${parts}`);
  console.log(`        ${j.title.slice(0,50)}`);
}
