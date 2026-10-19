import { VITAL_RANGES, getFlag, getBloodPressureFlag } from "./vitalRanges.js";

const FLAG_LABELS = { high: "▲ High", low: "▼ Low", critical: "◆ Critical" };

// Measures drawn as line charts (blood pressure has its own bar chart below).
const CHARTS = [
    { label: "Heart rate", unit: "bpm", field: "heart_rate" },
    { label: "Resp. rate", unit: "/min", field: "resp_rate" },
    { label: "Temperature", unit: "°F", field: "temperature_f" },
    { label: "SpO₂", unit: "%", field: "spo2" },
];

// Trends card. `columns` are the sets, oldest → newest, same order as the grid.
export default function VitalsTrends({ columns, formatTime }) {
    return (
        <div className="vitals-card">
            <div className="vitals-card-header">
                <h3>Trends</h3>
                <span>Shaded band = normal range · BP drawn as diastolic–systolic bars</span>
            </div>

            <div className="vitals-lane vitals-lane-times">
                <span>Measure · latest</span>
                {columns.map((set) => (
                    <span key={set.id}>{formatTime(set.measured_at)}</span>
                ))}
            </div>

            <BloodPressureLane columns={columns} />
            {CHARTS.map((chart) => (
                <LineLane key={chart.field} chart={chart} columns={columns} />
            ))}
        </div>
    );
}

function LineLane({ chart, columns }) {
    const values = columns.map((set) => set[chart.field]);
    const range = VITAL_RANGES[chart.field];
    const bandHigh = range.high ?? 100; // SpO₂ has no upper limit, 100% is the max
    const toY = makeScale([...values, range.low, bandHigh]);
    const latest = lastValue(values);

    const points = values.map((value, i) =>
        value === null ? null : { x: toX(i, columns.length), y: toY(value), flag: getFlag(chart.field, value) }
    );
    const line = points.filter(Boolean).map((p) => `${p.x},${p.y}`).join(" ");

    return (
        <div className="vitals-lane">
            <LaneLabel label={chart.label} unit={chart.unit} value={latest} flag={getFlag(chart.field, latest)} />
            <div className="vitals-chart" aria-hidden="true">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <rect className="vitals-band" x="0" width="100" y={toY(bandHigh)} height={toY(range.low) - toY(bandHigh)} />
                    <polyline points={line} vectorEffect="non-scaling-stroke" />
                </svg>
                {points.map((p, i) =>
                    p && <span key={i} className={`vitals-dot vitals-dot-${p.flag || "normal"}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} />
                )}
            </div>
        </div>
    );
}

function BloodPressureLane({ columns }) {
    const sys = VITAL_RANGES.systolic_bp;
    const dia = VITAL_RANGES.diastolic_bp;
    const values = columns.flatMap((set) => [set.systolic_bp, set.diastolic_bp]);
    const toY = makeScale([...values, dia.low, sys.high]);
    const latest = [...columns].reverse().find((set) => set.systolic_bp !== null);

    return (
        <div className="vitals-lane">
            <LaneLabel
                label="Blood pressure"
                unit="mmHg"
                value={latest ? `${latest.systolic_bp}/${latest.diastolic_bp ?? "—"}` : null}
                flag={latest ? getBloodPressureFlag(latest.systolic_bp, latest.diastolic_bp) : ""}
            />
            <div className="vitals-chart" aria-hidden="true">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <rect className="vitals-band" x="0" width="100" y={toY(sys.high)} height={toY(sys.low) - toY(sys.high)} />
                    <rect className="vitals-band" x="0" width="100" y={toY(dia.high)} height={toY(dia.low) - toY(dia.high)} />
                </svg>
                {columns.map((set, i) => {
                    if (set.systolic_bp === null || set.diastolic_bp === null) return null;
                    const flag = getBloodPressureFlag(set.systolic_bp, set.diastolic_bp) || "normal";
                    const top = toY(set.systolic_bp);
                    return (
                        <span
                            key={set.id}
                            className={`vitals-bp-bar vitals-dot-${flag}`}
                            style={{ left: `${toX(i, columns.length)}%`, top: `${top}%`, height: `${toY(set.diastolic_bp) - top}%` }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

function LaneLabel({ label, unit, value, flag }) {
    return (
        <div className="vitals-lane-label">
            <span className="vitals-lane-name">{label}</span>
            <span className={`vitals-lane-value ${flag ? `vitals-flag-${flag}` : ""}`}>
                {value ?? "—"} <small>{unit}</small>
            </span>
            {flag && <span className={`vitals-chip vitals-chip-${flag}`}>{FLAG_LABELS[flag]}</span>}
        </div>
    );
}

// Horizontal position (%) of column i: the middle of its column.
function toX(i, count) {
    return ((i + 0.5) / count) * 100;
}

// Returns a function that turns a value into a vertical position (%), top = 0.
function makeScale(numbers) {
    const list = numbers.filter((n) => n !== null && n !== undefined).map(Number);
    const min = Math.min(...list);
    const max = Math.max(...list);
    const pad = (max - min) * 0.15 || 5;
    return (value) => 100 - ((Number(value) - (min - pad)) / (max - min + 2 * pad)) * 100;
}

function lastValue(values) {
    return [...values].reverse().find((v) => v !== null && v !== undefined) ?? null;
}
