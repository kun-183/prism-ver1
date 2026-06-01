-- RLS가 켜진 테이블에서 Realtime DELETE 이벤트를 구독자에게 전달하려면
-- REPLICA IDENTITY FULL 이 필요하다(삭제된 행의 RLS 평가 + old 레코드 전달).
alter table branches replica identity full;
alter table comments replica identity full;
