import "./IdleWarning.css";

export default function IdleWarning({ onStay }) {
    function handleStay(e) {
        e?.stopPropagation();
        onStay?.();
    }

    return (
        <div
            className="idle-warning-overlay"
            role="alertdialog"
            aria-live="assertive"
            aria-modal="true"
            aria-labelledby="idle-warning-title"
            aria-describedby="idle-warning-text"
        >
            <div className="idle-warning-box">
                <h3 id="idle-warning-title" className="idle-warning-title">Session Expiring</h3>
                <p id="idle-warning-text" className="idle-warning-text">
                    You’ll be signed out in 2 minutes due to inactivity.
                </p>
                <div className="idle-warning-actions">
                    <button
                        type="button"
                        autoFocus
                        onClick={handleStay}
                        className="idle-warning-button"
                    >
                        Stay signed in
                    </button>
                </div>
            </div>
        </div>
    );
}

