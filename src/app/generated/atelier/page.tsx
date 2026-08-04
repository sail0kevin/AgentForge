"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Menu,
  MoveUpRight,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type Work = {
  id: string;
  title: string;
  artist: string;
  medium: string;
  year: string;
  image: string;
  accent: string;
  description: string;
};

const works: Work[] = [
  {
    id: "01",
    title: "Afterimage / 01",
    artist: "Mira Sol",
    medium: "Light sculpture, acrylic, steel",
    year: "2026",
    image: "/atelier/work-01.jpg",
    accent: "coral",
    description: "A study of the moment a room remembers a body after it has left. Light becomes a physical residue, slowly changing with the viewer's movement.",
  },
  {
    id: "02",
    title: "Soft Errors",
    artist: "Yuki Arata",
    medium: "Generative film, 4-channel sound",
    year: "2025",
    image: "/atelier/work-02.jpg",
    accent: "blue",
    description: "A moving image work built from tiny deviations. Each loop drifts away from the previous one, finding beauty in systems that refuse to repeat themselves.",
  },
  {
    id: "03",
    title: "Held Breath",
    artist: "Noah Vale",
    medium: "Pigment, linen, found glass",
    year: "2026",
    image: "/atelier/work-03.jpg",
    accent: "green",
    description: "Color is suspended between surface and depth. The work asks what we notice when the act of looking becomes slower than the world around us.",
  },
];

const chapters = [
  { number: "01", label: "The room remembers", copy: "Objects become evidence. A trace of movement, a softened edge, a light that stays longer than it should." },
  { number: "02", label: "The image slips", copy: "Forms break their promises. Repetition loosens, systems drift, and the familiar becomes briefly strange." },
  { number: "03", label: "The body returns", copy: "The exhibition ends where attention begins: with a visitor, a pause, and the shape of being present." },
];

export default function AtelierPage() {
  const [activeWork, setActiveWork] = useState<Work | null>(null);
  const [chapter, setChapter] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="atelier-app">
      <header className="atelier-header">
        <a className="atelier-wordmark" href="#top" aria-label="ATELIER home">ATELIER<span>°</span></a>
        <nav className={`atelier-nav ${menuOpen ? "is-open" : ""}`} aria-label="Exhibition navigation">
          <a href="#exhibition" onClick={() => setMenuOpen(false)}>Exhibition</a>
          <a href="#works" onClick={() => setMenuOpen(false)}>Works</a>
          <a href="#visit" onClick={() => setMenuOpen(false)}>Visit</a>
        </nav>
        <div className="atelier-header-actions">
          <button className="atelier-sound" onClick={() => setSoundOn(!soundOn)} aria-label={soundOn ? "Mute exhibition sound" : "Play exhibition sound"} title={soundOn ? "Mute exhibition sound" : "Play exhibition sound"}>
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>{soundOn ? "sound on" : "sound off"}</span>
          </button>
          <button className="atelier-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open navigation" title="Open navigation"><Menu size={19} /></button>
        </div>
      </header>

      <section className="atelier-hero" id="top">
        <div className="atelier-hero-image" />
        <div className="atelier-hero-shade" />
        <div className="atelier-hero-meta"><span>ATELIER / 04</span><span>Shanghai · 2026</span></div>
        <div className="atelier-hero-copy">
          <p className="atelier-eyebrow">A group exhibition in three movements</p>
          <h1>Soft forms<br /><i>/ Hard light</i></h1>
          <div className="atelier-hero-foot"><span>01—03 / 2026</span><a href="#exhibition">Enter exhibition <ArrowDownRight size={16} /></a></div>
        </div>
        <div className="atelier-hero-index">scroll to explore <span>↓</span></div>
      </section>

      <section className="atelier-intro atelier-section" id="exhibition">
        <div className="atelier-section-marker"><span>01</span><span>Exhibition note</span></div>
        <div className="atelier-intro-copy"><p className="atelier-kicker">On the edge of perception</p><h2>What stays with us after the image is gone?</h2><p className="atelier-lede">Soft forms / Hard light brings together three artists working across sculpture, moving image, and material painting. Their works share a fascination with the unstable space between what we see and what we feel.</p><a className="atelier-inline-link" href="#works">View selected works <ArrowUpRight size={15} /></a></div>
        <div className="atelier-intro-note"><span>Curated by</span><strong>ATELIER Research Unit</strong><span>Exhibition design</span><strong>Common Room / 06</strong></div>
      </section>

      <section className="atelier-works atelier-section" id="works">
        <div className="atelier-section-heading"><div className="atelier-section-marker"><span>02</span><span>Selected works</span></div><p>Three artists, three ways of making an image hold its breath.</p></div>
        <div className="atelier-work-grid">
          {works.map((work, index) => <button className={`atelier-work-card atelier-work-card--${work.accent}`} key={work.id} onClick={() => setActiveWork(work)}>
            <span className="atelier-work-image" style={{ backgroundImage: `url(${work.image})` }} />
            <span className="atelier-work-number">{work.id}</span><span className="atelier-work-arrow"><MoveUpRight size={18} /></span>
            <span className="atelier-work-caption"><span><strong>{work.title}</strong><small>{work.artist}</small></span><em>{index === 1 ? "film" : "object"}</em></span>
          </button>)}
        </div>
      </section>

      <section className="atelier-chapters atelier-section">
        <div className="atelier-section-marker"><span>03</span><span>Three movements</span></div>
        <div className="atelier-chapter-layout"><div><p className="atelier-kicker">A slow walk through the exhibition</p><h2>{chapters[chapter].label}</h2><p className="atelier-chapter-copy">{chapters[chapter].copy}</p><div className="atelier-chapter-controls"><button onClick={() => setChapter((chapter + chapters.length - 1) % chapters.length)} aria-label="Previous chapter" title="Previous chapter"><ArrowLeft size={17} /></button><span>0{chapter + 1} <i>/</i> 03</span><button onClick={() => setChapter((chapter + 1) % chapters.length)} aria-label="Next chapter" title="Next chapter"><ArrowRight size={17} /></button></div></div><div className="atelier-chapter-list">{chapters.map((item, index) => <button className={index === chapter ? "is-active" : ""} key={item.number} onClick={() => setChapter(index)}><span>{item.number}</span><strong>{item.label}</strong><ChevronDown size={16} /></button>)}</div></div>
      </section>

      <section className="atelier-visit atelier-section" id="visit"><div className="atelier-visit-copy"><p className="atelier-kicker">Visit the exhibition</p><h2>Come for the image.<br /><i>Stay for the afterimage.</i></h2><div className="atelier-visit-details"><span>ATELIER / 04</span><span>18.06 — 30.08.2026</span><span>88 Fuxing West Road, Shanghai</span></div><button className="atelier-visit-button">Plan your visit <ArrowUpRight size={16} /></button></div><div className="atelier-visit-art"><div><span>LISTEN</span><Play size={19} fill="currentColor" /></div></div></section>

      <footer className="atelier-footer"><div><a className="atelier-wordmark" href="#top">ATELIER<span>°</span></a><p>Generated from AgentForge Product/UI reports</p></div><div className="atelier-footer-map"><span>experience</span><span>visual</span><span>engineering</span></div><span className="atelier-footer-year">© 2026 / A04</span></footer>

      {activeWork && <div className="atelier-modal-backdrop" onClick={() => setActiveWork(null)}><aside className="atelier-work-modal" role="dialog" aria-modal="true" aria-label={`${activeWork.title} details`} onClick={(event) => event.stopPropagation()}><button className="atelier-modal-close" onClick={() => setActiveWork(null)} aria-label="Close work details" title="Close work details"><X size={19} /></button><div className="atelier-modal-image" style={{ backgroundImage: `url(${activeWork.image})` }} /><div className="atelier-modal-copy"><p className="atelier-kicker">Work {activeWork.id} / {activeWork.year}</p><h2>{activeWork.title}</h2><strong>{activeWork.artist}</strong><p>{activeWork.description}</p><span>{activeWork.medium}</span></div></aside></div>}
    </main>
  );
}
