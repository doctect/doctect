import { validateWorkspaceProject } from './validation';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};

addEventListener('message', event => {
  const request = event.data;
  const requestId = isPlainObject(request) && Number.isInteger(request.requestId)
    ? request.requestId as number
    : 0;
  if (!isPlainObject(request)
    || !hasExactKeys(request, ['type', 'requestId', 'project'])
    || request.type !== 'prepare-project'
    || requestId <= 0) {
    postMessage({
      type: 'project-preparation-failed',
      requestId,
      message: 'Project preparation request is invalid.',
    });
    return;
  }

  try {
    const project = validateWorkspaceProject(request.project, { warningPolicy: 'reject' });
    postMessage({ type: 'project-prepared', requestId, project });
  } catch (error) {
    postMessage({
      type: 'project-preparation-failed',
      requestId,
      message: error instanceof Error ? error.message : 'Project preparation failed.',
    });
  }
});
