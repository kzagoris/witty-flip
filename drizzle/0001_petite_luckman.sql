ALTER TABLE `conversions` ADD `rate_limit_date` text;--> statement-breakpoint
ALTER TABLE `rate_limits` ADD `reserved_free_slots` integer DEFAULT 0;