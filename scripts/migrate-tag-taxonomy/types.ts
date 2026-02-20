export type CanonicalKind = 'topic' | 'substance' | 'treatment' | 'diagnosis';

export type MigrationTag = {
  slug: string;
  name: string;
  kind: CanonicalKind | 'domain';
};

export type MigrationInput = {
  filePath: string;
  stemMd: string;
  explanationMd: string;
  choices: ReadonlyArray<{ text: string }>;
  tags: ReadonlyArray<MigrationTag>;
};

export type ReportMode = 'dry-run' | 'write';

export type MigrationFailure = {
  filePath: string;
  message: string;
};

export type MigrationReport = {
  mode: ReportMode;
  scannedFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  writtenFiles: number;
  failedFiles: number;
  tagCountsByKind: Record<string, number>;
  failures: MigrationFailure[];
};

export type CliArgs = {
  mode: ReportMode;
  reportPath: string | null;
};
