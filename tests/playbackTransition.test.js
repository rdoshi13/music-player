import { describe, expect, it } from "vitest";
import { getPlaybackTransitionPolicy } from "../src/lib/playbackTransition.js";

describe("playbackTransition policy", () => {
  it("prioritizes crossfade when both crossfade and gapless are enabled", () => {
    const policy = getPlaybackTransitionPolicy({
      crossfadeEnabled: true,
      crossfadeSeconds: 4,
      gaplessEnabled: true,
    });

    expect(policy.mode).toBe("crossfade");
    expect(policy.leadSeconds).toBe(4);
    expect(policy.disableCrossfadeOnTrigger).toBe(false);
  });

  it("uses gapless policy when crossfade is disabled", () => {
    const policy = getPlaybackTransitionPolicy({
      crossfadeEnabled: false,
      crossfadeSeconds: 4,
      gaplessEnabled: true,
    });

    expect(policy.mode).toBe("gapless");
    expect(policy.leadSeconds).toBeCloseTo(0.08, 5);
    expect(policy.disableCrossfadeOnTrigger).toBe(true);
  });

  it("returns none policy when no transition feature is enabled", () => {
    const policy = getPlaybackTransitionPolicy({
      crossfadeEnabled: false,
      crossfadeSeconds: 4,
      gaplessEnabled: false,
    });

    expect(policy.mode).toBe("none");
    expect(policy.leadSeconds).toBe(0);
    expect(policy.disableCrossfadeOnTrigger).toBe(true);
  });

  it("clamps crossfade lead seconds to supported range", () => {
    const lowPolicy = getPlaybackTransitionPolicy({
      crossfadeEnabled: true,
      crossfadeSeconds: 0,
      gaplessEnabled: false,
    });
    const highPolicy = getPlaybackTransitionPolicy({
      crossfadeEnabled: true,
      crossfadeSeconds: 99,
      gaplessEnabled: false,
    });

    expect(lowPolicy.leadSeconds).toBe(1);
    expect(highPolicy.leadSeconds).toBe(12);
  });
});

