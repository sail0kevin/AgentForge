import { ArrowUpRight, LayoutDashboard, Palette, Radio } from "lucide-react";

const demos = [
  { href: "/generated/attendance", type: "engineering_first", title: "Attendance OS", label: "Operations workspace", copy: "A calm operational dashboard for people, schedules, attention items and AI-assisted insight.", icon: LayoutDashboard, tone: "sage" },
  { href: "/generated/atelier", type: "visual_first", title: "ATELIER", label: "Digital exhibition", copy: "A spatial exhibition site with art direction, chapters, selected works and a slower reading rhythm.", icon: Palette, tone: "coral" },
  { href: "/generated/nocturne", type: "experience_first", title: "NOCTURNE", label: "Listening room", copy: "An immersive content product for sound and image, with discovery, saved rooms and detail states.", icon: Radio, tone: "lime" },
];

export default function GeneratedIndexPage() {
  return (
    <main className="showcase-app">
      <header className="showcase-header"><span className="showcase-mark">AG / GENERATED</span><span>AgentForge Product/UI runtime gallery</span><span>03 live cases</span></header>
      <section className="showcase-intro"><p className="showcase-kicker">From report to interface</p><h1>Three products.<br /><i>Three different worlds.</i></h1><p>These are runnable outputs from the same AgentForge reporting system. The report defines the product shape, visual language, flows and acceptance states; the interface is then built to make those decisions tangible.</p></section>
      <section className="showcase-grid" aria-label="Generated website demos">{demos.map(({ href, type, title, label, copy, icon: Icon, tone }, index) => <a className={`showcase-card showcase-card--${tone}`} href={href} key={href}><div className="showcase-card-top"><span>0{index + 1}</span><Icon size={19} /></div><div className="showcase-card-body"><span>{type}</span><h2>{title}</h2><h3>{label}</h3><p>{copy}</p><strong>Open live case <ArrowUpRight size={16} /></strong></div></a>)}</section>
      <footer className="showcase-footer"><span>Generated from AgentForge Product/UI reports</span><span>Implemented and verified cases only</span></footer>
    </main>
  );
}