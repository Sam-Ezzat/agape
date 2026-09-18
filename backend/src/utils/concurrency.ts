/**
 * Concurrency Utilities
 *
 * WHY: Some auto-assignment stages call external APIs (OpenAI) once per
 * attendee/batch. Awaiting them one at a time in a for-loop is safe but
 * turns into serial network latency — for a few hundred attendees that
 * alone can push total execution past client-side HTTP timeouts. Running
 * them with a bounded concurrency limit keeps wall-clock time down without
 * firing unbounded parallel requests that would trip provider rate limits.
 */

/**
 * Map over items with at most `limit` in-flight calls to `fn` at a time.
 * Results are returned in the same order as `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
