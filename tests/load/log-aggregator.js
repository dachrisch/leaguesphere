#!/usr/bin/env node

/**
 * Log Aggregator - Post-test aggregation script for gameday load test logs
 * Combines individual worker logs into gameday-centric summaries
 *
 * Usage:
 *   node log-aggregator.js --log-dir /tmp --output aggregated.json
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse command-line arguments
 * @returns {Object} Parsed arguments with logDir and output properties
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    logDir: '/tmp',
    output: 'aggregated-logs.json',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--log-dir' && i + 1 < args.length) {
      result.logDir = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      result.output = args[i + 1];
      i++;
    }
  }

  return result;
}

/**
 * Read and parse a JSON log file
 * @param {string} filepath - Path to the log file
 * @returns {Object|null} Parsed JSON object, or null if error occurs
 */
function readLogFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading/parsing log file ${filepath}: ${error.message}`);
    return null;
  }
}

/**
 * Find all performer and spectator log files in a directory
 * @param {string} logDir - Directory to search for log files
 * @returns {string[]} Array of full file paths matching the pattern
 */
function findLogFiles(logDir) {
  try {
    const files = fs.readdirSync(logDir);
    return files
      .filter((file) => {
        const startsWithPerformerOrSpectator = file.startsWith('performer_') || file.startsWith('spectator_');
        const endsWithJson = file.endsWith('.json');
        return startsWithPerformerOrSpectator && endsWithJson;
      })
      .map((file) => path.join(logDir, file));
  } catch (error) {
    console.error(`Error reading directory ${logDir}: ${error.message}`);
    return [];
  }
}

/**
 * Aggregate logs by gameday
 * @param {string[]} logFiles - Array of log file paths
 * @returns {Object} Aggregated summaries keyed by gameday ID
 */
function aggregateByGameday(logFiles) {
  const gamedaySummaries = {};

  logFiles.forEach((logFile) => {
    const logData = readLogFile(logFile);
    if (!logData) {
      return; // Skip files that failed to parse
    }

    const metadata = logData.metadata || {};
    const summary = logData.summary || {};
    const events = logData.events || [];

    const gamedayId = metadata.gameday_id;
    const gamedayName = metadata.gameday_name;
    const workerId = metadata.worker_id;
    const isPerformer = workerId && workerId.toString().startsWith('performer_');
    const errorCount = summary.error_count || 0;

    // Initialize gameday summary if needed
    if (!gamedaySummaries[gamedayId]) {
      gamedaySummaries[gamedayId] = {
        gameday_id: gamedayId,
        gameday_name: gamedayName,
        test_window: {
          start: metadata.start_time,
          end: metadata.end_time,
        },
        performers: {},
        spectators: [],
        metrics: {
          total_vus: 0,
          total_api_calls: 0,
          total_errors: 0,
        },
        anomalies: [],
      };
    }

    // Process logs based on worker type
    if (isPerformer) {
      gamedaySummaries[gamedayId].performers[workerId] = {
        worker_id: workerId,
        status: 'completed',
        events: events.length,
        error_count: errorCount,
      };

      if (summary.response_time_stats) {
        gamedaySummaries[gamedayId].performers[workerId].response_time_stats = summary.response_time_stats;
      }
    } else {
      gamedaySummaries[gamedayId].spectators.push({
        worker_id: workerId,
        status: 'completed',
        events: events.length,
        error_count: errorCount,
      });

      if (summary.response_time_stats) {
        gamedaySummaries[gamedayId].spectators[gamedaySummaries[gamedayId].spectators.length - 1].response_time_stats =
          summary.response_time_stats;
      }
    }

    // Update metrics
    gamedaySummaries[gamedayId].metrics.total_vus += 1;
    gamedaySummaries[gamedayId].metrics.total_api_calls += events.length;
    gamedaySummaries[gamedayId].metrics.total_errors += errorCount;

    // Collect anomalies (events with errors)
    if (errorCount > 0) {
      events.forEach((event) => {
        if (event.error) {
          gamedaySummaries[gamedayId].anomalies.push({
            worker_id: workerId,
            timestamp: event.timestamp,
            action: event.action,
            error: event.error,
          });
        }
      });
    }
  });

  return gamedaySummaries;
}

/**
 * Write aggregated results to output file
 * @param {Object} aggregated - Aggregated gameday summaries
 * @param {string} outputPath - Path to write the output file
 */
function writeOutput(aggregated, outputPath) {
  try {
    const output = {
      test_run_time: new Date().toISOString(),
      total_gamedays: Object.keys(aggregated).length,
      gamedays: aggregated,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    // Calculate summary statistics
    const performerCount = Object.values(aggregated).reduce((sum, gameday) => sum + Object.keys(gameday.performers).length, 0);
    const spectatorCount = Object.values(aggregated).reduce((sum, gameday) => sum + gameday.spectators.length, 0);

    console.log(`\nLog aggregation complete!`);
    console.log(`Output written to: ${outputPath}`);
    console.log(`Total gamedays: ${Object.keys(aggregated).length}`);
    console.log(`Total performers: ${performerCount}`);
    console.log(`Total spectators: ${spectatorCount}`);
  } catch (error) {
    console.error(`Error writing output file ${outputPath}: ${error.message}`);
  }
}

/**
 * Main script execution
 */
function main() {
  const args = parseArgs();

  console.log(`Searching for log files in: ${args.logDir}`);
  const logFiles = findLogFiles(args.logDir);

  if (logFiles.length === 0) {
    console.log('No log files found. Exiting.');
    process.exit(0);
  }

  console.log(`Found ${logFiles.length} log file(s)`);

  const aggregated = aggregateByGameday(logFiles);

  if (Object.keys(aggregated).length === 0) {
    console.log('No valid logs to aggregate. Exiting.');
    process.exit(0);
  }

  writeOutput(aggregated, args.output);
}

main();
