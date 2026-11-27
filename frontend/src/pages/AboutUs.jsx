import { useEffect, useRef } from "react";
import "./AboutUs.css";

const team = ["Fernando Muñoz", "Isaac Padilla", "Karina Rivera", "Nestor Escobedo", "Gildardo Orea"];

export default function AboutUs({ signedIn }) {
    const heading = useRef(null);
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "About Us | UTEP EMR";
        heading.current?.focus();
        return () => { document.title = previousTitle; };
    }, []);

    return <div className="about-page" data-role="instructor">
        <header className="about-header">
            <a className="about-brand" href="#" aria-label="UTEP EMR home">
                <span className="about-mark" aria-hidden="true">EMR</span>
                <span>UTEP Clinical Record System</span>
            </a>
            <a className="about-return" href="#">{signedIn ? "Back to app" : "Sign in"}</a>
        </header>
        <main className="about-content">
            <div className="about-intro">
                <section aria-labelledby="about-heading">
                    <h1 id="about-heading" ref={heading} tabIndex={-1}>About us</h1>
                    <p>We’re Team 3, a group of UTEP students building an electronic medical record system for classroom practice.</p>
                    <p>The project gives students a place to work through patient cases, write clinical notes, and practice using a medical record. Instructors can create cases and review student work.</p>
                    <p>All patient records are fictional and used for teaching.</p>
                </section>
                <aside className="about-project" aria-labelledby="about-project-heading">
                    <h2 id="about-project-heading">The project</h2>
                    <dl>
                        <div><dt>Course</dt><dd>Software Engineering Practicum</dd></div>
                        <div><dt>University</dt><dd>The University of Texas at El Paso</dd></div>
                        <div><dt>Team</dt><dd>Team 3</dd></div>
                    </dl>
                </aside>
            </div>
            <section className="about-team" aria-labelledby="about-team-heading">
                <h2 id="about-team-heading">Our team</h2>
                <ul>{team.map((name) => <li key={name}>{name}</li>)}</ul>
            </section>
        </main>
        <footer className="about-footer"><span>UTEP Educational EMR</span><span>For educational use only</span></footer>
    </div>;
}
