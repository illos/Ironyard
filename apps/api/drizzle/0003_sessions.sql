ALTER TABLE `campaigns` ADD `current_session_id` text;

CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `name` text NOT NULL,
  `started_at` integer NOT NULL,
  `ended_at` integer,
  `attending_character_ids` text NOT NULL,
  `hero_tokens_start` integer NOT NULL,
  `hero_tokens_end` integer,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_sessions_campaign` ON `sessions` (`campaign_id`, `started_at`);
