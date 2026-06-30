-- 新增 booking_reference 欄位（訂位代號：確認碼/電子票券號/訂位碼）
alter table public.bookings
  add column if not exists booking_reference text;
