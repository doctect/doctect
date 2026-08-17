import type { WorkspaceProject, WorkspaceSnapshot } from './contracts';

const installedAuthorityTokens = new WeakMap<WorkspaceProject, object>();

export const getInstalledProjectAuthorityToken = (
  project: WorkspaceProject,
): object | undefined => installedAuthorityTokens.get(project);

export const registerInstalledProjectAuthority = (
  project: WorkspaceProject,
  token: object = {},
): object => {
  installedAuthorityTokens.set(project, token);
  return token;
};

export const cloneWorkspaceSnapshotWithProjectAuthority = (
  snapshot: WorkspaceSnapshot,
): WorkspaceSnapshot => {
  const cloned = structuredClone(snapshot);
  const sourceProjects = new Map(snapshot.projects.map(project => [project.id, project]));
  for (const project of cloned.projects) {
    const source = sourceProjects.get(project.id);
    const token = source && getInstalledProjectAuthorityToken(source);
    if (token) registerInstalledProjectAuthority(project, token);
  }
  return cloned;
};
