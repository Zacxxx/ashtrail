import type { Player } from "@ashtrail/core";
import { supabase } from "./supabaseClient";

const character_bucket = (import.meta.env.VITE_SUPABASE_CHARACTER_BUCKET as string | undefined) || "public-assets";

function extension_for_mime_type(mime_type: string): string {
    if (mime_type.includes("png")) return "png";
    if (mime_type.includes("jpeg") || mime_type.includes("jpg")) return "jpg";
    if (mime_type.includes("webp")) return "webp";
    return "bin";
}

async function upload_portrait_if_needed(user_id: string, character_id: string, portrait_url?: string): Promise<{ portrait_url?: string; portrait_path?: string }> {
    if (!portrait_url || !portrait_url.startsWith("data:image/")) {
        return { portrait_url };
    }

    const response = await fetch(portrait_url);
    const blob = await response.blob();
    const ext = extension_for_mime_type(blob.type || "image/png");
    const portrait_path = `characters/${user_id}/${character_id}.${ext}`;

    const { error: upload_error } = await supabase.storage
        .from(character_bucket)
        .upload(portrait_path, blob, {
            upsert: true,
            contentType: blob.type || "image/png",
        });

    if (upload_error) {
        throw new Error(`Portrait upload failed: ${upload_error.message}`);
    }

    const { data } = supabase.storage.from(character_bucket).getPublicUrl(portrait_path);
    return {
        portrait_url: data.publicUrl,
        portrait_path,
    };
}

export async function save_player_character(user_id: string, player: Player): Promise<Player> {
    const character_id = player.id || crypto.randomUUID();
    const with_id: Player = { ...player, id: character_id };

    const portrait = await upload_portrait_if_needed(user_id, character_id, with_id.portraitUrl);
    const persisted_player: Player = {
        ...with_id,
        portraitUrl: portrait.portrait_url || with_id.portraitUrl,
    };

    const row = {
        user_id,
        character_id,
        name: persisted_player.name,
        portrait_url: persisted_player.portraitUrl || null,
        portrait_path: portrait.portrait_path || null,
        payload: persisted_player,
    };

    const { error } = await supabase
        .from("player_characters")
        .upsert(row, { onConflict: "user_id,character_id" });

    if (error) {
        throw new Error(`Character save failed: ${error.message}`);
    }

    return persisted_player;
}

export async function load_latest_player_character(user_id: string): Promise<Player | null> {
    const { data, error } = await supabase
        .from("player_characters")
        .select("payload")
        .eq("user_id", user_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(`Character load failed: ${error.message}`);
    }

    return (data?.payload as Player) || null;
}

