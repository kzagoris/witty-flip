CREATE TABLE `client_conversion_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`conversion_type` text NOT NULL,
	`category` text NOT NULL,
	`ip_address` text NOT NULL,
	`input_mode` text NOT NULL,
	`original_filename` text,
	`input_size_bytes` integer,
	`output_size_bytes` integer,
	`output_filename` text,
	`output_mime_type` text,
	`token_hash` text NOT NULL,
	`recovery_token` text,
	`rate_limit_date` text,
	`was_paid` integer DEFAULT 0,
	`status` text DEFAULT 'reserved' NOT NULL,
	`error_code` text,
	`error_message` text,
	`duration_ms` integer,
	`started_at` text DEFAULT (datetime('now')),
	`completed_at` text,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `conversions_after_insert_event`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `conversions_after_update_status_event`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `payments_after_insert_event`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `payments_after_update_status_event`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text,
	`client_attempt_id` text,
	`stripe_session_id` text NOT NULL,
	`stripe_payment_intent` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd',
	`ip_address` text NOT NULL,
	`conversion_type` text NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT (datetime('now')),
	`checkout_expires_at` text,
	`completed_at` text,
	CONSTRAINT `payments_reference_check` CHECK((
      (`__new_payments`.`file_id` is not null and `__new_payments`.`client_attempt_id` is null) or
      (`__new_payments`.`file_id` is null and `__new_payments`.`client_attempt_id` is not null)
    ))
);
--> statement-breakpoint
INSERT INTO `__new_payments`(
	`id`,
	`file_id`,
	`client_attempt_id`,
	`stripe_session_id`,
	`stripe_payment_intent`,
	`amount_cents`,
	`currency`,
	`ip_address`,
	`conversion_type`,
	`status`,
	`created_at`,
	`checkout_expires_at`,
	`completed_at`
) SELECT
	`id`,
	`file_id`,
	NULL AS `client_attempt_id`,
	`stripe_session_id`,
	`stripe_payment_intent`,
	`amount_cents`,
	`currency`,
	`ip_address`,
	`conversion_type`,
	`status`,
	`created_at`,
	`checkout_expires_at`,
	`completed_at`
FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_stripe_session_id_unique` ON `payments` (`stripe_session_id`);--> statement-breakpoint
ALTER TABLE `conversion_events` ADD `event_source` text DEFAULT 'server' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversions` ADD `category` text DEFAULT 'document' NOT NULL;--> statement-breakpoint
UPDATE `conversions`
SET `category` = 'ebook'
WHERE `conversion_type` = 'epub-to-mobi';--> statement-breakpoint
CREATE TRIGGER `conversions_after_insert_event`
AFTER INSERT ON `conversions`
BEGIN
	INSERT INTO `conversion_events` (
		`file_id`,
		`event_source`,
		`event_type`,
		`to_status`,
		`tool_name`,
		`message`
	) VALUES (
		NEW.`id`,
		'server',
		'conversion_created',
		NEW.`status`,
		NEW.`tool_name`,
		'Conversion created.'
	);
END;
--> statement-breakpoint
CREATE TRIGGER `conversions_after_update_status_event`
AFTER UPDATE OF `status` ON `conversions`
WHEN OLD.`status` IS NOT NEW.`status`
BEGIN
	INSERT INTO `conversion_events` (
		`file_id`,
		`event_source`,
		`event_type`,
		`from_status`,
		`to_status`,
		`tool_name`,
		`message`
	) VALUES (
		NEW.`id`,
		'server',
		'conversion_status_changed',
		OLD.`status`,
		NEW.`status`,
		NEW.`tool_name`,
		CASE
			WHEN NEW.`error_message` IS NOT NULL AND length(NEW.`error_message`) > 0 THEN NEW.`error_message`
			ELSE 'Conversion status changed.'
		END
	);
END;
--> statement-breakpoint
CREATE TRIGGER `payments_after_insert_event`
AFTER INSERT ON `payments`
BEGIN
	INSERT INTO `conversion_events` (
		`file_id`,
		`event_source`,
		`event_type`,
		`payment_status`,
		`message`
	) VALUES (
		COALESCE(NEW.`file_id`, NEW.`client_attempt_id`),
		'server',
		'payment_created',
		NEW.`status`,
		'Payment record created.'
	);
END;
--> statement-breakpoint
CREATE TRIGGER `payments_after_update_status_event`
AFTER UPDATE OF `status` ON `payments`
WHEN OLD.`status` IS NOT NEW.`status`
BEGIN
	INSERT INTO `conversion_events` (
		`file_id`,
		`event_source`,
		`event_type`,
		`payment_status`,
		`message`
	) VALUES (
		COALESCE(NEW.`file_id`, NEW.`client_attempt_id`),
		'server',
		'payment_status_changed',
		NEW.`status`,
		'Payment status changed.'
	);
END;
--> statement-breakpoint
CREATE TRIGGER `client_attempts_after_insert_event`
AFTER INSERT ON `client_conversion_attempts`
BEGIN
	INSERT INTO `conversion_events` (
		`file_id`,
		`event_source`,
		`event_type`,
		`to_status`,
		`message`
	) VALUES (
		NEW.`id`,
		'client',
		'conversion_created',
		NEW.`status`,
		'Client conversion attempt created.'
	);
END;
--> statement-breakpoint
CREATE TRIGGER `client_attempts_after_update_status_event`
AFTER UPDATE OF `status` ON `client_conversion_attempts`
WHEN OLD.`status` IS NOT NEW.`status`
BEGIN
	INSERT INTO `conversion_events` (
		`file_id`,
		`event_source`,
		`event_type`,
		`from_status`,
		`to_status`,
		`message`
	) VALUES (
		NEW.`id`,
		'client',
		'conversion_status_changed',
		OLD.`status`,
		NEW.`status`,
		CASE
			WHEN NEW.`error_message` IS NOT NULL AND length(NEW.`error_message`) > 0 THEN NEW.`error_message`
			ELSE 'Client conversion status changed.'
		END
	);
END;
