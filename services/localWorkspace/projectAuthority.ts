import type { WorkspaceProject, WorkspaceSnapshot } from './contracts';
import {
  nextProjectLineage,
  sameProjectLineage,
  type ProjectLineage,
} from './schema';

interface InstalledProjectAuthority {
  token: object;
  lineage: ProjectLineage;
}

const installedAuthorities = new WeakMap<WorkspaceProject, InstalledProjectAuthority>();

const getInstalledProjectAuthority = (
  project: WorkspaceProject,
): InstalledProjectAuthority | undefined => installedAuthorities.get(project);

export const getInstalledProjectAuthorityToken = (
  project: WorkspaceProject,
): object | undefined => getInstalledProjectAuthority(project)?.token;

export const getInstalledProjectAuthorityLineage = (
  project: WorkspaceProject,
): ProjectLineage | undefined => getInstalledProjectAuthority(project)?.lineage;

export const registerInstalledProjectAuthority = (
  project: WorkspaceProject,
  lineage: ProjectLineage,
  token: object = {},
): object => {
  installedAuthorities.set(project, {
    token,
    lineage: { ...lineage },
  });
  return token;
};

export const inheritInstalledProjectAuthority = (
  target: WorkspaceProject,
  source: WorkspaceProject,
): void => {
  const authority = getInstalledProjectAuthority(source);
  if (authority) registerInstalledProjectAuthority(target, authority.lineage, authority.token);
};

export const advanceInstalledProjectAuthorityFromSave = (
  survivingProject: WorkspaceProject,
  submittedProject: WorkspaceProject,
  returnedProject: WorkspaceProject,
): void => {
  const surviving = getInstalledProjectAuthority(survivingProject);
  const submitted = getInstalledProjectAuthority(submittedProject);
  const returned = getInstalledProjectAuthority(returnedProject);
  if (!surviving || !submitted || !returned) return;
  if (surviving.token !== submitted.token || returned.token !== submitted.token) return;
  if (!sameProjectLineage(surviving.lineage, submitted.lineage)) return;
  if (!sameProjectLineage(returned.lineage, nextProjectLineage(submitted.lineage))) return;
  registerInstalledProjectAuthority(survivingProject, returned.lineage, returned.token);
};

export const cloneWorkspaceSnapshotWithProjectAuthority = (
  snapshot: WorkspaceSnapshot,
): WorkspaceSnapshot => {
  const cloned = structuredClone(snapshot);
  const sourceProjects = new Map(snapshot.projects.map(project => [project.id, project]));
  for (const project of cloned.projects) {
    const source = sourceProjects.get(project.id);
    if (source) inheritInstalledProjectAuthority(project, source);
  }
  return cloned;
};
