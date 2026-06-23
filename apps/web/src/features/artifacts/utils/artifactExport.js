export function sanitizeArtifactFilename(title) {
  const cleaned = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'artifact';
}

export function downloadArtifact(artifact, extension) {
  const blob = new Blob([artifact.current_content], {
    type: extension === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeArtifactFilename(artifact.title)}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
