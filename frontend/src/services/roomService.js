import { supabase } from "../supabase.js";

export async function getRooms() {
  const { data, error } = await supabase.rpc("get_rooms");

  if (error) {
    throw error;
  }

  return data ?? [];
}
