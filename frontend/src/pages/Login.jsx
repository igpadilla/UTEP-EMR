import { useState } from "react";
import { login } from "../services/auth.js";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();

        setError("");
        setLoading(true);

        try {
            await login(email, password);

            // App.jsx will detect the new Supabase session
            // and switch to the authenticated view.
        } catch (error) {
            console.error(error);
            setError("Invalid email or password.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="login-page">
            <h1 className="login-title">UTEP EMR</h1>
            <div className="scaffold-card">
                <p>Sign In</p>

                <form onSubmit={handleSubmit}>
                    <div className="form-fields">
                        <div className="form-group">
                            <label htmlFor="email" className="form-label">Email</label>

                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                autoComplete="email"
                                required
                                placeholder="Enter your email address"
                                className="form-input"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password" className="form-label">Password</label>

                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                                required
                                placeholder="Enter your password"
                                className="form-input"
                            />
                        </div>
                    </div>

                    {error && (
                        <p role="alert">
                            {error}
                        </p>
                    )}

                    <button type="submit" disabled={loading} className="signin-button">
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>
            </div>
        </main>
    );
}

