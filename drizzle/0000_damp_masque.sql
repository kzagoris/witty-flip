CREATE TABLE `conversions` (
	`id` text PRIMARY KEY NOT NULL,
	`original_filename` text NOT NULL,
	`source_format` text NOT NULL,
	`target_format` text NOT NULL,
	`conversion_type` text NOT NULL,
	`ip_address` text NOT NULL,
	`input_file_path` text NOT NULL,
	`input_file_size_bytes` integer,
	`output_file_size_bytes` integer,
	`tool_name` text,
	`tool_exit_code` integer,
	`conversion_time_ms` integer,
	`was_paid` integer DEFAULT 0,
	`status` text DEFAULT 'uploaded',
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')),
	`conversion_started_at` text,
	`conversion_completed_at` text,
	`expires_at` text
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text NOT NULL,
	`stripe_session_id` text NOT NULL,
	`stripe_payment_intent` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd',
	`ip_address` text NOT NULL,
	`conversion_type` text NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT (datetime('now')),
	`checkout_expires_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_stripe_session_id_unique` ON `payments` (`stripe_session_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_address` text NOT NULL,
	`free_conversion_count` integer DEFAULT 0,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_ip_date_unique` ON `rate_limits` (`ip_address`,`date`);