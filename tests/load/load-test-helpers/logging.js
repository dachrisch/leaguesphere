// tests/load/load-test-helpers/logging.js

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
