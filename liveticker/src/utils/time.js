const TIME_ONLY = /^\d{2}:\d{2}$/;

const toLocalTime = (utcTime) => {
  if (!utcTime) {
    return '';
  }
  if (TIME_ONLY.test(utcTime)) {
    // Scheduled games carry a human-entered local wall-clock "HH:MM";
    // it is already local and must pass through unchanged. Detecting it by
    // shape instead of trying to parse it as a Date keeps the behavior
    // independent of engine-specific date parsing (ECMA-262 only guarantees
    // parsing for full ISO date-time strings).
    return utcTime;
  }
  const date = new Date(utcTime);
  if (Number.isNaN(date.getTime())) {
    return utcTime;
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export default toLocalTime;