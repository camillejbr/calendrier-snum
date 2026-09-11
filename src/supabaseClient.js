import { createClient } from "@supabase/supabase-js";

// Defaults point at the production project; a local .env.local can
// override these to point the dev server at a staging project instead.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://trwisfwbkalhvnoeltym.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_JzBFXEynj95bf1Cv0ldu1g_jSQ6nkpB";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
