import { useEffect, useState } from "react";

export const ROLE_INFO = {
    med: { label: "Med Student", img: "/sim-icons/med.png", desc: "You will evaluate and treat a patient.", color: "#0ea5e9", bg: "#e0f2fe" },
    front_desk: { label: "Front Desk", img: "/sim-icons/front-desk.png", desc: "You will check in and discharge patients.", color: "#7c3aed", bg: "#ede9fe" },
    patient_actor: { label: "Patient Actor", img: "/sim-icons/patient-actor.png", desc: "You will act as a patient at the front desk.", color: "#d97706", bg: "#fef3c7" },
    observer: { label: "Observer", img: "/sim-icons/observer.png", desc: "You will watch the simulation.", color: "#64748b", bg: "#f1f5f9" },
};

export default function RoleReveal({ role, onDone }) {
    const [phase, setPhase] = useState("intro");
    const roleInfo = ROLE_INFO[role] ?? { label: role, img: "", desc: "", color: "#64748b", bg: "#f1f5f9" };

    useEffect(() => {
        const t1 = setTimeout(() => setPhase("reveal"), 1000);
        return () => clearTimeout(t1);
    }, []);

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            fontFamily: "inherit",
        }}>
            {phase === "intro" && (
                <p style={{
                    color: "rgba(255,255,255,0.6)", fontSize: "1.25rem", letterSpacing: "0.15em",
                    textTransform: "uppercase", animation: "sim-fadein 0.5s ease forwards",
                }}>
                    Get ready…
                </p>
            )}

            {phase === "reveal" && (
                <div style={{
                    textAlign: "center",
                    animation: "sim-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                }}>
                    <div style={{
                        width: "120px", height: "120px", borderRadius: "50%",
                        background: roleInfo.bg, display: "flex", alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 1.5rem", boxShadow: `0 0 40px ${roleInfo.color}66`,
                    }}>
                        {roleInfo.img && (
                            <img src={roleInfo.img} alt={roleInfo.label} style={{ width: "72px", height: "72px", objectFit: "contain" }} />
                        )}
                    </div>
                    <p style={{
                        color: "rgba(255,255,255,0.5)", fontSize: "0.875rem",
                        letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 0.5rem",
                    }}>
                        Your new role
                    </p>
                    <h1 style={{
                        color: "#fff", fontSize: "2.5rem", fontWeight: 800,
                        margin: "0 0 0.75rem", letterSpacing: "-0.02em",
                    }}>
                        {roleInfo.label}
                    </h1>
                    <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "1rem", margin: "0 0 2.5rem", maxWidth: "280px" }}>
                        {roleInfo.desc}
                    </p>
                    <button
                        type="button"
                        onClick={onDone}
                        style={{
                            background: roleInfo.color, color: "#fff", border: "none",
                            borderRadius: "10px", padding: "0.875rem 2.5rem",
                            fontSize: "1rem", fontWeight: 700, cursor: "pointer",
                            letterSpacing: "0.02em",
                            animation: "sim-fadein 0.4s ease 0.2s both",
                        }}
                    >
                        Start Simulation
                    </button>
                </div>
            )}

            <style>{`
                @keyframes sim-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes sim-pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
}
