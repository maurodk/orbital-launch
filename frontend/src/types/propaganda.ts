export type PropagandaMediaType = "image" | "gif" | "svg" | "mp4";

export interface PropagandaCampaign {
  id: number;
  nome: string;
  descricao: string | null;
  storageFolder: string | null;
  mediaType: PropagandaMediaType;
  mediaUrl: string;
  mediaPath: string | null;
  durationSeconds: number;
  transitionStyle: string;
  transitionMediaType: PropagandaMediaType | null;
  transitionMediaUrl: string | null;
  transitionMediaPath: string | null;
  transitionEntryMediaType: PropagandaMediaType | null;
  transitionEntryMediaUrl: string | null;
  transitionEntryMediaPath: string | null;
  transitionExitMediaType: PropagandaMediaType | null;
  transitionExitMediaUrl: string | null;
  transitionExitMediaPath: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PropagandaRuntime {
  scope: string;
  status: "idle" | "playing" | "paused";
  activeCampaignId: number | null;
  activeCampaignName: string | null;
  activeStorageFolder: string | null;
  activeMediaType: PropagandaMediaType | null;
  activeMediaUrl: string | null;
  activeMediaPath: string | null;
  activeTransitionStyle: string;
  activeTransitionMediaType: PropagandaMediaType | null;
  activeTransitionMediaUrl: string | null;
  activeTransitionMediaPath: string | null;
  activeTransitionEntryMediaType: PropagandaMediaType | null;
  activeTransitionEntryMediaUrl: string | null;
  activeTransitionEntryMediaPath: string | null;
  activeTransitionExitMediaType: PropagandaMediaType | null;
  activeTransitionExitMediaUrl: string | null;
  activeTransitionExitMediaPath: string | null;
  activeDurationSeconds: number;
  playbackToken: string | null;
  triggerSource: string | null;
  startedAt: string | null;
  endsAt: string | null;
  scheduleEnabled: boolean;
  scheduleCampaignId: number | null;
  intervalMinutes: number | null;
  nextRunAt: string | null;
  updatedAt: string | null;
}

export interface PropagandaMediaAsset {
  name: string;
  path: string;
  publicUrl: string;
  mediaType: PropagandaMediaType;
  mimeType: string | null;
  size: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const DEFAULT_TRANSITION_STYLE = "architectural-curtain";

export function normalizePropagandaMediaType(
  value: string | null | undefined
): PropagandaMediaType {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "mp4") return "mp4";
  if (normalized === "gif") return "gif";
  if (normalized === "svg") return "svg";
  return "image";
}

export function normalizePropagandaCampaign(
  value: Record<string, unknown>
): PropagandaCampaign {
  const normalizedLegacyTransitionType = value.transition_media_type
    ? normalizePropagandaMediaType(String(value.transition_media_type))
    : null;
  const normalizedEntryTransitionType = value.transition_entry_media_type
    ? normalizePropagandaMediaType(String(value.transition_entry_media_type))
    : normalizedLegacyTransitionType;
  const normalizedExitTransitionType = value.transition_exit_media_type
    ? normalizePropagandaMediaType(String(value.transition_exit_media_type))
    : normalizedLegacyTransitionType;
  const legacyTransitionUrl = value.transition_media_url
    ? String(value.transition_media_url)
    : null;
  const legacyTransitionPath = value.transition_media_path
    ? String(value.transition_media_path)
    : null;

  return {
    id: Number(value.id || 0),
    nome: String(value.nome || ""),
    descricao: value.descricao ? String(value.descricao) : null,
    storageFolder: value.storage_folder ? String(value.storage_folder) : null,
    mediaType: normalizePropagandaMediaType(value.media_type as string),
    mediaUrl: String(value.media_url || ""),
    mediaPath: value.media_path ? String(value.media_path) : null,
    durationSeconds: Number(value.duration_seconds || 15),
    transitionStyle: String(
      value.transition_style || DEFAULT_TRANSITION_STYLE
    ),
    transitionMediaType: normalizedLegacyTransitionType,
    transitionMediaUrl: legacyTransitionUrl,
    transitionMediaPath: legacyTransitionPath,
    transitionEntryMediaType: normalizedEntryTransitionType,
    transitionEntryMediaUrl: value.transition_entry_media_url
      ? String(value.transition_entry_media_url)
      : legacyTransitionUrl,
    transitionEntryMediaPath: value.transition_entry_media_path
      ? String(value.transition_entry_media_path)
      : legacyTransitionPath,
    transitionExitMediaType: normalizedExitTransitionType,
    transitionExitMediaUrl: value.transition_exit_media_url
      ? String(value.transition_exit_media_url)
      : legacyTransitionUrl,
    transitionExitMediaPath: value.transition_exit_media_path
      ? String(value.transition_exit_media_path)
      : legacyTransitionPath,
    isActive: Boolean(value.is_active),
    createdAt: value.created_at ? String(value.created_at) : null,
    updatedAt: value.updated_at ? String(value.updated_at) : null,
  };
}

export function normalizePropagandaRuntime(
  value: Record<string, unknown> | null | undefined
): PropagandaRuntime | null {
  if (!value) return null;

  const normalizedLegacyTransitionType = value.active_transition_media_type
    ? normalizePropagandaMediaType(String(value.active_transition_media_type))
    : null;
  const normalizedEntryTransitionType = value.active_transition_entry_media_type
    ? normalizePropagandaMediaType(String(value.active_transition_entry_media_type))
    : normalizedLegacyTransitionType;
  const normalizedExitTransitionType = value.active_transition_exit_media_type
    ? normalizePropagandaMediaType(String(value.active_transition_exit_media_type))
    : normalizedLegacyTransitionType;
  const legacyTransitionUrl = value.active_transition_media_url
    ? String(value.active_transition_media_url)
    : null;
  const legacyTransitionPath = value.active_transition_media_path
    ? String(value.active_transition_media_path)
    : null;

  const statusValue = String(value.status || "idle").toLowerCase();
  const status =
    statusValue === "playing" || statusValue === "paused"
      ? (statusValue as "playing" | "paused")
      : "idle";

  return {
    scope: String(value.scope || "global"),
    status,
    activeCampaignId:
      value.active_campaign_id == null ? null : Number(value.active_campaign_id),
    activeCampaignName: value.active_campaign_name
      ? String(value.active_campaign_name)
      : null,
    activeStorageFolder: value.active_storage_folder
      ? String(value.active_storage_folder)
      : null,
    activeMediaType: value.active_media_type
      ? normalizePropagandaMediaType(String(value.active_media_type))
      : null,
    activeMediaUrl: value.active_media_url
      ? String(value.active_media_url)
      : null,
    activeMediaPath: value.active_media_path
      ? String(value.active_media_path)
      : null,
    activeTransitionStyle: String(
      value.active_transition_style || DEFAULT_TRANSITION_STYLE
    ),
    activeTransitionMediaType: normalizedLegacyTransitionType,
    activeTransitionMediaUrl: legacyTransitionUrl,
    activeTransitionMediaPath: legacyTransitionPath,
    activeTransitionEntryMediaType: normalizedEntryTransitionType,
    activeTransitionEntryMediaUrl: value.active_transition_entry_media_url
      ? String(value.active_transition_entry_media_url)
      : legacyTransitionUrl,
    activeTransitionEntryMediaPath: value.active_transition_entry_media_path
      ? String(value.active_transition_entry_media_path)
      : legacyTransitionPath,
    activeTransitionExitMediaType: normalizedExitTransitionType,
    activeTransitionExitMediaUrl: value.active_transition_exit_media_url
      ? String(value.active_transition_exit_media_url)
      : legacyTransitionUrl,
    activeTransitionExitMediaPath: value.active_transition_exit_media_path
      ? String(value.active_transition_exit_media_path)
      : legacyTransitionPath,
    activeDurationSeconds: Number(value.active_duration_seconds || 15),
    playbackToken: value.playback_token ? String(value.playback_token) : null,
    triggerSource: value.trigger_source ? String(value.trigger_source) : null,
    startedAt: value.started_at ? String(value.started_at) : null,
    endsAt: value.ends_at ? String(value.ends_at) : null,
    scheduleEnabled: Boolean(value.schedule_enabled),
    scheduleCampaignId:
      value.schedule_campaign_id == null
        ? null
        : Number(value.schedule_campaign_id),
    intervalMinutes:
      value.interval_minutes == null ? null : Number(value.interval_minutes),
    nextRunAt: value.next_run_at ? String(value.next_run_at) : null,
    updatedAt: value.updated_at ? String(value.updated_at) : null,
  };
}

export function isPropagandaRuntimePlaying(
  runtime: PropagandaRuntime | null | undefined
): boolean {
  if (!runtime || runtime.status !== "playing" || !runtime.activeMediaUrl) {
    return false;
  }

  if (!runtime.endsAt) return true;
  return new Date(runtime.endsAt).getTime() > Date.now();
}