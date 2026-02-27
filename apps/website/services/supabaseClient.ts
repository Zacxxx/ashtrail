import { createClient } from "@supabase/supabase-js";

const supabase_url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabase_anon_key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabase_url || !supabase_anon_key) {
    console.warn("Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(
    supabase_url || "",
    supabase_anon_key || "",
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    }
);

