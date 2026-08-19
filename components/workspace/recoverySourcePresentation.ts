import type { RecoverySource } from '../../services/localWorkspace/index';

export interface RecoverySourcePresentation {
  title: string;
  explanation: string;
  actionLabel: string;
  filename: string;
}

export const RECOVERY_SOURCE_PRESENTATION: Readonly<
  Record<RecoverySource, RecoverySourcePresentation>
> = {
  'indexeddb-workspace': {
    title: 'Projects saved by this editor',
    explanation: 'Project set stored by the current Doctect editor.',
    actionLabel: 'Download editor projects',
    filename: 'doctect-editor-projects.json',
  },
  'legacy-current': {
    title: 'Projects from an older app version',
    explanation: 'Latest project set still present in storage used by an older Doctect version.',
    actionLabel: 'Download older-version projects',
    filename: 'doctect-older-version-projects.json',
  },
  'legacy-original': {
    title: 'Projects from before the update',
    explanation: 'Exact project set Doctect found when it first started moving local projects.',
    actionLabel: 'Download projects from before the update',
    filename: 'doctect-projects-before-update.json',
  },
};

export const OPEN_WORKSPACE_PRESENTATION: Readonly<RecoverySourcePresentation> = {
  title: 'Work from this tab',
  explanation: 'Latest workspace captured before the editor closed. It may include changes not yet saved.',
  actionLabel: 'Download work from this tab',
  filename: 'doctect-work-from-this-tab.json',
};

export const PROJECT_COPY_HELPER_TEXT =
  'Each file preserves a different project set. Keep any set you may need. These files are for safekeeping or support; this version of Doctect cannot open them directly.';

export const PROJECT_DOWNLOAD_ERROR =
  'Project download failed. Nothing changed. Try again.';

export const SEPARATE_COPIES_ERROR =
  'We couldn’t add the separate copies. Nothing was overwritten. Try again or save the project copies first.';
