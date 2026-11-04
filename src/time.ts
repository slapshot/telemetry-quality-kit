/** Epoch milliseconds are used internally. ISO strings must include UTC/offset. */
export type Timestamp = number | Date | string;

const ZONED_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function toEpochMs(value: Timestamp, label: string): number {
  if (typeof value === 'string' && !ZONED_ISO.test(value)) {
    throw new RangeError(`${label} must be an ISO 8601 timestamp with timezone`);
  }
  const result = typeof value === 'number' ? value : value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must be a valid epoch-millisecond timestamp`);
  }
  return result;
}
