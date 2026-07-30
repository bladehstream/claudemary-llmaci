/* ============================================================
   Banner text.

   Three pools, each with its own voice, fired at the moment it
   actually fits:

     CHEERS     - crossing a size milestone. Scaling-hype nonsense,
                  because a katamari getting bigger and a model
                  getting bigger attract identical commentary.
     BIG_CATCH  - swallowing something close to your own size.
                  This is the one moment in the game that genuinely
                  deserves "good catch".
     KNOCKS     - objects shaken loose by a hard impact. Owning a
                  mistake rather than brushing past it.

   Edit freely. Keep them short — the banner shrinks its font for
   longer strings but there is a limit to how much fits on screen.
   ============================================================ */

export const CHEERS = [
  'SCALING!',
  'EMERGENT!',
  'MORE PARAMETERS!',
  'BIGGER IS BETTER!',
  'CONTEXT EXPANDED!',
  'NEW CAPABILITY!',
  'OFF THE CHART!',
  'MEASURABLY LARGER!',
  'THAT TRACKS!',
];

export const BIG_CATCH = [
  'GOOD CATCH!',
  'YOU WERE RIGHT TO PUSH BACK ON THIS',
  'NICE CATCH!',
  'WORTH FLAGGING!',
  'LET ME BE DIRECT: HUGE',
  'CONFIRMED!',
  'VERIFIED!',
  'STRONG WORK!',
  'GLAD THAT LANDED!',
  'WITHIN CONTEXT!',
];

export const KNOCKS = [
  'OUCH!',
  'RATE LIMIT EXCEEDED!',
  'FLAGGED FOR SAFETY!',
  "DON'T HAND-WAVE THIS AWAY!",
  'I OWN THAT ONE',
  "THAT'S ON ME",
  'NOT IDEAL',
  'REPRODUCED!',
  'LET ME RE-VERIFY',
];

/** Cosmetic randomness only — never the physics RNG, which must stay reproducible. */
export function pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}
