# Dark Mode Patch for workspace-app.tsx

## Step 1: Add Moon, Sun icons to imports (around line 14)
Change:
  import { Bot, Boxes, Check, GitBranch, KeyRound, Languages, Loader2, MessageSquareText, Pencil, Plus, Save, Search, SendHorizontal, Settings, Sparkles, Trash2, Wrench, Upload, FileText, X } from "lucide-react";
To:
  import { Bot, Boxes, Check, GitBranch, KeyRound, Languages, Loader2, MessageSquareText, Moon, Pencil, Plus, Save, Search, SendHorizontal, Settings, Sparkles, Sun, Trash2, Wrench, Upload, FileText, X } from "lucide-react";

## Step 2: In TopBar function, add dark state after the existing useState declarations
  const [dark, setDark] = useState(typeof window !== "undefined" && window.localStorage.getItem("theme") === "dark");

## Step 3: In TopBar, add useEffect to persist dark mode
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); window.localStorage.setItem("theme", dark ? "dark" : "light"); }, [dark]);

## Step 4: In TopBar header div, change className to support dark mode
Change: <header className=`"mb-5 flex items-start justify-between gap-4`">
To:      <header className={`"mb-5 flex items-start justify-between gap-4` + (dark ? " bg-slate-900" : "") + `"`}>

## Step 5: Add dark mode toggle button before language switch button
        <button type="button" onClick={() => setDark($ => !$)} className={`"icon-button`+`"`} aria-label="Dark mode">
          {dark ? <Sun className={`"h-4 w-4`+`"`} /> : <Moon className={`"h-4 w-4`+`"`} />}
        </button>

## Step 6: In WorkspaceApp root div, add dark mode class
Change: <div className={`"flex h-screen min-h-[760px] bg-[#F7F8FA] text-slate-800`+`"`}>
To:      <div className={`"flex h-screen min-h-[760px] `+ (dark ? `bg-slate-900 text-slate-100` : `bg-[#F7F8FA] text-slate-800`) +`"`}>

## Step 7: Add theme toggle button to TopBar props
Call site: <TopBar t={`t} activePage={`activePage} notice={`notice} dark={`dark} setDark={`setDark} language={`language} setLanguage={`setLanguage} />

## Step 8: Update ThemeProvider for CSS variables
See globals.css -- add :root { --bg: #F7F8FA; --text: #1e293b } .dark { --bg: #0f172a; --text: #e2e8f0 }
