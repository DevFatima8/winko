-- winkox Hostinger schema
-- Select database u113090363_xgames before running this script.

CREATE TABLE IF NOT EXISTS `users` (`id` VARCHAR(64) NOT NULL, `data` JSON NOT NULL, `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `loginevents` LIKE `users`;
CREATE TABLE IF NOT EXISTS `paymentaccounts` LIKE `users`;
CREATE TABLE IF NOT EXISTS `transactions` LIKE `users`;
CREATE TABLE IF NOT EXISTS `games` LIKE `users`;
CREATE TABLE IF NOT EXISTS `gameresults` LIKE `users`;
CREATE TABLE IF NOT EXISTS `aviatorrounds` LIKE `users`;
CREATE TABLE IF NOT EXISTS `chickengames` LIKE `users`;
CREATE TABLE IF NOT EXISTS `chickendashes` LIKE `users`;
CREATE TABLE IF NOT EXISTS `dailypools` LIKE `users`;
CREATE TABLE IF NOT EXISTS `dailypoolentries` LIKE `users`;
CREATE TABLE IF NOT EXISTS `plinkobets` LIKE `users`;
CREATE TABLE IF NOT EXISTS `cardrounds` LIKE `users`;
CREATE TABLE IF NOT EXISTS `cardbets` LIKE `users`;
CREATE TABLE IF NOT EXISTS `settings` LIKE `users`;
CREATE TABLE IF NOT EXISTS `notifications` LIKE `users`;
CREATE TABLE IF NOT EXISTS `supportthreads` LIKE `users`;
CREATE TABLE IF NOT EXISTS `supportmessages` LIKE `users`;
CREATE TABLE IF NOT EXISTS `helparticles` LIKE `users`;
CREATE TABLE IF NOT EXISTS `commissions` LIKE `users`;
CREATE TABLE IF NOT EXISTS `adminlogs` LIKE `users`;
CREATE TABLE IF NOT EXISTS `feedbacks` LIKE `users`;
CREATE TABLE IF NOT EXISTS `gatewaysessions` LIKE `users`;
CREATE TABLE IF NOT EXISTS `minesgames` LIKE `users`;
CREATE TABLE IF NOT EXISTS `winholds` LIKE `users`;
CREATE TABLE IF NOT EXISTS `gregmornsessions` LIKE `users`;
CREATE TABLE IF NOT EXISTS `gregmorntransactions` LIKE `users`;

SHOW TABLES;
