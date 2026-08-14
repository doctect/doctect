export type WorkspaceFaultPoint =
  | 'copy.before-transaction'
  | 'copy.after-projects'
  | 'copy.after-workspace'
  | 'copy.after-presets'
  | 'copy.after-pending-imports'
  | 'copy.after-backup'
  | 'copy.after-ledger'
  | 'copy.before-complete'
  | 'mutation.before-complete'
  | 'recovery.before-complete';

export type FaultInjector = (point: WorkspaceFaultPoint) => void;
