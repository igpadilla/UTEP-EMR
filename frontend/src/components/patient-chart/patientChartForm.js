function text(value) {
    return typeof value === "string" ? value : "";
}


//     Put the saved patient details into the form
export function demographicsToForm(patient) {
    const contact = patient.emergency_contacts?.[0] ?? {};
    return {
        first_name: text(patient.first_name),
        last_name: text(patient.last_name),
        age: patient.age == null ? "" : String(patient.age),
        date_of_birth: text(patient.date_of_birth),
        sex: text(patient.sex),
        occupation: text(patient.occupation),
        phone_number: text(patient.phone_number),
        email: text(patient.email),
        address: text(patient.address),
        contact_name: text(contact.name),
        contact_phone: text(contact.phone),
    };
}


export function localToday() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}


export function demographicsToUpdate(form, patient, today = localToday()) {
    const firstName = text(form.first_name).trim();
    const lastName = text(form.last_name).trim();
    if (!firstName || !lastName) throw new Error("First and last names are required.");

    const age = Number(form.age);
    if (String(form.age ?? "").trim() === "" || !Number.isInteger(age) || age < 0 || age > 150) {
        throw new Error("Age must be a whole number from 0 to 150.");
    }

    const birthDate = text(form.date_of_birth).trim();
    if (birthDate) {
        const parsed = new Date(`${birthDate}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(parsed.getTime())
            || parsed.toISOString().slice(0, 10) !== birthDate || birthDate > today) {
            throw new Error("Enter a valid date of birth that is not in the future.");
        }
    }

    const email = text(form.email).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email address or leave it blank.");
    }

    //     Keep any extra contacts and any details this form does not edit
    const contacts = Array.isArray(patient.emergency_contacts) ? patient.emergency_contacts : [];
    const primary = {
        ...contacts[0],
        name: text(form.contact_name).trim(),
        phone: text(form.contact_phone).trim(),
    };
    const hasPrimary = Object.values(primary).some((value) => value != null && String(value).trim() !== "");

    return {
        first_name: firstName,
        last_name: lastName,
        age,
        date_of_birth: birthDate || null,
        sex: text(form.sex).trim() || null,
        occupation: text(form.occupation).trim() || null,
        phone_number: text(form.phone_number).trim() || null,
        email: email || null,
        address: text(form.address).trim() || null,
        emergency_contacts: hasPrimary ? [primary, ...contacts.slice(1)] : contacts.slice(1),
    };
}


export function patientList(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}


export function historyToForm(patient) {
    return {
        allergies: patientList(patient.allergies).join("\n"),
        medical_history: patientList(patient.medical_history).join("\n"),
    };
}


//     Each line becomes one saved item
export function historyToUpdate(form) {
    function lines(value) {
        const seen = new Set();
        return text(value).split(/\r?\n/).map((item) => item.trim()).filter((item) => {
            const key = item.toLowerCase();
            if (!item || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    return { allergies: lines(form.allergies), medical_history: lines(form.medical_history) };
}
