import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isPropagandaRuntimePlaying,
  type PropagandaMediaType,
  type PropagandaRuntime,
} from "../src/types/propaganda";
import "./FullscreenAdOverlay.css";

type OverlayPhase = "hidden" | "intro" | "content" | "outro";

interface FullscreenAdOverlayProps {
  runtime: PropagandaRuntime | null;
}

const INTRO_DURATION_MS = 1200;
const OUTRO_DURATION_MS = 1100;
const MIN_CONTENT_DURATION_MS = 400;

function renderMediaAsset(
  mediaType: PropagandaMediaType | null,
  mediaUrl: string | null,
  className: string,
  onEnded?: () => void,
  alt = "Propaganda",
  loop = false,
  muted = false,
  volume = 1
) {
  if (!mediaType || !mediaUrl) {
    return null;
  }

  if (mediaType === "mp4") {
    return (
      <video
        className={className}
        src={mediaUrl}
        autoPlay
        muted={muted}
        loop={loop}
        playsInline
        preload="auto"
        onEnded={onEnded}
        ref={(node) => {
          if (!node) return;
          node.muted = muted;
          node.volume = Math.max(0, Math.min(1, volume));
          const playPromise = node.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => undefined);
          }
        }}
      />
    );
  }

  return <img className={className} src={mediaUrl} alt={alt} />;
}

export function FullscreenAdOverlay({ runtime }: FullscreenAdOverlayProps) {
  const [phase, setPhase] = useState<OverlayPhase>("hidden");
  const [displayRuntime, setDisplayRuntime] = useState<PropagandaRuntime | null>(
    null
  );
  const lastTokenRef = useRef<string | null>(null);
  const completedTokenRef = useRef<string | null>(null);
  const outroRequestedRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutsRef.current = [];
  }, []);

  const finishPlayback = useCallback(() => {
    completedTokenRef.current = displayRuntime?.playbackToken || lastTokenRef.current;
    clearTimers();
    setPhase("hidden");
    setDisplayRuntime(null);
    outroRequestedRef.current = false;
  }, [clearTimers, displayRuntime]);

  const advanceToContent = useCallback(() => {
    setPhase("content");
  }, []);

  const startOutro = useCallback(() => {
    if (outroRequestedRef.current || !displayRuntime) return;

    outroRequestedRef.current = true;
    setPhase("outro");
  }, [displayRuntime]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!runtime || !isPropagandaRuntimePlaying(runtime) || !runtime.playbackToken) {
      if (displayRuntime && phase !== "hidden") {
        startOutro();
      }
      return;
    }

    if (
      runtime.playbackToken === completedTokenRef.current ||
      runtime.playbackToken === lastTokenRef.current
    ) {
      return;
    }

    lastTokenRef.current = runtime.playbackToken;
    completedTokenRef.current = null;
    outroRequestedRef.current = false;
    clearTimers();
    setDisplayRuntime(runtime);
    setPhase(
      runtime.activeTransitionEntryMediaType && runtime.activeTransitionEntryMediaUrl
        ? "intro"
        : "content"
    );
  }, [clearTimers, displayRuntime, phase, runtime, startOutro]);

  useEffect(() => {
    if (!displayRuntime || phase === "hidden") {
      return;
    }

    clearTimers();

    if (phase === "intro") {
      if (
        !displayRuntime.activeTransitionEntryMediaType ||
        !displayRuntime.activeTransitionEntryMediaUrl
      ) {
        setPhase("content");
        return;
      }

      if (displayRuntime.activeTransitionEntryMediaType !== "mp4") {
        const introTimeout = window.setTimeout(() => {
          setPhase("content");
        }, INTRO_DURATION_MS);
        timeoutsRef.current.push(introTimeout);
      }

      return;
    }

    if (phase === "content") {
      if (!displayRuntime.activeMediaType || !displayRuntime.activeMediaUrl) {
        startOutro();
        return;
      }

      if (displayRuntime.activeMediaType !== "mp4") {
        const endsAtMs = displayRuntime.endsAt
          ? new Date(displayRuntime.endsAt).getTime()
          : Date.now() + displayRuntime.activeDurationSeconds * 1000;
        const exitWindowMs =
          displayRuntime.activeTransitionExitMediaType &&
          displayRuntime.activeTransitionExitMediaUrl
            ? OUTRO_DURATION_MS
            : 0;
        const contentDelay = Math.max(
          endsAtMs - Date.now() - exitWindowMs,
          MIN_CONTENT_DURATION_MS
        );

        const contentTimeout = window.setTimeout(() => {
          startOutro();
        }, contentDelay);
        timeoutsRef.current.push(contentTimeout);
      }

      return;
    }

    if (
      phase === "outro" &&
      (!displayRuntime.activeTransitionExitMediaType ||
        !displayRuntime.activeTransitionExitMediaUrl)
    ) {
      finishPlayback();
      return;
    }

    if (phase === "outro" && displayRuntime.activeTransitionExitMediaType !== "mp4") {
      const hideTimeout = window.setTimeout(() => {
        finishPlayback();
      }, OUTRO_DURATION_MS);
      timeoutsRef.current.push(hideTimeout);
    }
  }, [clearTimers, displayRuntime, finishPlayback, phase, startOutro]);

  const mediaNode = useMemo(
    () =>
      renderMediaAsset(
        displayRuntime?.activeMediaType || null,
        displayRuntime?.activeMediaUrl || null,
        "fs-ad-overlay__media-asset fs-ad-overlay__media-asset--video",
        startOutro,
        displayRuntime?.activeCampaignName || "Propaganda",
        false,
        displayRuntime?.activeMediaMuted ?? false,
        displayRuntime?.activeMediaVolume ?? 1
      ),
    [displayRuntime, startOutro]
  );

  const transitionNode = useMemo(
    () =>
      renderMediaAsset(
        displayRuntime?.activeTransitionEntryMediaType || null,
        displayRuntime?.activeTransitionEntryMediaUrl || null,
        "fs-ad-overlay__transition-asset",
        advanceToContent,
        `${displayRuntime?.activeCampaignName || "Propaganda"} transição de entrada`,
        false,
        displayRuntime?.activeTransitionEntryMuted ?? false,
        displayRuntime?.activeTransitionEntryVolume ?? 1
      ),
    [advanceToContent, displayRuntime]
  );

  const exitTransitionNode = useMemo(
    () =>
      renderMediaAsset(
        displayRuntime?.activeTransitionExitMediaType || null,
        displayRuntime?.activeTransitionExitMediaUrl || null,
        "fs-ad-overlay__transition-asset",
        finishPlayback,
        `${displayRuntime?.activeCampaignName || "Propaganda"} transição de saída`,
        false,
        displayRuntime?.activeTransitionExitMuted ?? false,
        displayRuntime?.activeTransitionExitVolume ?? 1
      ),
    [displayRuntime, finishPlayback]
  );

  const phaseTransitionNode = phase === "intro" ? transitionNode : phase === "outro" ? exitTransitionNode : null;

  if (!displayRuntime || phase === "hidden") {
    return null;
  }

  return (
    <div className={`fs-ad-overlay fs-ad-overlay--${phase}`}>
      {phaseTransitionNode ? (
        <div className={`fs-ad-overlay__transition-shell fs-ad-overlay__transition-shell--${phase}`}>
          {phaseTransitionNode}
        </div>
      ) : phase === "intro" || phase === "outro" ? (
        <div className="fs-ad-overlay__panels" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={`panel-${index}`}
              className="fs-ad-overlay__panel"
              style={{ animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
      ) : null}

      <div className={`fs-ad-overlay__media-shell fs-ad-overlay__media-shell--${phase}`}>
        <div className="fs-ad-overlay__media-frame">{mediaNode}</div>
      </div>
    </div>
  );
}