import type { ReachoutStats } from "@/types/reachout";

/** Flags that drive the three outreach checkboxes. */
export interface OutreachFlags {
  reached_out: boolean;
  responded: boolean;
  followed_up: boolean;
  followed_up_manual: boolean;
}

/** A user toggle. `followed_up` is the manual checkbox, not the derived value. */
export type OutreachPatch = {
  reached_out?: boolean;
  responded?: boolean;
  followed_up?: boolean;
};

/**
 * Followed up is derived.
 * Responded forces reached out and followed up on, and disables the manual box.
 * Unchecking responded restores followed_up_manual.
 * A manual follow-up never changes responded.
 */
export function applyOutreachUpdate(
  current: OutreachFlags,
  patch: OutreachPatch,
): OutreachFlags {
  const responded = patch.responded ?? current.responded;
  let followed_up_manual = current.followed_up_manual;
  if (patch.followed_up !== undefined && !responded) {
    followed_up_manual = patch.followed_up;
  }
  const reached_out = responded
    ? true
    : (patch.reached_out ?? current.reached_out);
  const followed_up = responded ? true : followed_up_manual;
  return {
    reached_out,
    responded,
    followed_up,
    followed_up_manual,
  };
}

export function adjustReachoutStats(
  stats: ReachoutStats,
  before: OutreachFlags,
  after: OutreachFlags,
): ReachoutStats {
  const needed = (flags: OutreachFlags) =>
    flags.reached_out && !flags.responded && !flags.followed_up_manual;
  return {
    total: stats.total,
    reached_out:
      stats.reached_out + Number(after.reached_out) - Number(before.reached_out),
    responded:
      stats.responded + Number(after.responded) - Number(before.responded),
    needs_follow_up:
      stats.needs_follow_up + Number(needed(after)) - Number(needed(before)),
  };
}
