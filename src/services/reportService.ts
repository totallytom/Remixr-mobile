/**
 * Reporting users, messages and concert listings (App Store guideline 1.2). Reports are stored by
 * the submit_user_report() function in supabase/add_user_reports.sql, which also
 * snapshots a reported message's text server-side. Admins resolve them from the
 * admin Reports screen via resolve_user_report().
 */
import { supabase } from './supabase';
import i18n from '../i18n';
import { appError } from '../utils/appError';

export type ReportReason =
  | 'harassment' | 'hate' | 'sexual' | 'spam' | 'impersonation' | 'self_harm' | 'misleading' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'report.reasons.harassment' },
  { value: 'hate', label: 'report.reasons.hate' },
  { value: 'sexual', label: 'report.reasons.sexual' },
  { value: 'spam', label: 'report.reasons.spam' },
  { value: 'impersonation', label: 'report.reasons.impersonation' },
  { value: 'self_harm', label: 'report.reasons.self_harm' },
  { value: 'other', label: 'report.reasons.other' },
];

/** Reasons offered when reporting a concert listing. */
export const CONCERT_REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'misleading', label: 'report.reasons.misleading' },
  { value: 'spam', label: 'report.reasons.concertSpam' },
  { value: 'impersonation', label: 'report.reasons.concertImpersonation' },
  { value: 'hate', label: 'report.reasons.hate' },
  { value: 'sexual', label: 'report.reasons.sexual' },
  { value: 'other', label: 'report.reasons.other' },
];

// Labels above are translation keys.
export const reasonLabel = (reason: string) =>
  i18n.t(`report.reasons.${reason}`, { defaultValue: reason });

export interface ReportTarget {
  userId: string;
  username: string;
  /** Set when reporting a specific message. */
  messageId?: string;
  messageKind?: 'direct' | 'group';
  /** Set when reporting a concert listing (userId = its host). */
  concertId?: string;
  concertTitle?: string;
}

export type SubmitReportResult = 'ok' | 'already_reported';

export async function submitUserReport(
  target: ReportTarget,
  reason: ReportReason,
  details?: string,
): Promise<SubmitReportResult> {
  // Concert reports: the server looks up the host and snapshots the listing
  // (supabase/add_concert_reports.sql in the mobile repo).
  const { data, error } = target.concertId
    ? await supabase.rpc('submit_concert_report', {
        p_concert_id: target.concertId,
        p_reason: reason,
        p_details: details?.trim() || null,
      })
    : await supabase.rpc('submit_user_report', {
        p_reported_user_id: target.userId,
        p_reason: reason,
        p_details: details?.trim() || null,
        p_message_id: target.messageId ?? null,
        p_message_kind: target.messageKind ?? null,
      });
  if (error) throw appError('report.failed', error);
  if (data === 'ok' || data === 'already_reported') return data;
  throw new Error(i18n.t(data === 'unauthenticated' ? 'report.signIn' : 'report.cant'));
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface ReportUser {
  id: string;
  username: string;
  avatar?: string;
  suspendedAt?: string | null;
}

export interface UserReport {
  id: string;
  reason: ReportReason;
  details?: string;
  messageId?: string;
  messageKind?: 'direct' | 'group';
  messageExcerpt?: string;
  /** Set for concert reports; the listing as it was when reported. */
  concertId?: string;
  concert?: ReportedConcert;
  createdAt: string;
  reporter?: ReportUser;
  reported?: ReportUser;
  /** Open reports about the same user, including this one. */
  reportCountForUser: number;
}

export interface ReportedConcert {
  title: string;
  date?: string;
  venue?: string;
  location?: string;
  ticketUrl?: string;
  description?: string;
}

export type ReportAction = 'dismiss' | 'remove_message' | 'remove_concert' | 'suspend_user';

export async function getOpenUserReports(): Promise<UserReport[]> {
  const { data, error } = await supabase
    .from('user_reports')
    .select(`
      id, reason, details, message_id, message_kind, message_excerpt, concert_id, concert_snapshot,
      created_at, reported_user_id,
      reporter:users!user_reports_reporter_id_fkey (id, username, avatar),
      reported:users!user_reports_reported_user_id_fkey (id, username, avatar, suspended_at)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const perUser = new Map<string, number>();
  rows.forEach((r: any) => perUser.set(r.reported_user_id, (perUser.get(r.reported_user_id) ?? 0) + 1));

  const toUser = (u: any): ReportUser | undefined =>
    u ? { id: u.id, username: u.username, avatar: u.avatar ?? undefined, suspendedAt: u.suspended_at ?? null } : undefined;

  return rows.map((r: any) => ({
    id: r.id,
    reason: r.reason,
    details: r.details ?? undefined,
    messageId: r.message_id ?? undefined,
    messageKind: r.message_kind ?? undefined,
    messageExcerpt: r.message_excerpt ?? undefined,
    concertId: r.concert_id ?? undefined,
    concert: r.concert_id
      ? {
          title: r.concert_snapshot?.title ?? '—',
          date: r.concert_snapshot?.date ?? undefined,
          venue: r.concert_snapshot?.venue ?? undefined,
          location: r.concert_snapshot?.location ?? undefined,
          ticketUrl: r.concert_snapshot?.ticket_url ?? undefined,
          description: r.concert_snapshot?.description ?? undefined,
        }
      : undefined,
    createdAt: r.created_at,
    reporter: toUser(r.reporter),
    reported: toUser(r.reported),
    reportCountForUser: perUser.get(r.reported_user_id) ?? 1,
  }));
}

export async function resolveUserReport(reportId: string, action: ReportAction): Promise<void> {
  const { data, error } = await supabase.rpc('resolve_user_report', { p_report_id: reportId, p_action: action });
  if (error) throw new Error(error.message);
  if (data !== 'ok') {
    throw new Error(
      data === 'no_message' ? 'This report is not about a message.'
        : data === 'no_concert' ? 'This report is not about a concert.'
        : 'Report not found.',
    );
  }
}
