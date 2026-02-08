/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.5-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: test_db
-- ------------------------------------------------------
-- Server version	11.8.5-MariaDB-ubu2404

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Dumping data for table `gamedays_league`
--

LOCK TABLES `gamedays_league` WRITE;
/*!40000 ALTER TABLE `gamedays_league` DISABLE KEYS */;
INSERT INTO `gamedays_league` VALUES
(1,'Test League');
/*!40000 ALTER TABLE `gamedays_league` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `gamedays_season`
--

LOCK TABLES `gamedays_season` WRITE;
/*!40000 ALTER TABLE `gamedays_season` DISABLE KEYS */;
INSERT INTO `gamedays_season` VALUES
(1,'2025');
/*!40000 ALTER TABLE `gamedays_season` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `gamedays_team`
--

LOCK TABLES `gamedays_team` WRITE;
/*!40000 ALTER TABLE `gamedays_team` DISABLE KEYS */;
INSERT INTO `gamedays_team` VALUES
(1,'Team 1','Team 1','','',NULL),
(2,'Team 2','Team 2','','',NULL),
(3,'Team 3','Team 3','','',NULL),
(4,'Team 4','Team 4','','',NULL),
(5,'Team 5','Team 5','','',NULL),
(6,'Team 6','Team 6','','',NULL),
(7,'Test Placeholder','Test Placeholder','','',NULL),
(8,'A1','A1','dummy','',NULL),
(9,'A2','A2','dummy','',NULL),
(10,'A3','F','dummy','',NULL),
(11,'B1','B1','dummy','',NULL),
(12,'B2','B2','dummy','',NULL),
(13,'B3','B3','dummy','',NULL),
(14,'P3 Gruppe 2','P3 Gruppe 2','dummy','',NULL),
(15,'P3 Gruppe 1','P3 Gruppe 1','dummy','',NULL),
(16,'P2 Gruppe 2','P2 Gruppe 2','dummy','',NULL),
(17,'P2 Gruppe 1','P2 Gruppe 1','dummy','',NULL),
(18,'P1 Gruppe 2','P1 Gruppe 2','dummy','',NULL),
(19,'P1 Gruppe 1','P1 Gruppe 1','dummy','',NULL),
(20,'Gewinner HF1','Gewinner HF1','dummy','',NULL),
(31,'Gewinner HF2','Gewinner HF2','dummy','',NULL),
(32,'Gewinner P3','Gewinner P3','dummy','',NULL),
(33,'Verlierer HF1','Verlierer HF1','dummy','',NULL),
(34,'Verlierer HF2','Verlierer HF2','dummy','',NULL),
(35,'Verlierer P3','Verlierer P3','dummy','',NULL),
(36,'P4 Gruppe 1','P4 Gruppe 1','dummy','',NULL);
/*!40000 ALTER TABLE `gamedays_team` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `gamedays_gameinfo`
--

LOCK TABLES `gamedays_gameinfo` WRITE;
/*!40000 ALTER TABLE `gamedays_gameinfo` DISABLE KEYS */;
INSERT INTO `gamedays_gameinfo` VALUES
(21,'10:00:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','A Game 1',4,3,NULL,NULL,NULL,NULL,0),
(22,'11:20:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','A Game 2',4,2,NULL,NULL,NULL,NULL,0),
(23,'12:40:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','A Game 3',4,1,NULL,NULL,NULL,NULL,0),
(24,'14:00:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','B Game 1',4,6,NULL,NULL,NULL,NULL,0),
(25,'15:20:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','B Game 2',4,5,NULL,NULL,NULL,NULL,0),
(26,'16:40:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','B Game 3',4,4,NULL,NULL,NULL,NULL,0),
(27,'18:00:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','SF1',4,1,NULL,NULL,NULL,NULL,0),
(28,'19:20:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','SF2',4,2,NULL,NULL,NULL,NULL,0),
(29,'22:00:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','Final',4,3,NULL,NULL,NULL,NULL,0),
(30,'20:40:00.000000',1,'Geplant',NULL,NULL,NULL,'Preliminary','3rd Place',4,4,NULL,NULL,NULL,NULL,0);
/*!40000 ALTER TABLE `gamedays_gameinfo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `gamedays_gameresult`
--

LOCK TABLES `gamedays_gameresult` WRITE;
/*!40000 ALTER TABLE `gamedays_gameresult` DISABLE KEYS */;
INSERT INTO `gamedays_gameresult` VALUES
(41,NULL,NULL,NULL,1,21,1),
(42,NULL,NULL,NULL,0,21,2),
(43,NULL,NULL,NULL,1,22,3),
(44,NULL,NULL,NULL,0,22,1),
(45,NULL,NULL,NULL,1,23,2),
(46,NULL,NULL,NULL,0,23,3),
(47,NULL,NULL,NULL,1,24,4),
(48,NULL,NULL,NULL,0,24,5),
(49,NULL,NULL,NULL,1,25,6),
(50,NULL,NULL,NULL,0,25,4),
(51,NULL,NULL,NULL,1,26,5),
(52,NULL,NULL,NULL,0,26,6),
(53,NULL,NULL,NULL,1,27,NULL),
(54,NULL,NULL,NULL,0,27,NULL),
(55,NULL,NULL,NULL,1,28,NULL),
(56,NULL,NULL,NULL,0,28,NULL),
(57,NULL,NULL,NULL,1,29,NULL),
(58,NULL,NULL,NULL,0,29,NULL),
(59,NULL,NULL,NULL,1,30,NULL),
(60,NULL,NULL,NULL,0,30,NULL);
/*!40000 ALTER TABLE `gamedays_gameresult` ENABLE KEYS */;
UNLOCK TABLES;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-02-08 23:15:00
