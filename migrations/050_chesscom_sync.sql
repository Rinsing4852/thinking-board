-- Keep recent-sync freshness separate from manually importing an older month.
ALTER TABLE chesscom_connections ADD COLUMN last_synced_at TEXT;
ALTER TABLE chesscom_connections ADD COLUMN last_sync_month TEXT;
