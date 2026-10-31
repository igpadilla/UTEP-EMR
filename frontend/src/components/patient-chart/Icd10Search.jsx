import { useEffect, useState } from "react";
import "./Icd10Search.css";

let cachePromise = null;
function getIcd10() {
    if (!cachePromise) {
        cachePromise = fetch("/icd10cm-2027.json")
            .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
            .catch((err) => { cachePromise = null; throw err; });
    }
    return cachePromise;
}

export default function Icd10Search({ id, value, onChange, "aria-label": ariaLabel }) {
    const [query, setQuery] = useState("");
    const [matches, setMatches] = useState([]);
    const [data, setData] = useState(null);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        getIcd10().then(setData).catch(() => setLoadError(true));
    }, []);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 2 || !data) {
            setMatches([]);
            return;
        }
        const qLower = trimmed.toLowerCase();
        const words = qLower.split(/\s+/).filter(Boolean);
        const entries = Array.isArray(data.codes) ? data.codes : Object.entries(data.codes);
        const res = [];
        for (const [code, description] of entries) {
            const codeMatch = code.toLowerCase().startsWith(qLower) || code.toLowerCase().replace(".", "").startsWith(qLower);
            const descMatch = words.length > 0 && words.every((w) => description.toLowerCase().includes(w));
            if (codeMatch || descMatch) {
                res.push({ code, description });
                if (res.length === 20) break;
            }
        }
        setMatches(res);
    }, [query, data]);

    function select(item) {
        onChange(item);
        setQuery("");
        setMatches([]);
    }

    return (
        <div className="chart-icd10-search">
            <input
                id={id}
                aria-label={ariaLabel}
                type="text"
                placeholder={value ? (value.description ? `${value.code} — ${value.description}` : value.code) : "Search diagnosis code or description…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) select(matches[0]); } }}
            />
            {loadError && (
                <p className="form-message form-message-error" role="alert">
                    Could not load diagnosis codes.
                </p>
            )}
            {matches.length > 0 && (
                <ul className="chart-icd10-dropdown">
                    {matches.map((item) => (
                        <li key={item.code}>
                            <button type="button" onClick={() => select(item)}>
                                <strong>{item.code}</strong> — {item.description}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
