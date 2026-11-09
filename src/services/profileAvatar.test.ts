import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock('./supabase', () => ({
  getSupabaseClient: () => ({
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      }),
    },
  }),
}));

import { uploadStudentAvatar } from './profileAvatar';

describe('uploadStudentAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ data: { path: 'student-id/profile' }, error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example/avatar' } });
  });

  it('uploads supported images to the student-owned object path', async () => {
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });

    await expect(uploadStudentAvatar('student-id', file))
      .resolves.toBe('https://storage.example/avatar');

    expect(mocks.upload).toHaveBeenCalledWith(
      'student-id/profile',
      file,
      expect.objectContaining({ upsert: true, contentType: 'image/webp' }),
    );
    expect(mocks.getPublicUrl).toHaveBeenCalledWith('student-id/profile');
  });

  it('rejects unsupported image types and files larger than 5 MB', async () => {
    const gif = new File(['image'], 'profile.gif', { type: 'image/gif' });
    const largeImage = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });

    await expect(uploadStudentAvatar('student-id', gif)).rejects.toThrow('JPG, PNG, or WebP');
    await expect(uploadStudentAvatar('student-id', largeImage)).rejects.toThrow('smaller than 5 MB');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
