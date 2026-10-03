/**
 * Native track uploads: audio + cover to Supabase Storage, rows in albums/tracks,
 * and the private rights declaration captured by the Rights & Ownership step.
 * Shared by UploadScreen and OnboardingUploadScreen.
 */
import { getAudioDurationSeconds } from './audio';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import i18n from '../i18n';
import { appError } from '../utils/appError';

const MUSIC_BUCKET = 'music-files';
// Private bucket owned by the website's track_rights migration; uploads go in
// "<user id>/...", no client deletes (proofs are kept as evidence).
const RIGHTS_BUCKET = 'rights-proofs';
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

export const ACCEPTED_AUDIO_MIME = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aiff',
  'audio/x-aiff', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
];
// Must match the rights-proofs bucket's allowed types and 10 MB limit.
export const PROOF_DOCUMENT_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
export const MAX_PROOF_MB = 10;
export const MAX_AUDIO_MB = 50;

export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
}

// ─── File helpers ─────────────────────────────────────────────────────────────

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
}

export function audioContentType(file: PickedFile): string {
  if (file.mimeType?.startsWith('audio/')) return file.mimeType;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'aiff' || ext === 'aif') return 'audio/aiff';
  return 'audio/mpeg';
}

export function imageContentType(file: PickedFile): string {
  if (file.mimeType?.startsWith('image/')) return file.mimeType;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function getAudioDuration(uri: string): Promise<number> {
  return getAudioDurationSeconds(uri);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function uploadFile(bucket: string, file: PickedFile, path: string, contentType: string): Promise<string> {
  const response = await fetch(file.uri);
  const blob = await response.blob();
  const { data, error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: false });
  if (error || !data?.path) throw appError('errors.upload.file', error, { name: file.name });
  return data.path;
}

function publicUrl(path: string): string {
  return supabase.storage.from(MUSIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ─── Free-plan limits ─────────────────────────────────────────────────────────
// Mirrored server-side by the triggers in supabase/enforce_free_upload_limits.sql.

export const FREE_TRACK_LIMIT = 10;
export const FREE_ALBUM_LIMIT = 2;
export const MAX_TRACKS_PER_UPLOAD = 20;

export interface UploadCounts {
  trackCount: number;
  albumCount: number;
}

/** Only the Artist tier uploads without limits. */
export const hasUnlimitedUploads = (tier?: string) => tier === 'artist';

/** Tracks removed by moderation don't count against the limit. */
export async function fetchUploadCounts(userId: string): Promise<UploadCounts> {
  const [tracks, albums] = await Promise.all([
    supabase.from('tracks').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'removed'),
    supabase.from('albums').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  if (tracks.error) throw new Error(tracks.error.message);
  if (albums.error) throw new Error(albums.error.message);
  return { trackCount: tracks.count ?? 0, albumCount: albums.count ?? 0 };
}

/** Returns why a free-plan user can't upload this release, or null if they can. */
export function freePlanLimitError(counts: UploadCounts, newTrackCount: number, isAlbum: boolean): string | null {
  if (isAlbum && counts.albumCount >= FREE_ALBUM_LIMIT) {
    return i18n.t('rights.limits.albums', { limit: FREE_ALBUM_LIMIT });
  }
  const remaining = Math.max(0, FREE_TRACK_LIMIT - counts.trackCount);
  if (newTrackCount > remaining) {
    return remaining === 0
      ? i18n.t('rights.limits.tracksReached', { limit: FREE_TRACK_LIMIT })
      : i18n.t('rights.limits.tracksLeft', { count: remaining });
  }
  return null;
}

// ─── Rights & Ownership ───────────────────────────────────────────────────────
// Stored in the website's track_rights table via the submit-track-rights Edge
// Function; value names match its enums.

export type OwnershipType = 'original' | 'on_behalf' | 'remix';
export type SamplesStatus = 'none' | 'royalty_free' | 'cleared' | 'uncleared';

// Labels are translation keys.
export const OWNERSHIP_OPTIONS: { value: OwnershipType; label: string }[] = [
  { value: 'original', label: 'rights.ownership.original' },
  { value: 'on_behalf', label: 'rights.ownership.on_behalf' },
  { value: 'remix', label: 'rights.ownership.remix' },
];

export const SAMPLES_OPTIONS: { value: SamplesStatus; label: string }[] = [
  { value: 'none', label: 'rights.samplesOpt.none' },
  { value: 'royalty_free', label: 'rights.samplesOpt.royalty_free' },
  { value: 'cleared', label: 'rights.samplesOpt.cleared' },
  { value: 'uncleared', label: 'rights.samplesOpt.uncleared' },
];

export const unclearedSamplesMessage = () => i18n.t('rights.uncleared');

/** The statement the uploader agrees to (rights.attestation), in their language. */
export const attestationText = () => i18n.t('rights.attestation');
/**
 * Stored with each declaration; bump whenever the attestation wording changes.
 * The language is appended (…-en / -ko / -ja) so the record shows which
 * translation of the statement the uploader agreed to.
 */
export const ATTESTATION_VERSION = 'mobile-2026-10-01';
export const attestationVersion = () => `${ATTESTATION_VERSION}-${(i18n.language || 'en').slice(0, 2)}`;

export const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export interface RightsDeclaration {
  // Required
  ownershipType: OwnershipType | null;
  songwriters: string[];
  samplesStatus: SamplesStatus | null;
  sampleSource: string;
  permissionProofFile: PickedFile | null;
  legalName: string;
  attested: boolean;
  // Optional
  alreadyReleased: boolean | null;
  distributor: string;
  releaseUrl: string;
  pLineYear: string;
  pLineOwner: string;
  cLineYear: string;
  cLineOwner: string;
  proAffiliation: string;
  ipiNumber: string;
  copyrightRegistration: string;
}

export function emptyRightsDeclaration(uploaderName: string): RightsDeclaration {
  return {
    ownershipType: null,
    songwriters: [uploaderName],
    samplesStatus: null,
    sampleSource: '',
    permissionProofFile: null,
    legalName: '',
    attested: false,
    alreadyReleased: null,
    distributor: '',
    releaseUrl: '',
    pLineYear: '',
    pLineOwner: '',
    cLineYear: '',
    cLineOwner: '',
    proAffiliation: '',
    ipiNumber: '',
    copyrightRegistration: '',
  };
}

/** Accepts "US-ABC-12-34567" style input; returns '' when empty. */
export function normalizeIsrc(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export const needsSampleSource = (s: SamplesStatus | null) => s === 'royalty_free' || s === 'cleared';
export const needsPermissionProof = (o: OwnershipType | null) => o === 'on_behalf' || o === 'remix';

const isYear = (v: string) => /^\d{4}$/.test(v) && +v >= 1900 && +v <= new Date().getFullYear() + 1;

/** "℗ 2026 Owner": the single-text form track_rights stores. */
function rightsLine(symbol: string, year: string, owner: string): string | null {
  const parts = [year.trim(), owner.trim()].filter(Boolean);
  return parts.length ? `${symbol} ${parts.join(' ')}` : null;
}

/** Returns the first problem with the declaration, or null if it can be submitted. */
export function validateRights(r: RightsDeclaration, trackIsrcs: { title: string; isrc: string }[]): string | null {
  if (!r.ownershipType) return i18n.t('rights.errors.ownership');
  if (!r.songwriters.some((s) => s.trim())) return i18n.t('rights.errors.songwriter');
  if (!r.samplesStatus) return i18n.t('rights.errors.samples');
  if (r.samplesStatus === 'uncleared') return unclearedSamplesMessage();
  if (needsSampleSource(r.samplesStatus) && !r.sampleSource.trim()) {
    return i18n.t('rights.errors.sampleSource');
  }
  if (needsPermissionProof(r.ownershipType) && !r.permissionProofFile) {
    return i18n.t('rights.errors.proof');
  }
  if (!r.legalName.trim()) return i18n.t('rights.errors.legalName');
  if (!r.attested) return i18n.t('rights.errors.attest');

  for (const t of trackIsrcs) {
    const isrc = normalizeIsrc(t.isrc);
    if (isrc && !ISRC_PATTERN.test(isrc)) {
      return i18n.t('rights.errors.isrc', { title: t.title || i18n.t('rights.untitled') });
    }
  }
  if (r.alreadyReleased && r.releaseUrl.trim()) {
    const url = r.releaseUrl.trim();
    if (!/^https:\/\/(open\.spotify\.com|music\.apple\.com)\//i.test(url)) {
      return i18n.t('rights.errors.releaseUrl');
    }
  }
  if (r.pLineYear && !isYear(r.pLineYear)) return i18n.t('rights.errors.pYear');
  if (r.cLineYear && !isYear(r.cLineYear)) return i18n.t('rights.errors.cYear');
  if (r.ipiNumber && !/^\d{9,11}$/.test(r.ipiNumber.trim())) return i18n.t('rights.errors.ipi');
  if (r.copyrightRegistration && !/^(SR|PA)u?[\s-]*[\d-]{4,}$/i.test(r.copyrightRegistration.trim())) {
    return i18n.t('rights.errors.registration');
  }
  return null;
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export interface ReleaseTrackInput {
  file: PickedFile;
  title: string;
  duration: number;
  order: number;
  isrc: string;
}

export interface PublishReleaseInput {
  userId: string;
  artist: string;
  genre: string;
  cover: PickedFile | null;
  /** Set for an album; null publishes tracks[0] as a single. */
  album: { title: string } | null;
  singleAlbumName?: string;
  tracks: ReleaseTrackInput[];
  rights: RightsDeclaration;
  challengesOpen?: boolean;
  isExplicit?: boolean;
  onProgress?: (percent: number) => void;
}

export interface PublishReleaseResult {
  trackIds: string[];
  /** 'pending_review' when permission proof needs an admin to verify it first. */
  status: 'published' | 'pending_review';
}

const orNull = (v: string) => (v.trim() ? v.trim() : null);

async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null);
    if (payload?.error) return payload.error;
  }
  return error instanceof Error ? error.message : fallback;
}

/**
 * Uploads files and inserts album/tracks (the database makes every client-inserted
 * track 'pending_review'), then submits the rights declaration, which publishes
 * original work or leaves remixes/label uploads for review. On any failure it
 * removes what it created, so a track never exists without its declaration.
 */
export async function publishRelease(input: PublishReleaseInput): Promise<PublishReleaseResult> {
  const { userId, rights, onProgress } = input;
  const progress = (p: number) => onProgress?.(Math.round(p));

  const musicPaths: string[] = [];
  let albumId: string | null = null;
  const trackIds: string[] = [];

  try {
    progress(2);

    let proofPath: string | null = null;
    if (needsPermissionProof(rights.ownershipType) && rights.permissionProofFile) {
      const f = rights.permissionProofFile;
      proofPath = await uploadFile(
        RIGHTS_BUCKET,
        f,
        `${userId}/${Date.now()}-${sanitizeFileName(f.name)}`,
        f.mimeType ?? 'application/pdf',
      );
    }

    let coverUrl = DEFAULT_COVER;
    if (input.cover) {
      const path = await uploadFile(
        MUSIC_BUCKET,
        input.cover,
        `playlist-covers/${userId}/${Date.now()}-${sanitizeFileName(input.cover.name)}`,
        imageContentType(input.cover),
      );
      musicPaths.push(path);
      coverUrl = publicUrl(path);
    }
    progress(10);

    const sorted = [...input.tracks].sort((a, b) => a.order - b.order);
    const audioUrls: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const path = await uploadFile(
        MUSIC_BUCKET,
        t.file,
        `audio-files/${userId}/${Date.now()}-${i}-${sanitizeFileName(t.file.name)}`,
        audioContentType(t.file),
      );
      musicPaths.push(path);
      audioUrls.push(publicUrl(path));
      progress(10 + ((i + 1) / sorted.length) * 70);
    }

    const now = new Date().toISOString();
    if (input.album) {
      const { data: albumData, error: albumError } = await supabase
        .from('albums')
        .insert({
          title: input.album.title,
          artist: input.artist,
          cover: coverUrl,
          genre: input.genre,
          user_id: userId,
          is_explicit: input.isExplicit ?? false,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();
      if (albumError) throw appError('errors.upload.album', albumError);
      albumId = albumData.id;
    }
    progress(85);

    // One insert per track so each id is paired with its own ISRC for certain.
    const isrcs: Record<string, string> = {};
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const { data: row, error: trackError } = await supabase
        .from('tracks')
        .insert({
          title: t.title.trim(),
          artist: input.artist,
          album: input.album?.title ?? input.singleAlbumName ?? '',
          album_id: albumId ?? undefined,
          duration: t.duration,
          cover: coverUrl,
          audio_url: audioUrls[i],
          genre: input.genre,
          user_id: userId,
          status: 'pending_review',
          is_explicit: input.isExplicit ?? false,
          challenges_open: input.challengesOpen ?? false,
          preview_start_sec: 0,
          preview_duration_sec: 20,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();
      if (trackError) throw appError('errors.upload.tracks', trackError);
      trackIds.push(row.id);
      const isrc = normalizeIsrc(t.isrc);
      if (isrc) isrcs[row.id] = isrc;
    }
    progress(92);

    const { data: result, error: rightsError } = await supabase.functions.invoke('submit-track-rights', {
      body: {
        trackIds,
        isrcs,
        rights: {
          ownershipType: rights.ownershipType,
          songwriters: rights.songwriters.map((s) => s.trim()).filter(Boolean),
          samples: rights.samplesStatus,
          sampleSource: needsSampleSource(rights.samplesStatus) ? rights.sampleSource.trim() : null,
          permissionProofPath: proofPath,
          legalName: rights.legalName.trim(),
          attestationVersion: attestationVersion(),
          alreadyReleased: rights.alreadyReleased === true,
          distributor: rights.alreadyReleased ? orNull(rights.distributor) : null,
          releaseUrl: rights.alreadyReleased ? orNull(rights.releaseUrl) : null,
          pLine: rightsLine('℗', rights.pLineYear, rights.pLineOwner),
          cLine: rightsLine('©', rights.cLineYear, rights.cLineOwner),
          pro: orNull(rights.proAffiliation),
          ipi: orNull(rights.ipiNumber),
          copyrightRegNumber: orNull(rights.copyrightRegistration),
        },
      },
    });
    if (rightsError) {
      throw new Error(await functionErrorMessage(rightsError, 'Failed to save the rights declaration'));
    }

    progress(100);
    return { trackIds, status: result?.status === 'published' ? 'published' : 'pending_review' };
  } catch (error) {
    // Best-effort rollback; the original error is what the user needs to see.
    // A proof file can't be deleted by the client (kept as evidence) and is
    // simply left unreferenced.
    if (trackIds.length) await supabase.from('tracks').delete().in('id', trackIds);
    if (albumId) await supabase.from('albums').delete().eq('id', albumId);
    if (musicPaths.length) await supabase.storage.from(MUSIC_BUCKET).remove(musicPaths);
    throw error;
  }
}
