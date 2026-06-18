// RfP lifecycle state machine.
// Spec (CLAUDE.md):
//   created → validated → sent → presented →
//   approved | declined | expired → settled → matched → credited
//
// Rules:
//  - No state may be skipped.
//  - All transitions are idempotent: re-applying the current or a past
//    transition returns 'skip' rather than throwing.
//  - Terminal states (declined, expired, credited) accept no further transitions.

export type RfpState =
  | 'created'
  | 'validated'
  | 'sent'
  | 'presented'
  | 'approved'
  | 'declined'
  | 'expired'
  | 'settled'
  | 'matched'
  | 'credited';

// Ordinal for idempotency checks.  Branching states (approved/declined/expired)
// share ordinal 4 — once in any branch, earlier events are silently dropped.
const STATE_ORDINAL: Record<RfpState, number> = {
  created:   0,
  validated: 1,
  sent:      2,
  presented: 3,
  approved:  4,
  declined:  4,
  expired:   4,
  settled:   5,
  matched:   6,
  credited:  7,
};

const VALID_TRANSITIONS: Partial<Record<RfpState, RfpState[]>> = {
  created:   ['validated'],
  validated: ['sent'],
  // A bank may skip 'presented' and send decline/expire directly (e.g. immediate mandate rejection)
  sent:      ['presented', 'declined', 'expired'],
  presented: ['approved', 'declined', 'expired'],
  approved:  ['settled'],
  settled:   ['matched'],
  matched:   ['credited'],
};

export class StateMachineError extends Error {
  constructor(
    public readonly currentState: RfpState,
    public readonly requestedState: RfpState,
  ) {
    super(
      `Invalid transition: '${currentState}' → '${requestedState}'. ` +
      `Allowed from '${currentState}': ${(VALID_TRANSITIONS[currentState] ?? []).join(', ') || 'none (terminal)'}`,
    );
    this.name = 'StateMachineError';
  }
}

/**
 * Validate a state transition.
 *
 * Returns:
 *   'proceed' — transition is valid, apply it
 *   'skip'    — already in target state or a later state; idempotent no-op
 *
 * Throws StateMachineError for genuinely invalid transitions (e.g. skipping
 * a step, or transitioning out of a terminal state to a conflicting branch).
 */
export function assertTransition(from: RfpState, to: RfpState): 'proceed' | 'skip' {
  if (from === to) return 'skip';

  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) return 'proceed';

  // If the current state's ordinal is STRICTLY GREATER than the target's, the
  // target is in the past — idempotent skip.
  // We use strict > (not >=) so that same-ordinal conflicting branches
  // (e.g. declined vs approved, both ordinal 4) throw instead of silently skip.
  if (STATE_ORDINAL[from] > STATE_ORDINAL[to]) return 'skip';

  throw new StateMachineError(from, to);
}

/** True if the state accepts no further transitions. */
export function isTerminal(state: RfpState): boolean {
  return (VALID_TRANSITIONS[state] ?? []).length === 0;
}
