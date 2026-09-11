import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://trwisfwbkalhvnoeltym.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JzBFXEynj95bf1Cv0ldu1g_jSQ6nkpB";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
