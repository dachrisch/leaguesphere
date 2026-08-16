const toLocalTime = (utcTime) => {
  if (!utcTime) {
    return '';
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