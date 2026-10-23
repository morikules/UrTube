import type { PlaylistInfo } from './playlists';
import type {
  Dismissed,
  ExternalView,
  Mark,
  MusicPlay,
  StartView,
  Stats,
  Video,
  VideoMeta,
  View,
  ViewProgress,
  ViewSource,
  PendingRemoval,
} from './db';

/** Requests from content script / popup / options page to the background. */
export type Request =
  | { type: 'getWatched' }
  | { type: 'getMusic' }
  /** A track played on music.youtube.com. */
  | ({ type: 'recordMusicPlay' } & MusicPlay)
  | { type: 'getVideo'; videoId: string }
  | ({ type: 'startView' } & StartView)
  /** The unfinished view a new playback of the video may continue. */
  | { type: 'resumableView'; videoId: string }
  | { type: 'updateView'; viewId: number; progress: ViewProgress }
  /** `quiet`: filled in the background, open pages need not reload for it. */
  | { type: 'updateVideoMeta'; videoId: string; meta: VideoMeta & { title?: string }; quiet?: boolean }
  /** Videos still without details from YouTube (see videosMissingMeta). */
  | { type: 'missingMeta'; recentOnly: boolean; limit: number }
  /** YouTube had no details for these videos (deleted, private). */
  | { type: 'metaNotFound'; ids: string[] }
  | { type: 'addMarks'; marks: Mark[] }
  | { type: 'markUnwatched'; ids: string[] }
  | { type: 'markWatched'; ids: string[] }
  | { type: 'deleteVideos'; ids: string[] }
  | { type: 'deleteView'; viewId: number }
  | { type: 'getStats' }
  | { type: 'reloadCache' }
  | { type: 'syncBrowserHistory' }
  | { type: 'cancelBrowserHistorySync' }
  // Hidden ("Ausblenden") videos and playlists
  | { type: 'getDismissed' }
  | ({ type: 'setDismissed'; dismissed: boolean } & Omit<Dismissed, 'at'>)
  | { type: 'countDismissed' }
  /** Shows hidden items again: all, or only one kind. */
  | { type: 'clearDismissed'; kind?: Dismissed['kind'] }
  // Playlist contents cache
  | { type: 'getPlaylists'; ids: string[] }
  | { type: 'savePlaylist'; playlist: PlaylistInfo }
  /** Asks an open YouTube tab to read the YouTube watch history. */
  | { type: 'startYoutubeHistorySync'; full: boolean }
  /** Asks an open YouTube tab to remove all watched videos from "Watch later". */
  | { type: 'startWatchLaterCleanup' }
  /**
   * One page of the YouTube watch history, sent by the content script, with
   * the tokens to remove entries from it. Re-sending adds no duplicates.
   */
  | { type: 'addYoutubeHistory'; views: ExternalView[]; tokens: { videoId: string; token: string }[] }
  /** A YouTube tab fetches the queued removals from the YouTube history … */
  | { type: 'takeRemovals' }
  /** … and returns the ones that failed. */
  | { type: 'requeueRemovals'; items: PendingRemoval[] }
  /** Queue all deleted videos for removal from the YouTube history. */
  | { type: 'removeDeletedFromYoutube' }
  | { type: 'countBySource' }
  | { type: 'deleteBySource'; source: ViewSource };

/** Last run of filling in video details, in storage.local under META_FILL_STATUS_KEY. */
export interface MetaFillStatus {
  at: number;
  filled: number;
  notFound: number;
  error?: string;
}
export const META_FILL_STATUS_KEY = 'metaFillStatus';

export interface SyncResult {
  scanned: number;
  added: number;
  /** Stopped by the user before all pages were read. */
  cancelled?: boolean;
}

export interface ResponseMap {
  /** [videoId, lastViewAt] for all videos with status 'watched'. */
  getWatched: [string, number][];
  /** Watched videos that are music: sure ones and those only in the category "Music". */
  getMusic: { sure: string[]; category: string[] };
  recordMusicPlay: null;
  getVideo: Video | null;
  startView: { viewId: number; video: Video };
  resumableView: View | null;
  updateView: null;
  updateVideoMeta: null;
  missingMeta: { ids: string[]; total: number };
  metaNotFound: null;
  addMarks: null;
  markUnwatched: null;
  markWatched: null;
  deleteVideos: null;
  /** The updated video, or null if it was removed with its last view. */
  deleteView: Video | null;
  getStats: Stats;
  reloadCache: null;
  syncBrowserHistory: SyncResult;
  cancelBrowserHistorySync: null;
  getDismissed: string[];
  setDismissed: null;
  countDismissed: Record<Dismissed['kind'], number>;
  clearDismissed: number;
  getPlaylists: PlaylistInfo[];
  savePlaylist: null;
  startYoutubeHistorySync: null;
  startWatchLaterCleanup: null;
  addYoutubeHistory: { added: number };
  takeRemovals: PendingRemoval[];
  requeueRemovals: null;
  /** Number of queued videos. */
  removeDeletedFromYoutube: number;
  countBySource: Partial<Record<ViewSource, number>>;
  deleteBySource: number;
}

/** Pushed from the background to YouTube tabs. */
export type Broadcast =
  /** lastViewAt null = no longer watched (reset or deleted). */
  | { type: 'watchedChanged'; changes: [string, number | null][] }
  | { type: 'watchedReloaded' }
  /** A watched video turned out to be music (see musicKind). */
  | { type: 'musicChanged'; videoId: string; kind: 'sure' | 'category' }
  | { type: 'runYoutubeHistorySync'; full: boolean }
  | { type: 'runWatchLaterCleanup' }
  /** Removals from the YouTube history are waiting. */
  | { type: 'processRemovals' }
  | { type: 'dismissedChanged'; id: string; dismissed: boolean }
  | { type: 'dismissedReloaded' };

/** Pushed from the background to extension pages (options, popup). */
export type PageEvent = { type: 'dataChanged' };

export async function send<R extends Request>(req: R): Promise<ResponseMap[R['type']]> {
  const res = await browser.runtime.sendMessage(req);
  if (res && typeof res === 'object' && 'error' in res) throw new Error(String(res.error));
  return res as ResponseMap[R['type']];
}
