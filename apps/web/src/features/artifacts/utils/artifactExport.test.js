import { describe, expect, it, vi } from 'vitest';
import { downloadArtifact, sanitizeArtifactFilename } from './artifactExport.js';

describe('artifact export', () => {
  it('sanitizes filenames', () => {
    expect(sanitizeArtifactFilename(' Project: plan / 2026 ')).toBe('Project-plan-2026');
  });

  it('exports only the current saved content', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadArtifact({ title: 'Plan', current_content: 'saved version' }, 'md');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });
});
