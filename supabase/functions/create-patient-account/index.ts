import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { isDuplicateEmailError, validateStudentEmail } from "../_shared/student-validation.mjs";

const fail = (error: string, status: number) => Response.json({ error }, { status });

export default {
    fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
        if (req.method !== "POST") return fail("Method not allowed", 405);
        const { data: { user }, error: authError } = await ctx.supabase.auth.getUser();
        if (authError || !user) return fail("You must be signed in", 401);

        const { data: caller, error: callerError } = await ctx.supabaseAdmin.from("profiles")
            .select("account_type, active").eq("user_id", user.id).single();
        if (callerError) return fail("Unable to check your account", 500);
        if (!caller?.active || caller.account_type !== "admin") return fail("Only active admins can create patient accounts", 403);

        let body, email;
        try {
            body = await req.json();
            if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Enter the account details");
            email = validateStudentEmail(body.email);
            if (typeof body.patientId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.patientId)) {
                throw new Error("Choose a valid patient");
            }
            if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128
                || !/[a-z]/i.test(body.password) || !/[0-9]/.test(body.password)) {
                throw new Error("Use a temporary password with 8 to 128 characters, a letter and a number");
            }
        } catch (error) {
            return fail(error instanceof SyntaxError ? "Enter valid JSON" : (error as Error).message, 400);
        }

        const { data: patient, error: patientError } = await ctx.supabaseAdmin.from("patients")
            .select("id").eq("id", body.patientId).maybeSingle();
        if (patientError) return fail("Unable to check the patient", 500);
        if (!patient) return fail("Patient not found", 404);
        const { data: link, error: linkError } = await ctx.supabaseAdmin.from("patient_portal_accounts")
            .select("user_id").eq("patient_id", body.patientId).maybeSingle();
        if (linkError) return fail("Unable to check portal access", 500);
        if (link) return fail("This patient already has a portal account", 409);

        //     Make a new login, never change a student or staff login into a patient
        const { data, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
            email, password: body.password, email_confirm: true,
        });
        if (createError || !data?.user) return fail(isDuplicateEmailError(createError)
            ? "That email is already in use. No new account was created."
            : "Unable to create the patient account", isDuplicateEmailError(createError) ? 409 : 500);

        const { error: finishError } = await ctx.supabaseAdmin.rpc("finish_patient_portal_account", {
            p_user_id: data.user.id, p_patient_id: body.patientId,
        });
        if (finishError) {
            // If linking failed, stop the new login from being used
            const { error: removeError } = await ctx.supabaseAdmin.auth.admin.deleteUser(data.user.id);
            if (removeError) {
                await ctx.supabaseAdmin.from("profiles").update({ active: false }).eq("user_id", data.user.id);
                console.error("Portal account cleanup needs attention", data.user.id);
            }
            return fail("Portal setup did not finish. Check the patient's portal status before retrying.", 500);
        }
        return Response.json({ account: { id: data.user.id, email } }, { status: 201 });
    }),
};
