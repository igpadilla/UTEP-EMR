// Shared by the forms and Edge Functions so both reject the same invalid values.
export function validateStudentIdentity(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Student details must be an object.");
    }
    const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
    const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
    if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
        throw new Error("First and last names must each contain 1 to 100 characters.");
    }
    return { firstName, lastName };
}

export function validateStudentEmail(value) {
    const email = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email address.");
    }
    return email;
}

export function validateStudentAccount(input) {
    const names = validateStudentIdentity(input);
    const email = validateStudentEmail(input.email);
    const password = typeof input.password === "string" ? input.password : "";
    // Keep the current minimum until the team agrees on a different password policy.
    if (password.length < 6) {
        throw new Error("The temporary password must contain at least 6 characters.");
    }
    return { ...names, email, password };
}

export function isDuplicateEmailError(error) {
    return ["email_exists", "user_already_exists", "email_address_already_exists"].includes(error?.code)
        || /already (?:been )?(?:registered|in use|exists)/i.test(error?.message ?? "");
}
