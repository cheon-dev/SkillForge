import { getSupabaseClient } from './supabase';

const avatarBucket = 'student-avatars';
const maxAvatarSize = 5 * 1024 * 1024;
const allowedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const uploadStudentAvatar = async (studentId: string, file: File): Promise<string> => {
  if (!allowedAvatarTypes.has(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  if (file.size === 0 || file.size > maxAvatarSize) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  const { data, error } = await getSupabaseClient()
    .storage
    .from(avatarBucket)
    .upload(`${studentId}/profile`, file, {
      cacheControl: '0',
      contentType: file.type,
      upsert: true,
    });

  if (error) throw error;

  const { data: publicUrl } = getSupabaseClient()
    .storage
    .from(avatarBucket)
    .getPublicUrl(data.path);
  return publicUrl.publicUrl;
};
