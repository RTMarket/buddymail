ALTER TABLE site_visit_events
  ADD COLUMN user_id BIGINT NULL AFTER ip,
  ADD KEY idx_site_visit_user_time (user_id, visited_at);
