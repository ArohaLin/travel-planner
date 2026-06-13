-- 宣傳冊檢視（對外唯讀分享）
-- 為 itineraries 增加：公開開關、分享 token、宣傳冊快取（照片 ref + 地圖座標）
--
-- 設計：
--  * public_share  — 是否開啟公開連結（關閉即時失效，所有 proxy 一併擋下）
--  * share_token   — 隨機、可撤銷的公開網址 token（/share/<token>）
--  * brochure_cache— 產生宣傳冊時抓一次並快取（Places 照片 reference + 靜態地圖座標），
--                    公開頁只讀此快取，絕不即時呼叫付費 API。
--
-- 讀寫一律走 service role（繞過 RLS）；公開頁靠 token 當門禁，故不需新增 RLS policy。

alter table itineraries
  add column if not exists public_share boolean not null default false,
  add column if not exists share_token text,
  add column if not exists brochure_cache jsonb;

-- token 唯一（允許多筆 NULL）
create unique index if not exists itineraries_share_token_key
  on itineraries (share_token)
  where share_token is not null;
