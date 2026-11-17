export function medicationName(entry) {
    if (typeof entry === "string") return entry || "Medication name not recorded";
    return entry?.medicine?.name || entry?.name || "Medication name not recorded";
}


export function medicationDetails(entry) {
    //     Some saved meds have a medicine inside and some keep the name directly
    const dose = [entry?.dosage, entry?.medicine?.unit || entry?.unit]
        .filter(value => value != null && value !== "").join(" ");
    const frequency = entry?.frequency;
    const instructions = entry?.instructions || (frequency != null && frequency !== ""
        ? (/^\d+(\.\d+)?$/.test(String(frequency)) ? `${frequency}x/day` : String(frequency)) : "");

    return [dose, instructions].filter(Boolean).join(", ");
}
