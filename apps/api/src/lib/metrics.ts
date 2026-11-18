/**
 * In-process metrics in the Prometheus text exposition format.
 *
 * A few counters, one histogram and gauges read at scrape time: no client
 * library is needed for that. Label values are bounded by construction
 * (route patterns, methods, status codes), so the series count cannot be
 * driven up by callers. Values live in memory, per instance.
 */

const DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60] as const;

interface Histogram {
  readonly buckets: number[];
  sum: number;
  count: number;
}

export interface GaugeSource {
  readonly name: string;
  readonly help: string;
  read(): number;
}

const escapeLabel = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const labels = (pairs: Readonly<Record<string, string>>): string =>
  `{${Object.entries(pairs).map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;

export class Metrics {
  private readonly requests = new Map<string, number>();
  private readonly durations = new Map<string, Histogram>();
  private readonly cache = { hit: 0, miss: 0 };
  private readonly gauges: GaugeSource[] = [];

  /** Registers a value read at each scrape (pool size, open circuits…). */
  gauge(source: GaugeSource): void {
    this.gauges.push(source);
  }

  /**
   * Records one finished request.
   *
   * @param route - Route pattern (`/api/v1/meta`), never the raw URL.
   */
  observe(route: string, method: string, status: number, seconds: number, cache: 'hit' | 'miss' | null): void {
    const key = JSON.stringify([route, method, String(status)]);
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
    let histogram = this.durations.get(route);
    if (histogram === undefined) {
      histogram = { buckets: DURATION_BUCKETS.map(() => 0), sum: 0, count: 0 };
      this.durations.set(route, histogram);
    }
    DURATION_BUCKETS.forEach((limit, index) => {
      if (seconds <= limit) histogram.buckets[index] = (histogram.buckets[index] ?? 0) + 1;
    });
    histogram.sum += seconds;
    histogram.count += 1;
    if (cache !== null) this.cache[cache] += 1;
  }

  /** The exposition document. */
  render(): string {
    const lines: string[] = [
      '# HELP omnillink_http_requests_total Requests answered, by route pattern, method and status.',
      '# TYPE omnillink_http_requests_total counter',
    ];
    for (const [key, value] of this.requests) {
      const [route = '', method = '', status = ''] = JSON.parse(key) as string[];
      lines.push(`omnillink_http_requests_total${labels({ route, method, status })} ${value}`);
    }
    lines.push(
      '# HELP omnillink_http_request_duration_seconds Time to answer, by route pattern.',
      '# TYPE omnillink_http_request_duration_seconds histogram',
    );
    for (const [route, histogram] of this.durations) {
      DURATION_BUCKETS.forEach((limit, index) => {
        lines.push(`omnillink_http_request_duration_seconds_bucket${labels({ route, le: String(limit) })} ${histogram.buckets[index] ?? 0}`);
      });
      lines.push(
        `omnillink_http_request_duration_seconds_bucket${labels({ route, le: '+Inf' })} ${histogram.count}`,
        `omnillink_http_request_duration_seconds_sum${labels({ route })} ${histogram.sum.toFixed(6)}`,
        `omnillink_http_request_duration_seconds_count${labels({ route })} ${histogram.count}`,
      );
    }
    lines.push(
      '# HELP omnillink_cache_answers_total Cacheable answers, served from the server cache or computed.',
      '# TYPE omnillink_cache_answers_total counter',
      `omnillink_cache_answers_total${labels({ result: 'hit' })} ${this.cache.hit}`,
      `omnillink_cache_answers_total${labels({ result: 'miss' })} ${this.cache.miss}`,
    );
    for (const gauge of this.gauges) {
      const value = gauge.read();
      lines.push(`# HELP ${gauge.name} ${gauge.help}`, `# TYPE ${gauge.name} gauge`, `${gauge.name} ${Number.isFinite(value) ? value : 0}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
