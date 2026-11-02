// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { isDuplicateEmailError, validateStudentAccount } from "../_shared/student-validation.mjs";

/* Define the JSON data expected from the frontend
The function then validates each property before creating the account

*/
type CreateStudentBody = {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
};


/*
  Now, we create a JSON error response in case a field is missing
*/

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export default {
  // Require a valid, signed-in supabase user

  fetch: withSupabase({auth: "user"}, async (req, ctx) => {

    if (req.method !== "POST"){
      return errorResponse("Method not allowed", 405);
    }

    // Retrieve the authenticated user from the access token

    const {
      data: {user},
      error: userError,

    } = await ctx.supabase.auth.getUser();

    if(userError || !user){
      return errorResponse("You must be signed in", 401);
    }

    // Retrieve the caller's application profile

    const {data: callerProfile, error: profileError} =
    await ctx.supabaseAdmin
        .from("profiles")
        .select("account_type, active")
        .eq("user_id", user.id)
        .single();

    if(profileError || !callerProfile){
      return errorResponse("Unable to verify your account.", 500);
    }

    // Only admins and instructors may create student accounts
    // someone could call the endpoint directly so we need to limit the access

    const allowedRoles = ["admin", "instructor"];

    if(!callerProfile.active || !allowedRoles.includes(callerProfile.account_type))
    {
      return errorResponse(
        "Only active admins and instructors can create students.", 403,
      );
    }


    // Parse the JSON request body

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return errorResponse("The request body must be valid JSON", 400);
    }

    // Normalize submitted values before validation and storage
  // We need to remove any spaces on names, convert emails to lower case, etc

  let student: Required<CreateStudentBody>;
  try {
    student = validateStudentAccount(body);
  } catch (error) {
    return errorResponse((error as Error).message, 400);
  }
  const { firstName, lastName, email, password } = student;

  // create the account in supabase auth

  const {data: createdUser, error: createError} =
    await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm:true,
    });

    if (createError || !createdUser.user){
      if (isDuplicateEmailError(createError)) {
        return errorResponse("That email is already in use. No new account was created.", 409);
      }
      return errorResponse(
        createError?.message ?? "Unable to create the student account.",
        400,
      );
    }

    // update the profile that was automatically created by the database trigger

    const {error: updateError} = await ctx.supabaseAdmin
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      account_type: "student",
      must_change_password: true
    })
    .eq("user_id", createdUser.user.id)
    .select("user_id")
    .single();

    if(updateError){
      // roll back the auth account if its profile could not be updated
    await ctx.supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);

    return errorResponse(
      "The account was not created because its profile could not be updated.",
      500,
    );
    }

    // Return only the information the frontend needs

    return Response.json(
      {
        student: {
          id: createdUser.user.id,
          firstName,
          lastName,
          email,
          accountType: "student",
        },
      },
      {status: 201},

    );
  }),
};
