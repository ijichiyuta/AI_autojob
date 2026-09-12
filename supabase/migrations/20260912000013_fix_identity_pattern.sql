-- identity_disclosure の誤検知を直す。
-- 「顔出しのZOOMにてすり合わせが可能な方」を「顔写真の公表」と同一視して
-- 開発案件（UI/UX設計）まで除外していた。
-- 打ち合わせでのビデオ通話は公開の場への掲載とは別物なので、
-- NGにするのは「商品ページ等に実名・顔写真を載せる」ケースだけにする。
-- 打ち合わせの顔出しは既存の face_required（警告）で拾う。
update public.settings
set value = (
  select jsonb_agg(
    case when rule->>'id' = 'identity_disclosure' then jsonb_build_object(
      'id', 'identity_disclosure',
      'type', 'ng',
      'label', '実名・顔写真の公表が条件',
      'note', '商品ページ等への掲載。本業に知られない前提で運用しているため受けられない。打ち合わせでの顔出しは face_required（警告）で別に扱う',
      'patterns', jsonb_build_array(
        '(実名|本名)[^。\n]{0,16}(公表|掲載|開示)',
        '(顔写真|お顔)[^。\n]{0,16}(公表|掲載|提供)'
      )
    ) else rule end
  )
  from jsonb_array_elements(value) as rule
)
where key = 'ng_rules';
