import { supabase } from "../supabase.js";

export const NO_LIVE_PATIENT_ACCESS = { read: false, register: false, schedule: false, checkIn: false };
export const FULL_LIVE_PATIENT_ACCESS = { read: true, register: true, schedule: true, checkIn: true };

// What this user may do with live patients. Admins and instructors may do everything;
// a student only through a non-clinical role (front desk, biller).
export async function getLivePatientAccess() {
    const { data, error } = await supabase.rpc("my_live_patient_access");
    if (error) throw error;
    return { ...NO_LIVE_PATIENT_ACCESS, ...(data ?? {}) };
}

export async function getMyClinicalRoles() {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) return [];

    const { data, error } = await supabase
        .from("profile_roles")
        .select(`roles(role_name)`)
        .eq("user_id", user.id);

    if (error) throw error;

    return (data ?? [])
        .map((item) => item.roles?.role_name)
        .filter(Boolean);
}