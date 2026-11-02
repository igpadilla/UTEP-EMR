import { useEffect, useState } from "react";
import {
    getDiagnosticsCatalog,
    getDiagnosticOrders,
    createDiagnosticOrder,
    addDiagnosticResult,
    cancelDiagnosticOrder,
    evaluateLabValues,
    classifyAnalyteValue,
    getAttachmentUrl,
} from "../../services/diagnosticsService.js";
import "./DiagnosticsPanel.css";

const FLAG_LABELS = {
    normal: "Normal",
    low: "▼ L",
    high: "▲ H",
    critical_low: "◆ Critical L",
    critical_high: "◆ Critical H",
    abnormal: "▲ Abnormal",
    critical: "◆ Critical",
};

export default function DiagnosticsPanel({ patientId, caseId, locked = false }) {
    const [orders, setOrders] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [filter, setFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showOrderForm, setShowOrderForm] = useState(false);

    const [orderCategory, setOrderCategory] = useState("lab");
    const [selectedCode, setSelectedCode] = useState("");
    const [priority, setPriority] = useState("routine");
    const [indication, setIndication] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const [activeResultOrder, setActiveResultOrder] = useState(null);
    const [analyteInputs, setAnalyteInputs] = useState({});
    const [findings, setFindings] = useState("");
    const [impression, setImpression] = useState("");
    const [overallFlag, setOverallFlag] = useState("normal");
    const [attachmentFile, setAttachmentFile] = useState(null);

    useEffect(() => {
        loadAll();
    }, [patientId, caseId]);

    async function loadAll() {
        setLoading(true);
        setError("");
        try {
            const [ordersData, catalogData] = await Promise.all([
                getDiagnosticOrders({ patientId, caseId }),
                getDiagnosticsCatalog(),
            ]);
            setOrders(ordersData);
            setCatalog(catalogData);
            const firstLab = catalogData.find((i) => i.category === "lab");
            if (firstLab && !selectedCode) setSelectedCode(firstLab.code);
        } catch (err) {
            setError(err.message || "Could not load diagnostics.");
        } finally {
            setLoading(false);
        }
    }

    function handleCategoryChange(cat) {
        setOrderCategory(cat);
        const first = catalog.find((i) => i.category === cat);
        setSelectedCode(first?.code || "");
    }

    async function handleCreateOrder(e) {
        e.preventDefault();
        const item = catalog.find((i) => i.code === selectedCode);
        if (!item || !indication.trim()) return;

        setSubmitting(true);
        setError("");
        try {
            await createDiagnosticOrder({
                patientId,
                caseId,
                category: item.category,
                testCode: item.code,
                testName: item.name,
                codingSystem: item.coding_system,
                clinicalCode: item.clinical_code,
                specimenOrModality: item.specimen_or_modality,
                priority,
                clinicalIndication: indication.trim(),
                notes: notes.trim() || null,
            });
            setIndication("");
            setNotes("");
            setPriority("routine");
            setShowOrderForm(false);
            await loadAll();
        } catch (err) {
            setError(err.message || "Failed to place order.");
        } finally {
            setSubmitting(false);
        }
    }

    function openResultForm(order) {
        setActiveResultOrder(order);
        setAnalyteInputs({});
        setFindings("");
        setImpression("");
        setOverallFlag("normal");
        setAttachmentFile(null);
    }

    async function handleSaveResult(e) {
        e.preventDefault();
        if (!activeResultOrder) return;
        setSubmitting(true);
        setError("");

        try {
            let structuredValues = [];
            let finalFlag = overallFlag;

            if (activeResultOrder.category === "lab") {
                const rawEntries = Object.entries(analyteInputs)
                    .filter(([, v]) => v !== "" && v != null && Number.isFinite(Number(v)))
                    .map(([code, v]) => ({ code, value: Number(v) }));

                if (rawEntries.length > 0) {
                    const evalRes = await evaluateLabValues(activeResultOrder.test_code, rawEntries);
                    structuredValues = evalRes.analytes;
                    finalFlag = evalRes.overall_flag;
                }
            }

            await addDiagnosticResult({
                order: activeResultOrder,
                structuredValues,
                reportFindings: findings.trim() || null,
                reportImpression: impression.trim() || null,
                overallFlag: finalFlag,
                file: attachmentFile,
            });

            setActiveResultOrder(null);
            await loadAll();
        } catch (err) {
            setError(err.message || "Failed to save diagnostic result.");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCancelOrder(order) {
        const reason = window.prompt("Reason for cancelling this order (optional):");
        if (reason === null) return;
        try {
            await cancelDiagnosticOrder(order, reason.trim() || null);
            await loadAll();
        } catch (err) {
            setError(err.message || "Failed to cancel order.");
        }
    }

    async function handleOpenAttachment(filePath) {
        try {
            const url = await getAttachmentUrl(filePath);
            if (url) window.open(url, "_blank", "noopener,noreferrer");
        } catch (err) {
            setError(err.message || "Could not open attachment.");
        }
    }

    const filteredOrders = filter === "all" ? orders : orders.filter((o) => o.category === filter);
    const categoryOptions = catalog.filter((i) => i.category === orderCategory);
    const activeCatalogItem = activeResultOrder
        ? catalog.find((i) => i.code === activeResultOrder.test_code)
        : null;

    return (
        <section className="diagnostics-panel" aria-labelledby="diagnostics-heading">
            <div className="diagnostics-header">
                <div>
                    <h2 id="diagnostics-heading">Labs &amp; Imaging</h2>
                    <p className="diagnostics-subtitle">
                        {orders.length} {orders.length === 1 ? "order" : "orders"} on record
                    </p>
                </div>

                <div className="diagnostics-toolbar">
                    <div className="diagnostics-filter-group" role="group" aria-label="Filter diagnostics">
                        {[
                            { id: "all", label: "All" },
                            { id: "lab", label: "Labs" },
                            { id: "imaging", label: "Imaging" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={filter === tab.id ? "diagnostics-filter-btn active" : "diagnostics-filter-btn"}
                                onClick={() => setFilter(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {!locked && (
                        <button
                            type="button"
                            className="primary-action-button"
                            onClick={() => setShowOrderForm((v) => !v)}
                        >
                            {showOrderForm ? "Close Order Form" : "+ Place Order"}
                        </button>
                    )}
                </div>
            </div>

            {locked && (
                <p className="vitals-locked">This case has been submitted, so Labs &amp; Imaging are read-only.</p>
            )}

            {error && <p className="form-message form-message-error" role="alert">{error}</p>}

            {showOrderForm && !locked && (
                <form className="diagnostics-form-card" onSubmit={handleCreateOrder}>
                    <h3>New Diagnostic Order</h3>
                    <div className="diagnostics-form-grid">
                        <div className="diagnostics-field">
                            <label htmlFor="diag-category">Category</label>
                            <select
                                id="diag-category"
                                value={orderCategory}
                                onChange={(e) => handleCategoryChange(e.target.value)}
                            >
                                <option value="lab">Laboratory</option>
                                <option value="imaging">Imaging</option>
                            </select>
                        </div>

                        <div className="diagnostics-field">
                            <label htmlFor="diag-test">Study / Panel</label>
                            <select
                                id="diag-test"
                                value={selectedCode}
                                onChange={(e) => setSelectedCode(e.target.value)}
                                required
                            >
                                {categoryOptions.map((item) => (
                                    <option key={item.code} value={item.code}>
                                        {item.name} ({item.coding_system} {item.clinical_code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="diagnostics-field">
                            <label htmlFor="diag-priority">Priority</label>
                            <select
                                id="diag-priority"
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                            >
                                <option value="routine">Routine</option>
                                <option value="urgent">Urgent</option>
                                <option value="stat">STAT</option>
                            </select>
                        </div>
                    </div>

                    <div className="diagnostics-form-grid">
                        <div className="diagnostics-field">
                            <label htmlFor="diag-indication">Clinical Indication *</label>
                            <input
                                id="diag-indication"
                                type="text"
                                required
                                placeholder="e.g., Rule out anemia / Acute chest pain"
                                value={indication}
                                onChange={(e) => setIndication(e.target.value)}
                            />
                        </div>

                        <div className="diagnostics-field">
                            <label htmlFor="diag-notes">Order Notes (optional)</label>
                            <input
                                id="diag-notes"
                                type="text"
                                placeholder="Special specimen or contrast instructions"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="diagnostics-actions">
                        <button type="submit" className="primary-action-button" disabled={submitting}>
                            {submitting ? "Submitting…" : "Submit Order"}
                        </button>
                        <button type="button" className="secondary-action-button" onClick={() => setShowOrderForm(false)}>
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {activeResultOrder && !locked && (
                <form className="diagnostics-form-card" onSubmit={handleSaveResult}>
                    <h3>
                        Enter / Upload Results — {activeResultOrder.test_name} ({activeResultOrder.coding_system} {activeResultOrder.clinical_code})
                    </h3>

                    {activeResultOrder.category === "lab" && activeCatalogItem?.analytes?.length > 0 && (
                        <table className="diagnostics-table">
                            <thead>
                                <tr>
                                    <th>Analyte</th>
                                    <th>Value</th>
                                    <th>Unit</th>
                                    <th>Reference Range</th>
                                    <th>Flag</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeCatalogItem.analytes.map((analyte) => {
                                    const rawVal = analyteInputs[analyte.code] ?? "";
                                    const flag = rawVal !== "" ? classifyAnalyteValue(rawVal, analyte) : null;
                                    return (
                                        <tr key={analyte.code}>
                                            <td><strong>{analyte.name}</strong></td>
                                            <td>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    aria-label={analyte.name}
                                                    value={rawVal}
                                                    onChange={(e) =>
                                                        setAnalyteInputs((prev) => ({ ...prev, [analyte.code]: e.target.value }))
                                                    }
                                                    style={{ width: "110px", padding: "0.3rem" }}
                                                />
                                            </td>
                                            <td>{analyte.unit}</td>
                                            <td>
                                                {analyte.low != null && analyte.high != null
                                                    ? `${analyte.low}–${analyte.high}`
                                                    : "—"}
                                            </td>
                                            <td className={flag ? `diag-flag-${flag}` : ""}>
                                                {flag ? FLAG_LABELS[flag] : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    <div className="diagnostics-form-grid" style={{ marginTop: "0.75rem" }}>
                        {activeResultOrder.category === "imaging" && (
                            <div className="diagnostics-field">
                                <label htmlFor="result-overall-flag">Overall Impression Flag</label>
                                <select
                                    id="result-overall-flag"
                                    value={overallFlag}
                                    onChange={(e) => setOverallFlag(e.target.value)}
                                >
                                    <option value="normal">Normal</option>
                                    <option value="abnormal">Abnormal</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                        )}

                        <div className="diagnostics-field">
                            <label htmlFor="result-file">Attach Report / Image (PDF, PNG, JPG)</label>
                            <input
                                id="result-file"
                                type="file"
                                accept=".pdf,image/png,image/jpeg,image/webp"
                                onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                            />
                        </div>
                    </div>

                    <div className="diagnostics-form-grid">
                        <div className="diagnostics-field">
                            <label htmlFor="result-findings">
                                {activeResultOrder.category === "imaging" ? "Radiology Findings" : "Lab Notes / Specimen Comment"}
                            </label>
                            <textarea
                                id="result-findings"
                                rows={3}
                                value={findings}
                                onChange={(e) => setFindings(e.target.value)}
                                placeholder={
                                    activeResultOrder.category === "imaging"
                                        ? "Describe lungs, cardiac silhouette, osseous structures..."
                                        : "Optional laboratory technician or specimen remarks..."
                                }
                            />
                        </div>

                        <div className="diagnostics-field">
                            <label htmlFor="result-impression">Clinical Impression / Summary</label>
                            <textarea
                                id="result-impression"
                                rows={3}
                                value={impression}
                                onChange={(e) => setImpression(e.target.value)}
                                placeholder="Summary impression or diagnostic interpretation..."
                            />
                        </div>
                    </div>

                    <div className="diagnostics-actions">
                        <button type="submit" className="primary-action-button" disabled={submitting}>
                            {submitting ? "Saving Result…" : "Save Result"}
                        </button>
                        <button
                            type="button"
                            className="secondary-action-button"
                            onClick={() => setActiveResultOrder(null)}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <p role="status">Loading orders and results…</p>
            ) : filteredOrders.length === 0 ? (
                <p className="vitals-empty">No diagnostic orders recorded.</p>
            ) : (
                filteredOrders.map((order) => {
                    const latestResult = order.diagnostic_results?.[0] || null;
                    const cardClass = [
                        "diagnostics-card",
                        latestResult?.overall_flag === "critical" ? "diagnostics-card-critical" : "",
                        latestResult?.overall_flag === "abnormal" ? "diagnostics-card-abnormal" : "",
                    ].filter(Boolean).join(" ");

                    return (
                        <article key={order.id} className={cardClass}>
                            <div className="diagnostics-card-top">
                                <div>
                                    <strong>{order.test_name}</strong>
                                    {order.specimen_or_modality && (
                                        <span className="diagnostics-meta"> · {order.specimen_or_modality}</span>
                                    )}
                                </div>
                                <div className="diagnostics-badges">
                                    <span className={`diag-badge diag-badge-category-${order.category}`}>
                                        {order.category}
                                    </span>
                                    <span className="diag-badge diag-badge-code">
                                        {order.coding_system} {order.clinical_code}
                                    </span>
                                    <span className={`diag-badge diag-badge-priority-${order.priority}`}>
                                        {order.priority}
                                    </span>
                                    <span className={`diag-badge diag-badge-status-${order.status}`}>
                                        {order.status.replace("_", " ")}
                                    </span>
                                    {latestResult && (
                                        <span className={`diag-flag-${latestResult.overall_flag}`}>
                                            {FLAG_LABELS[latestResult.overall_flag] || latestResult.overall_flag}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <p className="diagnostics-indication">
                                <strong>Indication:</strong> {order.clinical_indication}
                                {order.notes ? ` — ${order.notes}` : ""}
                            </p>
                            <p className="diagnostics-meta">
                                Ordered by{" "}
                                {order.profiles
                                    ? `${order.profiles.first_name} ${order.profiles.last_name}`
                                    : "Provider"}{" "}
                                · {new Date(order.created_at).toLocaleString()}
                            </p>

                            {latestResult && (
                                <>
                                    {Array.isArray(latestResult.structured_values) &&
                                        latestResult.structured_values.length > 0 && (
                                            <table className="diagnostics-table">
                                                <thead>
                                                    <tr>
                                                        <th>Analyte</th>
                                                        <th>Result</th>
                                                        <th>Reference Range</th>
                                                        <th>Flag</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {latestResult.structured_values.map((row) => (
                                                        <tr key={row.code}>
                                                            <td>{row.name}</td>
                                                            <td>
                                                                <strong>{row.value}</strong> {row.unit}
                                                            </td>
                                                            <td>{row.reference_range}</td>
                                                            <td className={`diag-flag-${row.flag}`}>
                                                                {FLAG_LABELS[row.flag] || row.flag}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}

                                    {(latestResult.report_findings || latestResult.report_impression || latestResult.file_path) && (
                                        <div className="diagnostics-report-box">
                                            {latestResult.report_findings && (
                                                <p><strong>Findings:</strong> {latestResult.report_findings}</p>
                                            )}
                                            {latestResult.report_impression && (
                                                <p><strong>Impression:</strong> {latestResult.report_impression}</p>
                                            )}
                                            {latestResult.file_path && (
                                                <p style={{ marginTop: "0.4rem" }}>
                                                    <button
                                                        type="button"
                                                        className="secondary-action-button"
                                                        onClick={() => handleOpenAttachment(latestResult.file_path)}
                                                    >
                                                        📎 View Attachment ({latestResult.file_name || "File"})
                                                    </button>
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {!locked && order.status !== "cancelled" && order.status !== "completed" && (
                                <div className="diagnostics-actions">
                                    <button
                                        type="button"
                                        className="secondary-action-button"
                                        onClick={() => openResultForm(order)}
                                    >
                                        Enter / Upload Result
                                    </button>
                                    <button
                                        type="button"
                                        className="secondary-action-button"
                                        onClick={() => handleCancelOrder(order)}
                                    >
                                        Cancel Order
                                    </button>
                                </div>
                            )}
                        </article>
                    );
                })
            )}
        </section>
    );
}

