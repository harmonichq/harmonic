/* Backend-owned input horizons attached to individual Diagnose shapes. */
export function recordDiagnoseAge(ages, shape, payload) {
  if (payload?.input_data_age) ages[shape] = payload.input_data_age;
  else delete ages[shape];
  return payload;
}

export function resetDiagnoseAges(ages) {
  for (const shape of Object.keys(ages)) delete ages[shape];
}
