import type { WorkspaceProject, WorkspaceSnapshot } from './contracts';
import type { ProjectLineage } from './schema';

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
