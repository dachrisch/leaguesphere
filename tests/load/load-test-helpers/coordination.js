// tests/load/load-test-helpers/coordination.js

import { open, writeFile } from 'k6/fs';
import { fail } from 'k6';

const COORDINATION_FILE = '/tmp/gameday_assignments.json';

export function writeCoordinationFile(gamedays) {
  /**
   * Write gameday assignments to JSON file for performers/spectators to read
   * @param {Array} gamedays - Array of gameday objects with games
   */
  try {
    const content = JSON.stringify({
      timestamp: new Date().toISOString(),
      gamedays: gamedays,
    }, null, 2);

    writeFile(COORDINATION_FILE, content);
    console.log(`Coordination file written to ${COORDINATION_FILE}`);
  } catch (error) {
    fail(`Failed to write coordination file: ${error.message}`);
  }
}

export function readCoordinationFile() {
  /**
   * Read gameday assignments from coordination file
   * @returns {Object} {timestamp, gamedays: Array}
   */
  try {
    const content = open(COORDINATION_FILE);
    return JSON.parse(content);
  } catch (error) {
    fail(`Failed to read coordination file: ${error.message}`);
  }
}

export function assignGamedayToPerformer(gameday, performerIndex) {
  /**
   * Assign a gameday to a specific performer worker
   * @param {Object} gameday - Gameday object
   * @param {number} performerIndex - Performer worker index (0-based)
   * @returns {Object} Gameday with performer assignment
   */
  return {
    ...gameday,
    assigned_performer: `performer_${performerIndex}`,
  };
}

export function assignSpectatorsToGameday(gameday, spectatorCount) {
  /**
   * Assign spectators to a gameday (1-10 per gameday)
   * @param {Object} gameday - Gameday object
   * @param {number} spectatorCount - Number of spectators for this gameday
   * @returns {Object} Gameday with spectator assignments
   */
  const spectators = [];
  for (let i = 0; i < spectatorCount; i++) {
    spectators.push(`spectator_${gameday.id}_${i}`);
  }
  return {
    ...gameday,
    assigned_spectators: spectators,
  };
}
