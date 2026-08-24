/* Backend-owned input horizons attached to individual Diagnose shapes. */
const wallClock = (value) => {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth
    && hour <= 23 && minute <= 59 && second <= 59;
};

export function validInputDataAge(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === (Object.hasOwn(value, 'newest_covers_to') ? 3 : 2)
    && ['revision', 'covers_to'].every((key) => Object.hasOwn(value, key))
    && keys.every((key) => ['revision', 'covers_to', 'newest_covers_to'].includes(key))
    && Number.isInteger(value.revision) && value.revision >= 0
    && wallClock(value.covers_to)
    && (!Object.hasOwn(value, 'newest_covers_to') || wallClock(value.newest_covers_to));
}

export function recordDiagnoseAge(ages, shape, payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    delete ages[shape];
    return null;
  }
  if (!Object.hasOwn(payload, 'input_data_age')) {
    delete ages[shape];
    return payload;
  }
  if (!validInputDataAge(payload.input_data_age)) {
    delete ages[shape];
    return null;
  }
  ages[shape] = payload.input_data_age;
  const { input_data_age, ...display } = payload;
  return display;
}

export function resetDiagnoseAges(ages) {
  for (const shape of Object.keys(ages)) delete ages[shape];
}
