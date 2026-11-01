import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";


type EnrollBody = {

  studentId?: string;
  courseId?: string;
  courseNumber?: string;
  crn?: string;
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const {
      data: { user },
      error: userError,
    } = await ctx.supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse("You must be signed in", 401);
    }

    //     Only admins can put a student into a course
    const { data: callerProfile, error: profileError } =
      await ctx.supabaseAdmin
        .from("profiles")
        .select("account_type, active")
        .eq("user_id", user.id)
        .single();

    if (profileError || !callerProfile) {
      return errorResponse("Unable to verify your account.", 500);
    }

    if (!callerProfile.active || callerProfile.account_type !== "admin") {
      return errorResponse(
        "Only active admins can enroll students.",
        403,
      );
    }

    let body: EnrollBody;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed;
    } catch {
      return errorResponse("The request body must be a JSON object", 400);
    }

    const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
    const courseId = typeof body.courseId === "string" ? body.courseId.trim() : "";
    const courseNumber = typeof body.courseNumber === "string" ? body.courseNumber.trim() : "";
    const crn = typeof body.crn === "string" ? body.crn.trim() : "";
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuid.test(studentId) || (body.courseId != null && !uuid.test(courseId))
        || (!courseId && (!courseNumber || !crn || courseNumber.length > 100 || crn.length > 100))) {
      return errorResponse("Choose a valid student and an existing course", 400);
    }


    const { data: student, error: studentError } = await ctx.supabaseAdmin.from("profiles")
      .select("user_id").eq("user_id", studentId).eq("account_type", "student").eq("active", true).maybeSingle();
    if (studentError) return errorResponse("Unable to check the student.", 500);
    if (!student) return errorResponse("Choose an active student account", 400);

    //     Find the course, do not create a new one under the admin's name
    let query = ctx.supabaseAdmin.from("courses").select("id");
    query = courseId ? query.eq("id", courseId) : query.eq("course_number", courseNumber).eq("crn", crn);
    const { data: courses, error: courseError } = await query.limit(2);
    if (courseError) return errorResponse("Unable to check the course.", 500);
    if (!courses?.length) return errorResponse("Course not found. Create the course first, then retry enrollment.", 404);
    if (courses.length > 1) return errorResponse("More than one course matches. Open the correct course's Roster tab to import students.", 409);
    const course = courses[0];

    // Enroll the student — ignore if already enrolled
    const { error: enrollError } = await ctx.supabaseAdmin
      .from("course_enrollments")
      .upsert(
        { course_id: course.id, student_id: studentId, enrolled_by: user.id },
        { onConflict: "course_id,student_id", ignoreDuplicates: true },
      );


    if (enrollError) {
      return errorResponse(
        enrollError.message ?? "Unable to enroll the student.",
        500,
      );
    }

    return Response.json({ enrolled: true, courseId: course.id }, { status: 200 });
  }),};
