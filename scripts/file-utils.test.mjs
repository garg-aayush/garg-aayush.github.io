import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../tools/file-utils.js', import.meta.url), 'utf8');

function loadHelpers(globals = {}) {
  const context = vm.createContext(globals);
  vm.runInContext(source, context);
  return context.ToolFiles;
}

test('formats file size thresholds without changing existing rounding or units', () => {
  const { formatBytes } = loadHelpers();
  for (const [bytes, expected] of [[0, '0 B'], [1023, '1023 B'], [1024, '1.0 KB'], [1536, '1.5 KB'], [1048575, '1024.0 KB'], [1048576, '1.0 MB'], [20 * 1048576, '20.0 MB']]) {
    assert.equal(formatBytes(bytes), expected);
  }
});

test('keeps supported image names and the existing unknown MIME fallback', () => {
  const { friendlyType } = loadHelpers();
  const names = {
    'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP',
    'image/gif': 'GIF', 'image/bmp': 'BMP', 'image/svg+xml': 'SVG',
    'image/avif': 'AVIF', 'image/heic': 'HEIC', 'image/heif': 'HEIF',
    'image/tiff': 'TIFF', 'application/octet-stream': 'APPLICATION/OCTET-STREAM', '': '',
  };
  for (const [mime, expected] of Object.entries(names)) assert.equal(friendlyType(mime), expected);
});

test('starts downloads with exact filenames and independently revokes URLs after one second', () => {
  const blobs = [];
  const clicks = [];
  const revoked = [];
  const timers = [];
  const { downloadBlob } = loadHelpers({
    URL: {
      createObjectURL(blob) { blobs.push(blob); return `blob:test-${blobs.length}`; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    document: {
      createElement(tag) {
        assert.equal(tag, 'a');
        return { click() { clicks.push({ href: this.href, filename: this.download }); } };
      },
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); },
  });
  const png = new Blob(['png'], { type: 'image/png' });
  const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
  downloadBlob(png, 'original name-80x50.png');
  downloadBlob(jpeg, 'चित्र-mask.jpg');
  assert.deepEqual(blobs, [png, jpeg]);
  assert.deepEqual(clicks, [
    { href: 'blob:test-1', filename: 'original name-80x50.png' },
    { href: 'blob:test-2', filename: 'चित्र-mask.jpg' },
  ]);
  assert.deepEqual(revoked, []);
  assert.deepEqual(timers.map(timer => timer.delay), [1000, 1000]);
  timers[1].callback();
  assert.deepEqual(revoked, ['blob:test-2']);
  timers[0].callback();
  assert.deepEqual(revoked, ['blob:test-2', 'blob:test-1']);
});
