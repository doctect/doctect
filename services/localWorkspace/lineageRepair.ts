import { digestWorkspaceContent } from './canonical';
import type { WorkspaceSnapshot } from './contracts';
import {
  reconstructWorkspace,
  reconstructWorkspaceRecords,
  WorkspaceMigrationError,
  type WorkspaceRecordCandidates,
  type WorkspaceRecords,
} from './migration';
import {
  WORKSPACE_DB_VERSION,
  type HistoricalMigrationLedgerV1,
  type MigrationLedger,
  type StoredProject,
} from './schema';

export interface LineageRepairPreparationEnvironment {
  crypto: Pick<Crypto, 'subtle'>;
  randomUUID(): string;
}

export interface ExpectedLineageRepairProject {
  id: string;
  record: unknown;
}

export interface PreparedLineageRepair {
  expectedLedger: HistoricalMigrationLedgerV1;
  expectedProjects: ExpectedLineageRepairProject[];
  replacementProjects: StoredProject[];
  ledger: MigrationLedger;
  snapshot: WorkspaceSnapshot;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const targetError = (message: string, cause?: unknown): WorkspaceMigrationError =>
  new WorkspaceMigrationError(message, 'target-invalid', undefined, undefined, cause);

const generatedIncarnation = (
  environment: LineageRepairPreparationEnvironment,
  index: number,
): string => {
  const incarnation = environment.randomUUID();
  if (typeof incarnation !== 'string' || incarnation.length === 0) {
    throw targetError(`Project record ${index} generated incarnation must be non-empty.`);
  }
  return incarnation;
};

export async function prepareLineageRepair(
  ledger: HistoricalMigrationLedgerV1,
  records: WorkspaceRecordCandidates,
  environment: LineageRepairPreparationEnvironment,
): Promise<PreparedLineageRepair> {
  if (!Array.isArray(records.projects)) {
    throw targetError('Project records must be an array.');
  }

  const expectedRawProjects = structuredClone(records.projects);
  const validationProjects = records.projects.map((rawRecord, index) => {
    if (!isPlainObject(rawRecord)) {
      throw targetError(`Project record ${index} must be an object.`);
    }
    const cloned = structuredClone(rawRecord);
    return Object.hasOwn(cloned, 'incarnation')
      ? cloned
      : { ...cloned, incarnation: 'historical-lineage-validation' };
  });
  const validationRecords: WorkspaceRecordCandidates = {
    projects: validationProjects,
    workspace: structuredClone(records.workspace),
    presets: structuredClone(records.presets),
    pendingImports: structuredClone(records.pendingImports),
  };
  const {
    records: validatedRecords,
    snapshot: validationSnapshot,
  } = reconstructWorkspaceRecords(validationRecords);
  const validationDigest = await digestWorkspaceContent(
    validationSnapshot,
    environment.crypto.subtle,
  );
  if (validationDigest !== ledger.expectedTargetDigest) {
    throw new WorkspaceMigrationError(
      'Historical workspace digest changed before lineage preparation.',
      'verification-failed',
    );
  }

  const replacementProjects: StoredProject[] = [];
  const upgradedProjects = validatedRecords.projects.map((validatedRecord, index) => {
    if (Object.hasOwn(records.projects[index], 'incarnation')) {
      return validatedRecord;
    }
    const replacement = {
      ...validatedRecord,
      incarnation: generatedIncarnation(environment, index),
    };
    replacementProjects.push(structuredClone(replacement));
    return replacement;
  });

  const upgradedRecords: WorkspaceRecords = {
    ...validatedRecords,
    projects: upgradedProjects,
  };
  const snapshot = reconstructWorkspace(upgradedRecords);
  const observedDigest = await digestWorkspaceContent(snapshot, environment.crypto.subtle);
  if (observedDigest !== ledger.expectedTargetDigest) {
    throw new WorkspaceMigrationError(
      'Historical workspace digest changed during lineage preparation.',
      'verification-failed',
    );
  }

  const nextLedger: MigrationLedger = {
    ...structuredClone(ledger),
    indexedDbVersion: WORKSPACE_DB_VERSION,
    ledgerRevision: ledger.ledgerRevision + 1,
  };
  return {
    expectedLedger: structuredClone(ledger),
    expectedProjects: expectedRawProjects.map((record, index) => ({
      id: upgradedProjects[index].id,
      record,
    })),
    replacementProjects,
    ledger: nextLedger,
    snapshot,
  };
}
