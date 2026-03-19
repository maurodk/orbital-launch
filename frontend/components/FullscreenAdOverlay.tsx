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

function renderMediaAsset(
  mediaType: PropagandaMediaType | null,
  mediaUrl: string | null,
  className: string,
  onEnded?: () => void,
  alt = "Propaganda"
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
        muted
        loop
        playsInline
        preload="auto"
        onEnded={onEnded}
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
  const outroRequestedRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutsRef.current = [];
  }, []);

  const startOutro = useCallback(() => {
    if (outroRequestedRef.current || !displayRuntime) return;

    outroRequestedRef.current = true;
    setPhase("outro");

    const hideTimeout = window.setTimeout(() => {
      setPhase("hidden");
      setDisplayRuntime(null);
      outroRequestedRef.current = false;
    }, OUTRO_DURATION_MS);

    timeoutsRef.current.push(hideTimeout);
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

    if (runtime.playbackToken === lastTokenRef.current && displayRuntime) {
      return;
    }

    lastTokenRef.current = runtime.playbackToken;
    outroRequestedRef.current = false;
    clearTimers();
    setDisplayRuntime(runtime);
    setPhase("intro");

    const introTimeout = window.setTimeout(() => {
      setPhase("content");
    }, INTRO_DURATION_MS);

    timeoutsRef.current.push(introTimeout);

    const endsAtMs = runtime.endsAt
      ? new Date(runtime.endsAt).getTime()
      : Date.now() + runtime.activeDurationSeconds * 1000;
    const outroDelay = Math.max(endsAtMs - Date.now() - OUTRO_DURATION_MS, 0);
    const outroTimeout = window.setTimeout(() => {
      startOutro();
    }, outroDelay);

    timeoutsRef.current.push(outroTimeout);
  }, [clearTimers, displayRuntime, phase, runtime, startOutro]);

  const mediaNode = useMemo(
    () =>
      renderMediaAsset(
        displayRuntime?.activeMediaType || null,
        displayRuntime?.activeMediaUrl || null,
        "fs-ad-overlay__media-asset fs-ad-overlay__media-asset--video",
        startOutro,
        displayRuntime?.activeCampaignName || "Propaganda"
      ),
    [displayRuntime, startOutro]
  );

  const transitionNode = useMemo(
    () =>
      renderMediaAsset(
        displayRuntime?.activeTransitionMediaType || null,
        displayRuntime?.activeTransitionMediaUrl || null,
        "fs-ad-overlay__transition-asset",
        undefined,
        `${displayRuntime?.activeCampaignName || "Propaganda"} transição`
      ),
    [displayRuntime]
  );

  if (!displayRuntime || phase === "hidden") {
    return null;
  }

  return (
    <div className={`fs-ad-overlay fs-ad-overlay--${phase}`}>
      <div className="fs-ad-overlay__veil" />
      {transitionNode ? (
        <div className={`fs-ad-overlay__transition-shell fs-ad-overlay__transition-shell--${phase}`}>
          {transitionNode}
        </div>
      ) : (
        <div className="fs-ad-overlay__panels" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={`panel-${index}`}
              className="fs-ad-overlay__panel"
              style={{ animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
      )}

      <div className="fs-ad-overlay__hud">
        <span className="fs-ad-overlay__tag">Propaganda Programada</span>
        <strong>{displayRuntime.activeCampaignName || "Peça institucional"}</strong>
      </div>

      <div className={`fs-ad-overlay__media-shell fs-ad-overlay__media-shell--${phase}`}>
        <div className="fs-ad-overlay__media-glow" aria-hidden="true" />
        <div className="fs-ad-overlay__media-frame">{mediaNode}</div>
      </div>
    </div>
  );
}