-- 会員限定公開の案件は、ログインしないと詳細が読めない。
-- 判定材料がないまま応募文を生成することはできないので、警告として明示する。
-- ログインを実装する Phase 2 で再取得・再評価する。
update public.settings
set value = value || jsonb_build_array(
  jsonb_build_object(
    'id', 'login_required',
    'type', 'warn',
    'label', '会員限定公開（詳細がログイン必須）',
    'note', 'Phase 2 でログインを実装したら再取得して再評価する',
    'patterns', jsonb_build_array(
      '会員限定公開[^。\n]{0,20}ログインが必要',
      '詳細をご覧いただくには[^。\n]{0,10}ログイン'
    )
  )
)
where key = 'ng_rules';
