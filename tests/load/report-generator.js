#!/usr/bin/env node

/**
 * Comprehensive Load Test Report Generator
 * Creates detailed HTML and JSON reports from k6 results, worker logs, and coordination data
 *
 * Usage:
 *   node report-generator.js --summary-file summary.json --log-dir /tmp --output report.html
 */

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    summaryFile: null,
    logDir: '/tmp',
    outputHtml: 'load-test-report.html',
    outputJson: 'load-test-report.json',
    coordinationFile: '/tmp/gameday_coordination.json',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--summary-file' && i + 1 < args.length) {
      result.summaryFile = args[i + 1];
      i++;
    } else if (args[i] === '--log-dir' && i + 1 < args.length) {
      result.logDir = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      result.outputHtml = args[i + 1];
      result.outputJson = args[i + 1].replace('.html', '.json');
      i++;
    } else if (args[i] === '--coordination-file' && i + 1 < args.length) {
      result.coordinationFile = args[i + 1];
      i++;
    }
  }

  return result;
}

function readJsonFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Warning: Could not read ${filepath}: ${error.message}`);
    return null;
  }
}

function findLogFiles(logDir) {
  try {
    const files = fs.readdirSync(logDir);
    return files
      .filter((file) => {
        const isWorkerLog = file.startsWith('performer_') || file.startsWith('spectator_') || file.startsWith('orchestrator_');
        return isWorkerLog && file.endsWith('.json');
      })
      .map((file) => path.join(logDir, file));
  } catch (error) {
    console.warn(`Warning: Could not read log directory ${logDir}: ${error.message}`);
    return [];
  }
}

function aggregateWorkerLogs(logFiles) {
  const aggregated = {
    performers: {},
    spectators: {},
    orchestrator: null,
    total_events: 0,
    total_errors: 0,
    issues: [],
  };

  logFiles.forEach((filepath) => {
    const data = readJsonFile(filepath);
    if (!data) return;

    const filename = path.basename(filepath);
    const events = data.events || [];
    const summary = data.summary || {};

    aggregated.total_events += events.length;
    aggregated.total_errors += summary.error_count || 0;

    if (filename.startsWith('performer_')) {
      const performerId = summary.worker_id || filename;
      aggregated.performers[performerId] = {
        gameday_id: summary.gameday_id,
        gameday_name: summary.gameday_name,
        events_count: events.length,
        error_count: summary.error_count || 0,
        response_times: summary.response_time_stats || {},
        events: events,
      };

      // Extract issues
      events.forEach((event) => {
        if (event.error || event.status >= 400) {
          aggregated.issues.push({
            worker: performerId,
            timestamp: event.timestamp,
            action: event.action,
            error: event.error,
            status: event.status,
            gameday_id: summary.gameday_id,
          });
        }
      });
    } else if (filename.startsWith('spectator_')) {
      const spectatorId = summary.worker_id || filename;
      aggregated.spectators[spectatorId] = {
        gameday_id: summary.gameday_id,
        events_count: events.length,
        error_count: summary.error_count || 0,
        response_times: summary.response_time_stats || {},
        events: events,
      };

      events.forEach((event) => {
        if (event.error || event.status >= 400) {
          aggregated.issues.push({
            worker: spectatorId,
            timestamp: event.timestamp,
            action: event.action,
            error: event.error,
            status: event.status,
          });
        }
      });
    } else if (filename.startsWith('orchestrator_')) {
      aggregated.orchestrator = {
        events_count: events.length,
        error_count: summary.error_count || 0,
        events: events,
      };
    }
  });

  return aggregated;
}

function analyzeGamedayData(coordinationData, workerLogs) {
  if (!coordinationData || !coordinationData.gamedays) {
    return { gamedays: [], total_games: 0, games_played: 0 };
  }

  const gamedays = coordinationData.gamedays.map((gameday) => {
    const games = gameday.games || [];
    const gameDetails = games.map((game) => {
      // Find performer events for this game
      const performerEvents = [];
      Object.values(workerLogs.performers).forEach((performer) => {
        if (performer.gameday_id === gameday.id) {
          performer.events.forEach((event) => {
            if (event.game_id === game.id || event.action.includes(game.id)) {
              performerEvents.push(event);
            }
          });
        }
      });

      return {
        id: game.id,
        field: game.field,
        scheduled: game.scheduled,
        home_team: game.homeTeam,
        away_team: game.awayTeam,
        original_status: game.status,
        scoring_attempts: performerEvents.length,
        scoring_errors: performerEvents.filter((e) => e.error).length,
        events: performerEvents,
      };
    });

    return {
      id: gameday.id,
      name: gameday.name,
      date: gameday.date,
      start_time: gameday.start,
      season: gameday.season,
      league: gameday.league,
      total_games: gameDetails.length,
      games_attempted: gameDetails.filter((g) => g.scoring_attempts > 0).length,
      games_with_errors: gameDetails.filter((g) => g.scoring_errors > 0).length,
      games: gameDetails,
    };
  });

  const totalGames = gamedays.reduce((sum, gd) => sum + gd.total_games, 0);
  const gamesAttempted = gamedays.reduce((sum, gd) => sum + gd.games_attempted, 0);

  return {
    gamedays,
    total_games: totalGames,
    games_attempted: gamesAttempted,
  };
}

function generateHtmlReport(report, outputPath) {
  const { coordination, workers, gameday_analysis } = report;
  const timestamp = new Date().toISOString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LeagueSphere Load Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    h1 { font-size: 2.5em; margin-bottom: 10px; }
    .timestamp { opacity: 0.9; font-size: 0.9em; }
    section {
      background: white;
      padding: 30px;
      margin-bottom: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h2 {
      color: #667eea;
      font-size: 1.8em;
      margin-bottom: 20px;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }
    h3 {
      color: #555;
      font-size: 1.3em;
      margin-top: 20px;
      margin-bottom: 15px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .metric-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .metric-value { font-size: 2.5em; font-weight: bold; }
    .metric-label { font-size: 0.9em; opacity: 0.9; margin-top: 5px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #f8f9fa;
      font-weight: 600;
      color: #667eea;
    }
    tr:hover { background: #f8f9fa; }
    .status-success { color: #28a745; font-weight: bold; }
    .status-error { color: #dc3545; font-weight: bold; }
    .status-warning { color: #ffc107; font-weight: bold; }
    .issue-item {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 10px 0;
      border-radius: 4px;
    }
    .issue-item.error {
      background: #f8d7da;
      border-left-color: #dc3545;
    }
    .code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 0.9em;
    }
    .game-table {
      font-size: 0.9em;
    }
    .game-table td {
      padding: 8px;
    }
    .progress-bar {
      background: #ddd;
      height: 20px;
      border-radius: 10px;
      overflow: hidden;
      margin: 10px 0;
    }
    .progress-fill {
      background: linear-gradient(90deg, #28a745, #20c997);
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 0.75em;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #999;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏈 LeagueSphere Load Test Report</h1>
      <div class="timestamp">Generated: ${timestamp}</div>
    </header>

    <!-- Executive Summary -->
    <section>
      <h2>Executive Summary</h2>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${coordination.gamedays?.length || 0}</div>
          <div class="metric-label">Gamedays Tested</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${gameday_analysis.total_games}</div>
          <div class="metric-label">Total Games</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${gameday_analysis.games_attempted}</div>
          <div class="metric-label">Games Attempted</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${workers.total_errors}</div>
          <div class="metric-label">Total Errors</div>
        </div>
      </div>
    </section>

    <!-- Test Configuration -->
    <section>
      <h2>Test Configuration</h2>
      <h3>Coordination Data</h3>
      <table>
        <tr>
          <th>Parameter</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Test Timestamp</td>
          <td><span class="code">${coordination.discovery_time || 'N/A'}</span></td>
        </tr>
        <tr>
          <td>Total VUs</td>
          <td>${Object.keys(workers.performers).length} performers + ${Object.keys(workers.spectators).length} spectators</td>
        </tr>
        <tr>
          <td>Total Events</td>
          <td>${workers.total_events}</td>
        </tr>
      </table>
    </section>

    <!-- Gameday Details -->
    <section>
      <h2>Gameday Results</h2>
      ${gameday_analysis.gamedays
        .map(
          (gd) => `
        <h3>📅 ${gd.name} (ID: ${gd.id})</h3>
        <table>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
          <tr>
            <td>Date</td>
            <td>${gd.date}</td>
          </tr>
          <tr>
            <td>Season</td>
            <td>${gd.season}</td>
          </tr>
          <tr>
            <td>League</td>
            <td>${gd.league}</td>
          </tr>
          <tr>
            <td>Total Games</td>
            <td>${gd.total_games}</td>
          </tr>
          <tr>
            <td>Games with Scoring Attempts</td>
            <td>${gd.games_attempted}</td>
          </tr>
          <tr>
            <td>Games with Errors</td>
            <td class="${gd.games_with_errors > 0 ? 'status-error' : 'status-success'}">${gd.games_with_errors}</td>
          </tr>
        </table>

        <h4>Games Details</h4>
        <table class="game-table">
          <tr>
            <th>Game ID</th>
            <th>Field</th>
            <th>Time</th>
            <th>Home</th>
            <th>Away</th>
            <th>Scoring Attempts</th>
            <th>Errors</th>
            <th>Status</th>
          </tr>
          ${gd.games
            .map(
              (game) => `
            <tr>
              <td>#${game.id}</td>
              <td>${game.field}</td>
              <td>${game.scheduled}</td>
              <td>${game.home_team}</td>
              <td>${game.away_team}</td>
              <td>${game.scoring_attempts}</td>
              <td class="${game.scoring_errors > 0 ? 'status-error' : 'status-success'}">${game.scoring_errors}</td>
              <td>${game.original_status}</td>
            </tr>
          `
            )
            .join('')}
        </table>
      `
        )
        .join('')}
    </section>

    <!-- Issues & Errors -->
    <section>
      <h2>Issues & Errors</h2>
      ${
        workers.issues.length === 0
          ? '<p class="status-success">✓ No issues detected</p>'
          : `
        <p><strong>${workers.issues.length} issue(s) found:</strong></p>
        ${workers.issues
          .slice(0, 50)
          .map(
            (issue) => `
          <div class="issue-item ${issue.error ? 'error' : ''}">
            <strong>${issue.action}</strong> (${issue.worker})<br>
            <small>${issue.timestamp}</small><br>
            ${issue.error ? `<span class="status-error">Error: ${issue.error}</span>` : ''}
            ${issue.status ? `<span class="code">Status ${issue.status}</span>` : ''}
          </div>
        `
          )
          .join('')}
        ${workers.issues.length > 50 ? `<p><em>... and ${workers.issues.length - 50} more issues</em></p>` : ''}
      `
      }
    </section>

    <!-- Performance Metrics -->
    <section>
      <h2>Performance Metrics</h2>
      <h3>Performers</h3>
      ${
        Object.keys(workers.performers).length === 0
          ? '<p>No performer data available</p>'
          : `
        <table>
          <tr>
            <th>Performer</th>
            <th>Events</th>
            <th>Errors</th>
            <th>Avg Response (ms)</th>
            <th>p95 (ms)</th>
            <th>p99 (ms)</th>
          </tr>
          ${Object.entries(workers.performers)
            .map(
              ([id, perf]) => `
            <tr>
              <td>${id}</td>
              <td>${perf.events_count}</td>
              <td class="${perf.error_count > 0 ? 'status-error' : 'status-success'}">${perf.error_count}</td>
              <td>${perf.response_times.avg || 'N/A'}</td>
              <td>${perf.response_times.p95 || 'N/A'}</td>
              <td>${perf.response_times.p99 || 'N/A'}</td>
            </tr>
          `
            )
            .join('')}
        </table>
      `
      }
    </section>

    <footer class="footer">
      <p>Load test report generated by LeagueSphere K6 Orchestrator</p>
    </footer>
  </div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
  console.log(`✓ HTML report written to: ${outputPath}`);
}

function generateJsonReport(report, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`✓ JSON report written to: ${outputPath}`);
}

function main() {
  const args = parseArgs();

  console.log('🔍 Generating comprehensive load test report...');
  console.log(`   Log directory: ${args.logDir}`);
  console.log(`   Coordination file: ${args.coordinationFile}`);
  console.log('');

  // Read coordination data
  const coordination = readJsonFile(args.coordinationFile) || {};
  console.log(`✓ Loaded coordination data with ${coordination.gamedays?.length || 0} gameday(s)`);

  // Aggregate worker logs
  const logFiles = findLogFiles(args.logDir);
  console.log(`✓ Found ${logFiles.length} log file(s)`);

  const workers = aggregateWorkerLogs(logFiles);
  console.log(`✓ Aggregated logs: ${Object.keys(workers.performers).length} performers, ${Object.keys(workers.spectators).length} spectators`);
  console.log(`  Total events: ${workers.total_events}, Total errors: ${workers.total_errors}`);

  // Analyze gameday data
  const gameday_analysis = analyzeGamedayData(coordination, workers);
  console.log(`✓ Analyzed ${gameday_analysis.gamedays.length} gameday(s) with ${gameday_analysis.total_games} game(s)`);

  // Build comprehensive report
  const report = {
    timestamp: new Date().toISOString(),
    coordination,
    workers,
    gameday_analysis,
  };

  // Generate reports
  generateHtmlReport(report, args.outputHtml);
  generateJsonReport(report, args.outputJson);

  console.log('');
  console.log('✅ Report generation complete!');
  console.log(`📊 HTML: ${args.outputHtml}`);
  console.log(`📄 JSON: ${args.outputJson}`);
}

main();
