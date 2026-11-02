import { useState } from "react";
import { supabase } from "../supabase.js";
import { logout } from "../services/auth.js";
import "./ChangePassword.css";

export default function ChangePassword({ onDone }) {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    function validatePassword(password, confirm) {
        if (password.length < 8) {
            return "Password must be at least 8 characters long.";
        }
        if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
            return "Password must contain at least one letter and one number.";
        }
        if (password !== confirm) {
            return "Passwords do not match.";
        }
        return null;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");

        const validationError = validatePassword(newPassword, confirmPassword);
        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });
            if (updateError) throw updateError;

            const { error: rpcError } = await supabase.rpc("set_must_change_password_false");
            if (rpcError) throw rpcError;

            if (typeof onDone === "function") {
                onDone();
            }
        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to update password. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleSignOut() {
        setSigningOut(true);
        try {
            await logout();
        } catch (err) {
            console.error(err);
            setError("Unable to sign out. Please try again.");
        } finally {
            setSigningOut(false);
        }
    }

    return (
        <main className="change-password-page">
            <h1 className="change-password-title">UTEP EMR</h1>
            <div className="change-password-card">
                <h2 className="change-password-subtitle">Change Password</h2>
                <p className="change-password-description">
                    You must update your temporary password before continuing.
                </p>

                <form onSubmit={handleSubmit} className="change-password-form">
                    <div className="change-password-fields">
                        <div className="change-password-group">
                            <label htmlFor="new-password" className="change-password-label">
                                New Password
                            </label>
                            <input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                                placeholder="Enter at least 8 chars (letters and numbers)"
                                className="change-password-input"
                            />
                        </div>

                        <div className="change-password-group">
                            <label htmlFor="confirm-password" className="change-password-label">
                                Confirm Password
                            </label>
                            <input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                                placeholder="Re-enter your new password"
                                className="change-password-input"
                            />
                        </div>
                    </div>

                    <div className="change-password-policy-hint">
                        Password must be at least 8 characters long and contain at least one letter and one number.
                    </div>

                    {error && (
                        <p role="alert" className="change-password-error">
                            {error}
                        </p>
                    )}

                    <div className="change-password-actions">
                        <button
                            type="submit"
                            disabled={loading || signingOut}
                            className="change-password-submit-btn"
                        >
                            {loading ? "Updating..." : "Update Password"}
                        </button>

                        <button
                            type="button"
                            onClick={handleSignOut}
                            disabled={loading || signingOut}
                            className="change-password-signout-btn"
                        >
                            {signingOut ? "Signing out..." : "Sign Out"}
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}

