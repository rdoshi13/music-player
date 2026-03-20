const CROSSFADE_MIN_SECONDS = 1;
const CROSSFADE_MAX_SECONDS = 12;
const GAPLESS_LEAD_SECONDS = 0.08;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const getPlaybackTransitionPolicy = ({
  crossfadeEnabled,
  crossfadeSeconds,
  gaplessEnabled,
}) => {
  if (crossfadeEnabled) {
    return {
      mode: "crossfade",
      leadSeconds: clamp(Number(crossfadeSeconds) || 0, CROSSFADE_MIN_SECONDS, CROSSFADE_MAX_SECONDS),
      disableCrossfadeOnTrigger: false,
    };
  }

  if (gaplessEnabled) {
    return {
      mode: "gapless",
      leadSeconds: GAPLESS_LEAD_SECONDS,
      disableCrossfadeOnTrigger: true,
    };
  }

  return {
    mode: "none",
    leadSeconds: 0,
    disableCrossfadeOnTrigger: true,
  };
};

