import { describe, expect, it } from 'vitest';
import {
  OPEN_WORKSPACE_PRESENTATION,
  PROJECT_COPY_HELPER_TEXT,
  PROJECT_DOWNLOAD_ERROR,
  RECOVERY_SOURCE_PRESENTATION,
  SEPARATE_COPIES_ERROR,
} from '../../components/workspace/recoverySourcePresentation';

describe('recovery source presentation', () => {
  it('explains every durable and open-work project set with unique actions', () => {
    expect(RECOVERY_SOURCE_PRESENTATION).toEqual({
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
    });
    expect(OPEN_WORKSPACE_PRESENTATION).toEqual({
      title: 'Work from this tab',
      explanation: 'Latest workspace captured before the editor closed. It may include changes not yet saved.',
      actionLabel: 'Download work from this tab',
      filename: 'doctect-work-from-this-tab.json',
    });
    expect(new Set([
      ...Object.values(RECOVERY_SOURCE_PRESENTATION).map(item => item.actionLabel),
      OPEN_WORKSPACE_PRESENTATION.actionLabel,
    ]).size).toBe(4);
  });

  it('pins helper and action-error language', () => {
    expect(PROJECT_COPY_HELPER_TEXT).toBe(
      'Each file preserves a different project set. Keep any set you may need. These files are for safekeeping or support; this version of Doctect cannot open them directly.',
    );
    expect(PROJECT_DOWNLOAD_ERROR).toBe(
      'Project download failed. Nothing changed. Try again.',
    );
    expect(SEPARATE_COPIES_ERROR).toBe(
      'We couldn’t add the separate copies. Nothing was overwritten. Try again or save the project copies first.',
    );
  });
});
