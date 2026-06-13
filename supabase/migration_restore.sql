-- 行程還原機制：為每筆變更存「該次之後的完整行程快照」，供還原到歷史節點
--
-- 設計：
--  * snapshot — 該次變更套用後的完整 itinerary data（JSONB）。還原＝把它設回 itineraries.data。
--  * 非破壞式：還原時新增一筆 rollback 節點（snapshot=還原後狀態）→ 可再還原回去。
--  * 舊節點（此功能上線前）snapshot 為 NULL → 只能看、不能還原。

alter table itinerary_changes
  add column if not exists snapshot jsonb;

-- 基準點：每個行程「最新一筆變更」補上目前行程快照，讓上線後立即有一個可還原點。
update itinerary_changes ic
set snapshot = i.data
from itineraries i
where ic.itinerary_id = i.id
  and ic.snapshot is null
  and ic.id = (
    select ic2.id
    from itinerary_changes ic2
    where ic2.itinerary_id = ic.itinerary_id
    order by ic2.created_at desc
    limit 1
  );
