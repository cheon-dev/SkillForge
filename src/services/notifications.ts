import { getSupabaseClient } from './supabase';
import type { Database } from '../types/supabase';

export type StudentNotification = Database['public']['Tables']['notifications']['Row'];

const announceNotificationChange = () => window.dispatchEvent(new Event('notifications:updated'));

export const getNotifications = async (studentId: string): Promise<StudentNotification[]> => {
  const { data, error } = await getSupabaseClient()
    .from('notifications')
    .select('*')
    .eq('recipient_id', studentId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
};

export const getUnreadNotificationCount = async (studentId: string): Promise<number> => {
  const { count, error } = await getSupabaseClient()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', studentId)
    .is('read_at', null);

  if (error) throw error;
  return count ?? 0;
};

export const markNotificationRead = async (studentId: string, notificationId: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', studentId)
    .is('read_at', null);

  if (error) throw error;
  announceNotificationChange();
};

export const markAllNotificationsRead = async (studentId: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', studentId)
    .is('read_at', null);

  if (error) throw error;
  announceNotificationChange();
};
