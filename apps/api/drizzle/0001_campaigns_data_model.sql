ALTER TABLE `campaign_memberships` ADD `is_director` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaign_memberships` DROP COLUMN `role`;--> statement-breakpoint
CREATE TABLE `campaign_characters` (
	`campaign_id` text NOT NULL,
	`character_id` text NOT NULL,
	`status` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	PRIMARY KEY(`campaign_id`, `character_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_characters_campaign` ON `campaign_characters` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `encounter_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_encounter_templates_campaign` ON `encounter_templates` (`campaign_id`);
