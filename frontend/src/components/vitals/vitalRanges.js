export const VITAL_RANGES = {
    systolic_bp: { label: "Systolic BP", unit: "mmHg", low: 90, high: 139, critLow: 80, critHigh: 179 },
    diastolic_bp: { label: "Diastolic BP", unit: "mmHg", low: 60, high: 89, critHigh: 119 },
    heart_rate: { label: "Heart rate", unit: "bpm", low: 60, high: 100, critLow: 40, critHigh: 130 },
    resp_rate: { label: "Resp. rate", unit: "/min", low: 12, high: 20, critLow: 8,  critHigh: 30 },
    temperature_f: { label: "Temperature", unit: "°F", low: 97, high: 100.3, critLow: 95, critHigh: 103.9 },
    spo2: { label: "SpO₂", unit: "%", low: 95, critLow: 90 },
    bmi: { label: "BMI", unit: "kg/m²", low: 18.5, high: 24.9 },
    pain_score: { label: "Pain", unit: "/10", high: 6 },
};

// Returns "critical", "high", "low", or "" for normal or not taken.
export function getFlag(field, value) {
    const range = VITAL_RANGES[field];
    if (!range || value === null || value === undefined || value === "") return "";

    const number = Number(value);
    if (number < range.critLow || number > range.critHigh) return "critical";
    if (number > range.high) return "high";
    if (number < range.low) return "low";
    return "";
}
