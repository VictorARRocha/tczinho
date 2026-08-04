import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://duiwcahwyifmaqpjoddh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1aXdjYWh3eWlmbWFxcGpvZGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NjA3MzMsImV4cCI6MjEwMTQzNjczM30.vLVWfqSg5wRhy8BY5MaZGJ3nBrfF4L3jGIxL0uHwpx8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "agent-tc-auth",
  },
  realtime: { params: { eventsPerSecond: 5 } },
});

// Bucket oficial do Storage (com hífen)
export const STORAGE_BUCKET = "evidencias-rodagens";
// Buckets alternativos (compatibilidade com nomes antigos)
export const STORAGE_BUCKET_FALLBACKS = ["evidencias_rodagens", "evidencias"];
