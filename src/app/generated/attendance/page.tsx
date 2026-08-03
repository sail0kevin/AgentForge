"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Ellipsis,
  Fingerprint,
  Home,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
} from "lucide-react";

type AttendanceStatus = "在岗" | "远程" | "迟到" | "请假";

type Person = {
  id: number;
  name: string;
  role: string;
  team: string;
  time: string;
  status: AttendanceStatus;
  initials: string;
  color: string;
};

const people: Person[] = [
  { id: 1, name: "林若安", role: "产品设计师", team: "设计体验组", time: "08:54", status: "在岗", initials: "LA", color: "coral" },
  { id: 2, name: "周思远", role: "前端工程师", team: "产品工程组", time: "09:02", status: "迟到", initials: "ZY", color: "blue" },
  { id: 3, name: "许知夏", role: "研究员", team: "增长策略组", time: "08:47", status: "远程", initials: "ZX", color: "violet" },
  { id: 4, name: "沈嘉禾", role: "内容策略", team: "品牌内容组", time: "08:39", status: "在岗", initials: "JH", color: "mint" },
  { id: 5, name: "顾言川", role: "后端工程师", team: "产品工程组", time: "—", status: "请假", initials: "YC", color: "amber" },
];

const week = [
  { day: "周一", short: "12", value: 82 },
  { day: "周二", short: "13", value: 91 },
  { day: "周三", short: "14", value: 88 },
  { day: "周四", short: "15", value: 96 },
  { day: "周五", short: "16", value: 92, active: true },
];

const statusStyles: Record<AttendanceStatus, string> = {
  在岗: "attendance-status--present",
  远程: "attendance-status--remote",
  迟到: "attendance-status--late",
  请假: "attendance-status--leave",
};

function Avatar({ person, large = false }: { person: Person; large?: boolean }) {
  return <span className={`attendance-avatar attendance-avatar--${person.color} ${large ? "attendance-avatar--large" : ""}`}>{person.initials}</span>;
}

export default function AttendancePage() {
  const [checkedIn, setCheckedIn] = useState(false);
  const [activeNav, setActiveNav] = useState("概览");
  const [filter, setFilter] = useState<"全部" | AttendanceStatus>("全部");
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const visiblePeople = useMemo(() => {
    const filtered = filter === "全部" ? people : people.filter((person) => person.status === filter);
    return showAll ? filtered : filtered.slice(0, 4);
  }, [filter, showAll]);

  function handleCheckIn() {
    setCheckedIn(true);
    setNotice(true);
    window.setTimeout(() => setNotice(false), 3200);
  }

  return (
    <main className="attendance-app">
      <aside className={`attendance-sidebar ${mobileNavOpen ? "attendance-sidebar--open" : ""}`}>
        <div className="attendance-brand">
          <span className="attendance-brand-mark"><Sparkles size={17} strokeWidth={2.4} /></span>
          <span><strong>morrow</strong><small>PEOPLE OPERATIONS</small></span>
          <button className="attendance-icon-button attendance-sidebar-close" aria-label="关闭导航" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>

        <div className="attendance-workspace-switcher">
          <span className="attendance-workspace-dot" />
          <span><b>Northstar Studio</b><small>成长中的创意团队</small></span>
          <ChevronDown size={15} />
        </div>

        <nav className="attendance-nav" aria-label="主导航">
          <p>工作台</p>
          {[
            ["概览", LayoutDashboard],
            ["团队", Users],
            ["日历", CalendarDays],
          ].map(([label, Icon]) => {
            const NavIcon = Icon as typeof LayoutDashboard;
            return <button key={label as string} className={`attendance-nav-item ${activeNav === label ? "is-active" : ""}`} onClick={() => { setActiveNav(label as string); setMobileNavOpen(false); }}><NavIcon size={17} /><span>{label as string}</span>{label === "团队" && <em>24</em>}</button>;
          })}
          <p className="attendance-nav-heading">管理</p>
          {[
            ["报告", ArrowDownToLine],
            ["设置", Settings2],
          ].map(([label, Icon]) => {
            const NavIcon = Icon as typeof LayoutDashboard;
            return <button key={label as string} className={`attendance-nav-item ${activeNav === label ? "is-active" : ""}`} onClick={() => { setActiveNav(label as string); setMobileNavOpen(false); }}><NavIcon size={17} /><span>{label as string}</span></button>;
          })}
        </nav>

        <div className="attendance-sidebar-bottom">
          <div className="attendance-help-card">
            <span className="attendance-help-icon"><Fingerprint size={16} /></span>
            <div><strong>打卡有问题？</strong><p>查看帮助中心</p></div>
            <ArrowUpRight size={15} />
          </div>
          <div className="attendance-profile">
            <span className="attendance-profile-avatar">YC</span>
            <span><b>Yuki Chen</b><small>管理员</small></span>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button className="attendance-nav-scrim" aria-label="关闭导航" onClick={() => setMobileNavOpen(false)} />}

      <section className="attendance-main">
        <header className="attendance-header">
          <button className="attendance-icon-button attendance-menu-button" aria-label="打开导航" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button>
          <div className="attendance-breadcrumb"><span>工作台</span><span>/</span><strong>{activeNav}</strong></div>
          <div className="attendance-header-actions">
            <div className="attendance-date"><CalendarDays size={16} /><span>2024年 06月 16日</span><ChevronDown size={14} /></div>
            <button className="attendance-icon-button" aria-label="搜索"><Search size={17} /></button>
            <button className="attendance-icon-button attendance-notification-button" aria-label="通知" onClick={() => setNotice(true)}><Bell size={17} /><i /></button>
            <button className="attendance-export-button"><Download size={15} /> 导出报告</button>
          </div>
        </header>

        <div className="attendance-content">
          <div className="attendance-page-intro">
            <div><p className="attendance-eyebrow">FRIDAY · 16 JUN 2024</p><h1>早上好，Yuki <span>✦</span></h1><p>一眼看清团队状态，把时间留给真正重要的事。</p></div>
            <div className="attendance-live-pill"><span /> 数据实时更新 · 09:18</div>
          </div>

          <section className="attendance-hero">
            <div className="attendance-hero-copy">
              <span className="attendance-hero-label"><Fingerprint size={14} /> 今日打卡</span>
              <h2>{checkedIn ? "你已在岗，今天也会很顺利。" : "准备好开始今天的工作了吗？"}</h2>
              <p>{checkedIn ? "打卡时间 09:18 · 已记录到团队考勤" : "确认位置后完成打卡，团队状态会同步更新。"}</p>
              <button className="attendance-checkin-button" onClick={handleCheckIn} disabled={checkedIn}>{checkedIn ? <><Check size={17} /> 已完成打卡</> : <><Fingerprint size={17} /> 立即打卡</>}</button>
            </div>
            <div className="attendance-hero-art" aria-hidden="true">
              <div className="attendance-orbit attendance-orbit--one" /><div className="attendance-orbit attendance-orbit--two" />
              <div className="attendance-sun"><Sparkles size={28} /></div>
              <span className="attendance-art-note attendance-art-note--one">09:18</span><span className="attendance-art-note attendance-art-note--two">ON TIME</span>
            </div>
          </section>

          <section className="attendance-kpi-grid" aria-label="今日概览">
            <article className="attendance-kpi-card attendance-kpi-card--main"><div className="attendance-kpi-top"><span>今日出勤率</span><span className="attendance-trend"><ArrowUpRight size={14} /> 4.8%</span></div><div className="attendance-kpi-value">92<span>%</span></div><div className="attendance-progress"><i style={{ width: "92%" }} /></div><small>比上周五高出 4 人</small></article>
            <article className="attendance-kpi-card"><div className="attendance-kpi-top"><span>准时到岗</span><span className="attendance-kpi-icon attendance-kpi-icon--green"><Clock3 size={16} /></span></div><div className="attendance-kpi-value">86<span>%</span></div><small>20 人已准时到岗</small></article>
            <article className="attendance-kpi-card"><div className="attendance-kpi-top"><span>远程办公</span><span className="attendance-kpi-icon attendance-kpi-icon--blue"><Home size={16} /></span></div><div className="attendance-kpi-value">18<span>人</span></div><small>占团队总数的 75%</small></article>
            <article className="attendance-kpi-card"><div className="attendance-kpi-top"><span>需要关注</span><span className="attendance-kpi-icon attendance-kpi-icon--orange"><Bell size={16} /></span></div><div className="attendance-kpi-value">3<span>项</span></div><small>2 人迟到 · 1 人缺卡</small></article>
          </section>

          <div className="attendance-section-grid">
            <section className="attendance-panel attendance-team-panel">
              <div className="attendance-panel-heading"><div><p className="attendance-panel-kicker">LIVE STATUS</p><h2>团队状态</h2></div><button className="attendance-text-button" onClick={() => setShowAll((value) => !value)}>{showAll ? "收起" : "查看全部"} <ArrowUpRight size={14} /></button></div>
              <div className="attendance-filter-row">{(["全部", "在岗", "远程", "迟到", "请假"] as const).map((item) => <button key={item} className={filter === item ? "is-selected" : ""} onClick={() => { setFilter(item); setShowAll(item !== "全部"); }}>{item}</button>)}</div>
              <div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th>成员</th><th>团队</th><th>打卡时间</th><th>状态</th><th /></tr></thead><tbody>{visiblePeople.map((person) => <tr key={person.id}><td><div className="attendance-person"><Avatar person={person} /><span><b>{person.name}</b><small>{person.role}</small></span></div></td><td><span className="attendance-team-label">{person.team}</span></td><td><span className="attendance-time">{person.time}</span></td><td><span className={`attendance-status ${statusStyles[person.status]}`}><i />{person.status}</span></td><td><button className="attendance-row-menu" aria-label={`${person.name} 更多操作`}><Ellipsis size={17} /></button></td></tr>)}</tbody></table></div>
              <div className="attendance-panel-footer"><span>显示 {visiblePeople.length} / 24 位成员</span><div className="attendance-people-stack"><Avatar person={people[0]} /><Avatar person={people[1]} /><Avatar person={people[2]} /><span>+21</span></div></div>
            </section>

            <section className="attendance-panel attendance-rhythm-panel"><div className="attendance-panel-heading"><div><p className="attendance-panel-kicker">THIS WEEK</p><h2>出勤节奏</h2></div><button className="attendance-icon-button" aria-label="更多图表选项"><MoreHorizontal size={18} /></button></div><div className="attendance-chart"><div className="attendance-chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span></div><div className="attendance-chart-area"><div className="attendance-chart-grid"><i /><i /><i /><i /></div><div className="attendance-bars">{week.map((item) => <div className={`attendance-bar-column ${item.active ? "is-active" : ""}`} key={item.short}><div className="attendance-bar-value">{item.value}%</div><div className="attendance-bar" style={{ height: `${item.value * 0.9}%` }} /><span>{item.day}</span><small>{item.short}</small></div>)}</div></div></div><div className="attendance-chart-note"><span className="attendance-note-dot" /><span>本周平均出勤率</span><strong>89.8%</strong><ArrowUpRight size={14} /></div></section>
          </div>

          <div className="attendance-bottom-grid">
            <section className="attendance-panel attendance-attention-panel"><div className="attendance-panel-heading"><div><p className="attendance-panel-kicker">NEEDS ATTENTION</p><h2>待处理事项 <span>3</span></h2></div><button className="attendance-icon-button" aria-label="更多待处理事项"><MoreHorizontal size={18} /></button></div><div className="attendance-attention-list"><div className="attendance-attention-item"><span className="attendance-attention-icon attendance-attention-icon--orange"><Clock3 size={16} /></span><span><b>周思远打卡迟到</b><small>已迟到 02 分钟 · 产品工程组</small></span><button aria-label="处理周思远迟到"><ArrowUpRight size={16} /></button></div><div className="attendance-attention-item"><span className="attendance-attention-icon attendance-attention-icon--purple"><CalendarDays size={16} /></span><span><b>审批 1 个请假申请</b><small>顾言川 · 6月16日全天</small></span><button aria-label="处理请假申请"><ArrowUpRight size={16} /></button></div><div className="attendance-attention-item"><span className="attendance-attention-icon attendance-attention-icon--blue"><Fingerprint size={16} /></span><span><b>补卡申请待确认</b><small>林若安 · 6月14日 09:03</small></span><button aria-label="处理补卡申请"><ArrowUpRight size={16} /></button></div></div></section>
            <section className="attendance-panel attendance-insight-panel"><div className="attendance-insight-badge"><Sparkles size={15} /> AI INSIGHT</div><h2>团队今天状态不错</h2><p>出勤率比上周同期提升了 <strong>4.8%</strong>。设计体验组全员准时，值得在周会上分享这个节奏。</p><div className="attendance-insight-footer"><span><CheckCircle2 size={15} /> 基于本周 5 天数据</span><button className="attendance-text-button">查看趋势 <ArrowUpRight size={14} /></button></div></section>
          </div>

          <footer className="attendance-footer"><span>morrow · 让团队状态变得简单</span><span>数据更新于 09:18 <span className="attendance-footer-dot" /></span></footer>
        </div>
      </section>

      {notice && <div className="attendance-toast"><CheckCircle2 size={18} /><span>{checkedIn ? "打卡成功，团队状态已更新" : "你有 3 项待处理事项"}</span><button aria-label="关闭提示" onClick={() => setNotice(false)}><X size={15} /></button></div>}
    </main>
  );
}
