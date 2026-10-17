/** Trusted backend time, canonical UTC ISO milliseconds; never supplied by a client request. */
export interface PersonalDeckClock {
  now(): string;
}
