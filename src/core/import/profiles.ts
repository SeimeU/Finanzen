import { elbaProfile } from "./elba";
import type { ImportProfile } from "./profile";
import { tradeRepublicProfile } from "./tradeRepublic";

/** Built-in Import profiles, tried in this order. Generic profiles (ticket 15) go here. */
export const BUILT_IN_PROFILES: readonly ImportProfile[] = [tradeRepublicProfile, elbaProfile];
