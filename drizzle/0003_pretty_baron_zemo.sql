CREATE TABLE `conversion_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text NOT NULL,
	`event_type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`payment_status` text,
	`tool_name` text,
	`message` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `conversion_events_file_created_idx` ON `conversion_events` (`file_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `conversion_events_event_created_idx` ON `conversion_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `conversions_after_insert_event`
AFTER INSERT ON `conversions`
BEGIN
	INSERT INTO `conversion_events` (
		`file_id`,
		`event_type`,
		`to_status`,
		`tool_name`,
		`message`
	) VALUES (
		NEW.`id`,
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
		`event_type`,
		`from_status`,
		`to_status`,
		`tool_name`,
		`message`
	) VALUES (
		NEW.`id`,
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
		`event_type`,
		`payment_status`,
		`message`
	) VALUES (
		NEW.`file_id`,
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
		`event_type`,
		`payment_status`,
		`message`
	) VALUES (
		NEW.`file_id`,
		'payment_status_changed',
		NEW.`status`,
		'Payment status changed.'
	);
END;
