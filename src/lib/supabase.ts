import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bxbqciqyxvcrlkheszdk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UgmEXc6IiW7xpy13mtzj9g_28SSvzID";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

export const STORAGE_BUCKET = "evidencias_rodagens";
