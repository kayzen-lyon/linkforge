/**
 * Reading a list of URLs and working through it with bounded concurrency.
 */
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

/** URLs from a text stream: one per line, blank lines and `#` comments skipped. */
export async function* readUrlLines(input: Readable): AsyncGenerator<string> {
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    for await (const line of lines) {
      const url = line.trim();
      if (url === '' || url.startsWith('#')) continue;
      yield url;
    }
  } finally {
    lines.close();
  }
}

/**
 * Runs `worker` over `source` with at most `limit` calls in flight, and hands
 * each result to `emit` in the order of the input, one at a time.
 *
 * The source is pulled lazily and no more than `limit * 4` items are ever
 * outstanding (in flight, or done and waiting for an earlier one), so a long
 * list on standard input is never held in memory, even behind one slow URL.
 * `worker` is expected to turn its own failures into results; if it throws
 * anyway, no new item is started and the error is rethrown once the calls in
 * flight have settled.
 */
export async function mapOrdered<T, R>(
  source: AsyncIterable<T> | Iterable<T>,
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  emit: (result: R, index: number) => void | Promise<void>,
): Promise<number> {
  const iterator =
    Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  const lanes = Math.max(1, Math.floor(limit));
  const window = lanes * 4;
  const ready = new Map<number, R>();
  let progress: (() => void) | undefined;
  let pulled = 0;
  let emitted = 0;
  let done = false;
  let failure: { error: unknown } | undefined;
  // Serialises both the pulls from the source and the emissions.
  let pulling: Promise<unknown> = Promise.resolve();
  let emitting: Promise<void> = Promise.resolve();

  const next = (): Promise<{ item: T; index: number } | undefined> => {
    const turn = pulling.then(async () => {
      // Back-pressure: wait for the output to catch up with the input.
      while (pulled - emitted >= window && failure === undefined) {
        await new Promise<void>((resume) => {
          progress = resume;
        });
      }
      if (done || failure !== undefined) return undefined;
      const step = await iterator.next();
      if (step.done === true) {
        done = true;
        return undefined;
      }
      const index = pulled;
      pulled += 1;
      return { item: step.value, index };
    });
    pulling = turn.catch(() => undefined);
    return turn;
  };

  const flush = (): Promise<void> => {
    emitting = emitting.then(async () => {
      while (ready.has(emitted)) {
        const result = ready.get(emitted) as R;
        ready.delete(emitted);
        const index = emitted;
        emitted += 1;
        await emit(result, index);
        progress?.();
      }
    });
    return emitting;
  };

  const lane = async (): Promise<void> => {
    try {
      for (let job = await next(); job !== undefined; job = await next()) {
        ready.set(job.index, await worker(job.item, job.index));
        await flush();
      }
    } catch (error) {
      failure ??= { error };
      progress?.();
    }
  };

  await Promise.all(Array.from({ length: lanes }, lane));
  if (failure !== undefined) throw failure.error;
  return emitted;
}
