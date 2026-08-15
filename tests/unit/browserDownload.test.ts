import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadJson } from '../../services/browserDownload';

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

const readBlobText = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
  reader.addEventListener('error', () => reject(reader.error), { once: true });
  reader.readAsText(blob);
});

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:workspace-backup'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});

describe('browser downloads', () => {
  it('downloads through an object URL, removes the anchor, and revokes asynchronously', async () => {
    const blob = new Blob(['exact backup bytes'], { type: 'application/octet-stream' });
    let clickedAnchor: HTMLAnchorElement | undefined;
    let attachedDuringClick = false;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedAnchor = this;
      attachedDuringClick = document.body.contains(this);
    });

    downloadBlob(blob, 'workspace-backup.json');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickedAnchor?.href).toBe('blob:workspace-backup');
    expect(clickedAnchor?.download).toBe('workspace-backup.json');
    expect(attachedDuringClick).toBe(true);
    expect(document.body.contains(clickedAnchor!)).toBe(false);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:workspace-backup');
  });

  it('serializes exact indented JSON into a UTF-8 Blob', async () => {
    let clickedAnchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedAnchor = this;
    });
    const value = {
      project: 'Café project',
      order: [2, 1],
      retained: true,
    };

    downloadJson(value, 'workspace.json');

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json;charset=utf-8');
    expect(await readBlobText(blob)).toBe(JSON.stringify(value, null, 2));
    expect(clickedAnchor?.download).toBe('workspace.json');

    await new Promise<void>(resolve => queueMicrotask(resolve));
  });
});
