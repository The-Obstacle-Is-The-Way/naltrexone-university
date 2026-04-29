import { beforeAll, beforeEach, vi } from 'vitest';

type ReportClientErrorModule = typeof import('@/lib/report-client-error');
type ShouldReportClientError =
  ReportClientErrorModule['shouldReportClientError'];

export function installReportClientErrorMocks(
  reportClientError: ReportClientErrorModule,
): void {
  let shouldReportClientErrorActual: ShouldReportClientError;

  beforeAll(async () => {
    shouldReportClientErrorActual = (
      await vi.importActual<ReportClientErrorModule>(
        '@/lib/report-client-error',
      )
    ).shouldReportClientError;
  });

  beforeEach(() => {
    vi.mocked(reportClientError.reportClientError).mockImplementation(
      () => undefined,
    );
    vi.mocked(reportClientError.shouldReportClientError).mockImplementation(
      shouldReportClientErrorActual,
    );
  });
}
