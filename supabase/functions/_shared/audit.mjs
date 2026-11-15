// HIPAA audit trail for account changes made by edge functions.
// They use the service role, so the database can't tell which user asked; record it here.
export async function logAccountAction(admin, actorId, action, userId) {
    const { error } = await admin.from("phi_audit_log")
        .insert({ actor_id: actorId, action, table_name: "profiles", record_id: userId });
    if (error) console.error("Could not write the audit entry for", action);
}
