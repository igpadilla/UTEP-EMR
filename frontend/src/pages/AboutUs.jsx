import { useEffect, useRef } from "react";
import "./AboutUs.css";

const team = [
    { name: "Fernando Muñoz", photo: null },
    { name: "Isaac Padilla", photo: null },
    { name: "Karina Rivera", photo: null },
    { name: "Nestor Escobedo", photo: null },
    { name: "Gildardo Orea", photo: null },
];
const groupPhoto = null;

export default function AboutUs({ signedIn, embedded = false }) {
    const heading = useRef(null);
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "About Us | UTEP EMR";
        heading.current?.focus();
        return () => { document.title = previousTitle; };
    }, []);

    return <div className={`about-page${embedded ? " about-embedded" : ""}`} data-role={embedded ? undefined : "instructor"}>
        {!embedded && <header className="about-header">
            <a className="about-brand" href="#" aria-label="UTEP EMR home">
                <span className="about-mark" aria-hidden="true">EMR</span>
                <span>UTEP Clinical Record System</span>
            </a>
            <a className="about-return" href="#">{signedIn ? "Back to app" : "Sign in"}</a>
        </header>}
        <main className="about-content">
            <section className="about-intro" aria-labelledby="about-heading">
                <h1 id="about-heading" ref={heading} tabIndex={-1}>About us</h1>
                <p>EMR is a website where professors can help students learn by using simulated patient cases. Students can review patient records, write clinical notes, and practice the steps of a patient visit. Professors can create cases and review their work.</p>
            </section>
            <section className="about-team" aria-labelledby="about-team-heading">
                <h2 id="about-team-heading">Our team</h2>
                <div className="about-team-layout">
                    <ul className="about-team-list">{team.map(({ name, photo }) => <li key={name}>
                        {photo ? <img className="about-portrait" src={photo} alt={name} /> : <div className="about-portrait about-photo-space" aria-label={`Photo space for ${name}`}>Photo</div>}
                        <span>{name}</span>
                    </li>)}</ul>
                    <figure className="about-group-photo">
                        {groupPhoto ? <img src={groupPhoto} alt="The EMR project team" /> : <div className="about-photo-space">Group photo</div>}
                    </figure>
                </div>
            </section>
        </main>
        {!embedded && <footer className="about-footer"><span>UTEP EMR</span></footer>}
    </div>;
}
