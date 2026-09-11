-- 実サイトのグループslugに合わせて検索条件を入れ直す
delete from public.search_queries where platform = 'crowdworks';

insert into public.search_queries (platform, label, params, max_pages) values
('crowdworks', 'システム開発',              '{"group":"development"}'::jsonb,          3),
('crowdworks', 'ホームページ制作・Webデザイン', '{"group":"web_products"}'::jsonb,         3),
('crowdworks', 'AI・機械学習',              '{"group":"ai_machine_learning"}'::jsonb,  2),
('crowdworks', 'AI-BPO（業務改善）',         '{"group":"ai_bpo"}'::jsonb,               2),
('crowdworks', 'アプリ・スマートフォン開発',   '{"group":"software_development"}'::jsonb, 2),
('crowdworks', 'ECサイト・ネットショップ構築', '{"group":"ec"}'::jsonb,                   1),
('crowdworks', 'ライティング・記事作成',       '{"group":"writing_beginner"}'::jsonb,     1);

-- 収集禁止グループの記録（動画・音声系＝BS競業避止）
insert into public.settings (key, value) values
('blocked_groups', '{
  "_note": "BACKSTAGE業務委託契約 第8条。違約金246万。収集対象に入れてはいけない",
  "video_contents": "動画・映像・アニメーション",
  "sounds": "音楽・音響・ナレーション",
  "multimedia": "写真・画像",
  "3dcg": "3D-CG制作"
}'::jsonb)
on conflict (key) do update set value = excluded.value;
