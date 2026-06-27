-- 採購項支援「綁多家店」：同一樣東西若好幾間店都有，可綁多家候選店，
-- 地圖在每家都顯示購物袋點，任一家買到、勾一次即整項完成。
-- 新增 stores（JSONB 陣列：[{placeId,name,lat,lng}]）；回填既有單店資料。

alter table public.shopping_items add column if not exists stores jsonb not null default '[]'::jsonb;

-- 既有單店（place_id）資料 → 回填成 stores 一筆
update public.shopping_items
set stores = jsonb_build_array(
  jsonb_build_object('placeId', place_id, 'name', coalesce(place_name, '店家'), 'lat', lat, 'lng', lng)
)
where place_id is not null and (stores is null or stores = '[]'::jsonb);
