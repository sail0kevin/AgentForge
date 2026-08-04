"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Heart,
  Menu,
  Pause,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

type Room = {
  id: string;
  title: string;
  artist: string;
  kind: "sound" | "image";
  image: string;
  color: string;
  duration: string;
  note: string;
};

const rooms: Room[] = [
  { id: "01", title: "Soft Signal", artist: "Mira Sol", kind: "sound", image: "/atelier/work-01.jpg", color: "rose", duration: "08:42", note: "A room-sized composition for light, breath and the small delay between seeing and remembering." },
  { id: "02", title: "A Place To Drift", artist: "Yuki Arata", kind: "image", image: "/atelier/work-02.jpg", color: "cobalt", duration: "04:18", note: "Moving images that refuse the loop. Every return is slightly altered by the last one." },
  { id: "03", title: "Low Tide Memory", artist: "Noah Vale", kind: "sound", image: "/atelier/work-03.jpg", color: "lime", duration: "12:06", note: "A field recording composed from water, metal and the hum of a city after midnight." },
  { id: "04", title: "The Warm Machine", artist: "Common Room", kind: "image", image: "/atelier/hero.jpg", color: "amber", duration: "06:31", note: "A visual study of systems that become tender when a human hand enters the frame." },
];

const filters = ["all", "sound", "image"] as const;
type Filter = (typeof filters)[number];

export default function NocturnePage() {
  const [activeId, setActiveId] = useState("01");
  const [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const active = rooms.find((room) => room.id === activeId) ?? rooms[0];
  // 筛选不改变当前预览，返回全部内容时可保留用户的浏览上下文。
  const visibleRooms = useMemo(() => (filter === "all" ? rooms : rooms.filter((room) => room.kind === filter)), [filter]);

  const moveActive = (direction: -1 | 1) => {
    const index = rooms.findIndex((room) => room.id === activeId);
    const nextIndex = (index + direction + rooms.length) % rooms.length;
    setActiveId(rooms[nextIndex].id);
    setPlaying(false);
  };
  const toggleSaved = (id: string) => setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <main className="nocturne-app">
      <header className="nocturne-header">
        <a className="nocturne-logo" href="#top" aria-label="NOCTURNE home">N<span>/</span>CTURNE</a>
        <nav className={`nocturne-nav ${menuOpen ? "is-open" : ""}`} aria-label="Nocturne navigation">
          <a href="#rooms" onClick={() => setMenuOpen(false)}>Rooms</a><a href="#journal" onClick={() => setMenuOpen(false)}>Journal</a><a href="#about" onClick={() => setMenuOpen(false)}>About</a>
        </nav>
        <div className="nocturne-header-actions"><button className="nocturne-icon-button" aria-label="Search" title="Search"><Search size={17} /></button><button className="nocturne-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open navigation" title="Open navigation"><Menu size={19} /></button></div>
      </header>

      <section className="nocturne-hero" id="top">
        <div className="nocturne-hero-rail"><span>NO. 04</span><span>SHANGHAI / 2026</span><span className="nocturne-rail-line" /></div>
        <div className="nocturne-hero-copy"><p className="nocturne-eyebrow">A digital listening room for visual people</p><h1>The shape<br /><i>of sound.</i></h1><p className="nocturne-hero-lede">Nocturne collects slow images, ambient scores and small pieces of evidence from the edges of attention.</p><a className="nocturne-enter" href="#rooms">Enter the rooms <ArrowUpRight size={16} /></a></div>
        <div className={`nocturne-feature nocturne-feature--${active.color}`}><div className="nocturne-feature-image" style={{ backgroundImage: `url(${active.image})` }} /><div className="nocturne-feature-grain" /><div className="nocturne-feature-label"><span>Now entering</span><strong>{active.title}</strong><small>{active.artist} / {active.kind}</small></div><button className="nocturne-feature-play" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause active room" : "Play active room"} title={playing ? "Pause active room" : "Play active room"}>{playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><div className="nocturne-feature-stepper"><button onClick={() => moveActive(-1)} aria-label="Previous room" title="Previous room"><ArrowRight size={16} className="nocturne-arrow-back" /></button><span>{active.id} / 04</span><button onClick={() => moveActive(1)} aria-label="Next room" title="Next room"><ArrowRight size={16} /></button></div></div>
        <div className="nocturne-hero-meta"><span>CURATED BY COMMON ROOM</span><span>LISTEN WITH HEADPHONES</span></div>
      </section>

      <section className="nocturne-room-section" id="rooms">
        <div className="nocturne-section-heading"><div><p className="nocturne-kicker">01 / The rooms</p><h2>Choose a frequency.</h2></div><p>Each room is a short encounter. Save the ones you want to return to when the day gets too loud.</p></div>
        <div className="nocturne-filter-row"><div className="nocturne-filters" role="tablist" aria-label="Filter rooms">{filters.map((item) => <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>{item}</button>)}</div><button className="nocturne-filter-button" aria-label="Open filter options" title="Open filter options"><SlidersHorizontal size={15} /> Curated sequence</button></div>
        <div className="nocturne-room-grid">{visibleRooms.map((room) => <article className={`nocturne-room-card nocturne-room-card--${room.color}`} key={room.id}><button className="nocturne-room-image" onClick={() => { setActiveId(room.id); setPlaying(false); }} aria-label={`Open ${room.title}`} style={{ backgroundImage: `url(${room.image})` }}><span>{room.id}</span><ArrowUpRight size={18} /></button><div className="nocturne-room-body"><div><p>{room.kind} / {room.duration}</p><h3>{room.title}</h3><span>{room.artist}</span></div><button className={`nocturne-save ${saved.includes(room.id) ? "is-saved" : ""}`} onClick={() => toggleSaved(room.id)} aria-label={saved.includes(room.id) ? `Remove ${room.title} from saved` : `Save ${room.title}`} title={saved.includes(room.id) ? "Remove from saved" : "Save for later"}><Heart size={16} fill={saved.includes(room.id) ? "currentColor" : "none"} /></button></div><p className="nocturne-room-note">{room.note}</p><button className="nocturne-open-link" onClick={() => { setActiveId(room.id); setDetailOpen(true); }}>Open room <ArrowRight size={15} /></button></article>)}</div>
      </section>

      <section className="nocturne-journal" id="journal"><div className="nocturne-journal-index">02 / Field notes</div><div className="nocturne-journal-content"><p className="nocturne-kicker">A note from the listening room</p><blockquote>The best interface is not the one that explains everything. It is the one that makes you want to stay.</blockquote><div className="nocturne-journal-footer"><span>COMMON ROOM / EDITION 04</span><a href="#about">Read the journal <ArrowUpRight size={15} /></a></div></div><div className="nocturne-journal-mark"><span>+</span><span>+</span><span>+</span></div></section>
      <section className="nocturne-about" id="about"><div><p className="nocturne-kicker">03 / About Nocturne</p><h2>Designed for the part of you that notices.</h2></div><p>NOCTURNE is a product concept generated from an AgentForge visual-first report: editorial hierarchy, immersive media, progressive discovery, and calm interaction states are treated as one system.</p><button className="nocturne-about-button"><Plus size={16} /> Join the listening list</button></section>
      <footer className="nocturne-footer"><a className="nocturne-logo" href="#top">N<span>/</span>CTURNE</a><span>Product/UI report demo / visual-first direction</span><span>(c) 2026</span></footer>
      {detailOpen && <div className="nocturne-modal-backdrop" onClick={() => setDetailOpen(false)}><aside className="nocturne-detail" role="dialog" aria-modal="true" aria-label={`${active.title} room details`} onClick={(event) => event.stopPropagation()}><button className="nocturne-close" onClick={() => setDetailOpen(false)} aria-label="Close room details" title="Close room details"><X size={18} /></button><div className="nocturne-detail-image" style={{ backgroundImage: `url(${active.image})` }} /><div className="nocturne-detail-copy"><p className="nocturne-kicker">Room {active.id} / {active.kind}</p><h2>{active.title}</h2><strong>{active.artist}</strong><p>{active.note}</p><button className="nocturne-detail-play" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />} {playing ? "Pause room" : "Play room"}</button></div></aside></div>}
    </main>
  );
}