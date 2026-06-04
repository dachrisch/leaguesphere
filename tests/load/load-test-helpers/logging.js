// tests/load/load-test-helpers/logging.js

/**
 * WorkerLogger - Per-worker structured logging with JSON output
 * Tracks events with timestamps, actions, and metrics for load test analysis
 */
export class WorkerLogger {
  /**
   * Constructor for WorkerLogger
   * @param {number} workerId - Unique worker/VU identifier
   * @param {number} gamedayId - Associated gameday ID
   * @param {string} gamedayName - Associated gameday name
   * @param {string} logDir - Log directory (default: /tmp)
   */
  constructor(workerId, gamedayId, gamedayName, logDir = '/tmp') {
    this.workerId = workerId;
    this.gamedayId = gamedayId;
    this.gamedayName = gamedayName;
    this.logDir = logDir;
    this.events = [];
    this.startTime = new Date().toISOString();
  }

  /**
   * Log an event with timestamp and details
   * @param {string} action - Action being logged (e.g., 'game_setup', 'event_recorded')
   * @param {Object} details - Additional event details
   */
  logEvent(action, details = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      action,
      ...details,
    };
    this.events.push(event);
    console.log(`[Worker ${this.workerId}] [${action}] ${JSON.stringify(details)}`);
  }

  /**
   * Get summary statistics for all logged events
   * @returns {Object} Summary with action counts, errors, and response time percentiles
   */
  getSummary() {
    // Count actions
    const actionCounts = {};
    const responseTimes = [];
    let errorCount = 0;

    this.events.forEach((evt) => {
      // Count actions
      if (evt.action) {
        actionCounts[evt.action] = (actionCounts[evt.action] || 0) + 1;
      }

      // Track errors
      if (evt.error) {
        errorCount++;
      }

      // Collect response times
      if (evt.response_time !== undefined && typeof evt.response_time === 'number') {
        responseTimes.push(evt.response_time);
      }
    });

    // Calculate response time percentiles
    const responseTimeStats = this.calculatePercentiles(responseTimes);

    return {
      worker_id: this.workerId,
      gameday_id: this.gamedayId,
      gameday_name: this.gamedayName,
      start_time: this.startTime,
      end_time: new Date().toISOString(),
      total_events: this.events.length,
      action_counts: actionCounts,
      error_count: errorCount,
      response_time_stats: responseTimeStats,
    };
  }

  /**
   * Calculate percentiles for an array of values
   * @private
   * @param {number[]} values - Array of numeric values
   * @returns {Object} Object with min, max, avg, p50, p95, p99
   */
  calculatePercentiles(values) {
    if (values.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = values.sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;

    const p50Index = Math.floor((50 / 100) * sorted.length);
    const p95Index = Math.floor((95 / 100) * sorted.length);
    const p99Index = Math.floor((99 / 100) * sorted.length);

    return {
      min: parseFloat(min.toFixed(2)),
      max: parseFloat(max.toFixed(2)),
      avg: parseFloat(avg.toFixed(2)),
      p50: parseFloat(sorted[p50Index].toFixed(2)),
      p95: parseFloat(sorted[p95Index].toFixed(2)),
      p99: parseFloat(sorted[p99Index].toFixed(2)),
    };
  }

  /**
   * Flush logs (in k6, actual file I/O is handled externally via open())
   * Log a message about flushing for debugging
   */
  flush() {
    console.log(
      `[Worker ${this.workerId}] Flushing logs to ${this.logDir}/worker_${this.workerId}_gameday_${this.gamedayId}.json`
    );
  }

  /**
   * Get the full events array as JSON for post-test aggregation
   * @returns {Object} Complete event log in JSON format
   */
  getEventsJson() {
    return {
      metadata: {
        worker_id: this.workerId,
        gameday_id: this.gamedayId,
        gameday_name: this.gamedayName,
        log_dir: this.logDir,
        start_time: this.startTime,
        end_time: new Date().toISOString(),
      },
      events: this.events,
      summary: this.getSummary(),
    };
  }
}

/**
 * Factory function to create a new WorkerLogger instance
 * @param {number} workerId - Unique worker/VU identifier
 * @param {number} gamedayId - Associated gameday ID
 * @param {string} gamedayName - Associated gameday name
 * @param {string} logDir - Log directory (default: /tmp)
 * @returns {WorkerLogger} New WorkerLogger instance
 */
export function createWorkerLogger(workerId, gamedayId, gamedayName, logDir = '/tmp') {
  return new WorkerLogger(workerId, gamedayId, gamedayName, logDir);
}

// Legacy logging functions for backward compatibility
export function logRequest(method, url, status, duration, context = '') {
  /**
   * Log HTTP request details for analysis
   * @param {string} method - HTTP method (GET, POST, PUT, etc.)
   * @param {string} url - Request URL
   * @param {number} status - Response status code
   * @param {number} duration - Request duration in milliseconds
   * @param {string} context - Additional context (phase, operation, etc.)
   */
  const timestamp = new Date().toISOString();
  const logLevel = status < 400 ? 'INFO' : status >= 500 ? 'ERROR' : 'WARN';

  console.log(`[${timestamp}] [${logLevel}] ${method} ${url} - Status: ${status} (${duration}ms) ${context ? `- ${context}` : ''}`);
}

export function logPhase(phase, action, details = '') {
  /**
   * Log phase-level events
   * @param {string} phase - Phase name (Setup, Performers, Spectators)
   * @param {string} action - Action being performed
   * @param {string} details - Additional details
   */
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [PHASE] ${phase} > ${action} ${details ? `(${details})` : ''}`);
}

export function logVU(message) {
  /**
   * Log VU-level events
   * @param {string} message - Message to log
   */
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [VU-${__VU}] ${message}`);
}

export function logError(operation, status, body, context = '') {
  /**
   * Log error details for debugging
   * @param {string} operation - Operation that failed
   * @param {number} status - Status code
   * @param {string} body - Response body
   * @param {string} context - Additional context
   */
  const timestamp = new Date().toISOString();
  const truncated = body ? body.substring(0, 200) : 'N/A';
  console.error(`[${timestamp}] [ERROR] ${operation} failed with status ${status}`);
  if (truncated) {
    console.error(`         Response: ${truncated}${body && body.length > 200 ? '...' : ''}`);
  }
  if (context) {
    console.error(`         Context: ${context}`);
  }
}

export function logSummary(phase, successCount, failureCount, avgDuration) {
  /**
   * Log summary statistics for a phase
   * @param {string} phase - Phase name
   * @param {number} successCount - Number of successful operations
   * @param {number} failureCount - Number of failed operations
   * @param {number} avgDuration - Average request duration in milliseconds
   */
  const timestamp = new Date().toISOString();
  const total = successCount + failureCount;
  const successRate = total > 0 ? ((successCount / total) * 100).toFixed(2) : 0;

  console.log(`[${timestamp}] [SUMMARY] ${phase}`);
  console.log(`           Success: ${successCount}/${total} (${successRate}%)`);
  console.log(`           Failures: ${failureCount}/${total}`);
  console.log(`           Avg Duration: ${avgDuration.toFixed(2)}ms`);
}
