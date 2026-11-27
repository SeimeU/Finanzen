import type { ImportProfile } from "./profile";
import { tradeRepublicProfile } from "./tradeRepublic";

/** Built-in Import profiles, tried in this order. ELBA (ticket 14) and generic profiles (15) go here. */
export const BUILT_IN_PROFILES: readonly ImportProfile[] = [tradeRepublicProfile];
