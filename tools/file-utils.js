globalThis.ToolFiles = (() => {
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function friendlyType(mime) {
    const map = {
      'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP',
      'image/gif': 'GIF', 'image/bmp': 'BMP', 'image/svg+xml': 'SVG',
      'image/avif': 'AVIF', 'image/heic': 'HEIC', 'image/heif': 'HEIF',
    };
    return map[mime] || mime.replace('image/', '').toUpperCase();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { formatBytes, friendlyType, downloadBlob };
})();
