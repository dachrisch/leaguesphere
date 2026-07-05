/**
 * Keep only the digit characters of a value.
 *
 * Used to constrain jersey-number inputs to non-negative integers so a decimal
 * (e.g. '51.85') can never be entered and later break the backend (#1465).
 *
 * @param {*} value raw input value
 * @return {string} the value with every non-digit character removed
 */
export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');
