# 누가 리디자인 최종 설계 (승인됨)

## 방향
hero-shell-paper+ : 밤의 틀 · 빛나는 종이 · 밤의 계단 (Night Shell, Luminous Paper, Night Stairs). Built on hero-shell-paper, with grafts from midnight-glass (KPI filter toggles, a full-ink plate number, a pre-rendered ::before hover ring, the arrive ring, a fixed canvas layer, the print reset, a full .mp-phone token restore, and one tip-or-popover visible at a time) and from gallery-light (bloom on the highest occupied step, a warm specular at the nosing end, the slate→graphite achievement ramp, a 1.5px ink ledger rule, warn/ok chip contrast fixes, solid no-blur toasts, the slider track as the achievement scale, column-gap 0 for one continuous staircase silhouette, and one primary per view). Every judge-named weakness is fixed: the bezel is trimmed to 3px; band buttons are secondary by default; there is one dark-ground button family defined once with :where(); no box-shadow transitions; data-tier glow (no calc() in alpha, no color-mix); the title animation that replayed on page change is gone; Pretendard is bundled locally; the vertical-space tokens shrink at max-height 780px.

## 콘셉트
앱 전체가 랜딩 히어로의 밤 장면 안에 놓입니다. 창 바탕은 깊은 남색(#081422)이고 오른쪽 아래에서 #142C49 빛웅덩이가 번집니다. 빛은 오른쪽 위 한 방향에서만 들어오고, 그 빛줄기가 화면을 비스듬히 가로지릅니다. 사이드바와 64px 머리 띠는 이 밤의 일부라서 상자가 없습니다. 크고 촘촘하지만 굵지 않은 하늘빛 제목과 '01 ——' 쪽 번호, 1px 선만 있습니다. 매일 읽고 쓰는 모든 일은 빛나는 종이 한 장 위에서 합니다. 종이는 3px 유리 베젤에 끼워져 있고, 베젤 테두리는 빛이 닿는 오른쪽 위가 가장 밝습니다. 종이 둘레로는 푸른 번짐이 어둠 속에 은은하게 퍼집니다. 히어로 이미지의 빛나는 유리 카드(우윳빛 면, 흰 테두리, 안쪽 베젤, 아래로 번지는 빛)를 그대로 옮긴 것이라 blur 없이도 유리처럼 보입니다. 표·기록칸·초안·설정은 모두 종이 위의 남색 글자라서 하루 종일 읽어도 피로하지 않습니다(본문 12.9:1, 보조 글자 5.0:1 이상). '한눈에'를 켜면 종이에 창이 하나 열리고, 그 창이 다시 밤을 보여 줍니다. 히어로의 유리 계단이 데이터가 되어 나타납니다. 계단 한 칸은 얇은 기록 판이 겹겹이 쌓인 유리 받침이고, 빛이 닿는 앞모서리가 하얗게 빛나며, 매끈한 바닥에 희미하게 비칩니다. 캐릭터 없이 박물관 작품 캡션 같은 이름표('07 김민준')만 그 위에 섭니다. 칸의 위치는 기록 수, 이름표의 색(밝은 슬레이트에서 흑연까지)은 도달 정도, 작은 하늘빛 점 하나는 '이번 주 기록'을 뜻합니다. 쌓인 이름표의 실루엣만으로 반이 어디에 모여 있는지, 누가 아직 출발선에 있는지, 이번 주에 누구를 기록했는지가 1초 안에 읽힙니다. 꽃처럼 번지는 빛(bloom)은 학생이 실제로 오른 가장 높은 칸 하나에만 줍니다. 웅장함은 효과를 많이 쓰는 데서가 아니라 어둠, 크기 대비, 그리고 '장면마다 초점 하나'라는 절제에서 나옵니다.

## 토큰 (:root)
```css
/* styles.css — REPLACE the current :root (lines 1–16) with this block. DELETE the whole '랜딩 테마' block (lines ~638–760) and rewrite its onboarding rules per the onboarding component spec. Legacy token names are kept (with new values) so existing selectors and inline TSX var() uses keep working. */
@font-face{font-family:'Pretendard Variable';src:url('/fonts/PretendardVariable.woff2') format('woff2-variations'),url('/fonts/PretendardVariable.woff2') format('woff2');font-weight:45 920;font-style:normal;font-display:swap}

:root{
  color-scheme:light;

  /* ── 1. NIGHT: sidebar · header band · bezel seam · 한눈에 stage · inbox header · onboarding ── */
  --navy-0:#060F1A; --navy-1:#081422; --navy-2:#0D1C2E; --navy-3:#112338; --navy-4:#15293F;
  --pool:#142C49; --floor:#051123; --floor-reflect:rgba(54,79,125,.30);
  --ink:#EAF2FF;          /* 16.45 on navy-1, 12.54 on pool. Body text on dark; never #FFF */
  --ink-display:#DCE9FC;  /* large titles on dark (tinted), 11.5 on pool */
  --ink-num:#D6E6FD;      /* KPI numerals, 14.64 */
  --ink2:#A3B7D2;         /* 9.05 navy-1 · 6.90 pool */
  --ink3:#7F95B2;         /* 6.04 navy-1 · 4.61 pool. Smallest readable dark text: >=12px, weight >=500 */
  --ink4:#5B6E86;         /* 3.55. Non-text only */
  --dline:rgba(171,201,241,.12); --dline-2:rgba(171,201,241,.22); --dline-3:rgba(171,201,241,.34);
  --btn2-line:#52719A; --btn2-line-hover:#6F8DB3; --btn2-ink:#C6DCFC;   /* landing secondary; line 3.69:1 */
  --btn-lt:#DEEBFF; --btn-lt-hover:#EAF2FF; --btn-lt-ink:#122A47;        /* landing primary, dark grounds only; 12.04:1 */
  --sky:#ACCDFF; --dot:#9CC6FF; --spec-warm:#FFF5DB;
  --glow-rgb:125 166 223;   /* #7DA6DF landing glow dot  → rgb(var(--glow-rgb) / .5) */
  --bloom-rgb:84 149 253;   /* #5495FD hero electric edge */
  --amber:#FFB27A; --amber-ink:#FFC9A8; --warm-rgb:255 178 128;   /* the ONLY warm hue on dark: backlog, low-record */
  --grain:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27180%27 height=%27180%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.85%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix type=%27saturate%27 values=%270%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27 opacity=%27.06%27/%3E%3C/svg%3E');
  --stair-mark:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Cpath d=%27M1 31h10v-10h10v-10h10%27 fill=%27none%27 stroke=%27%238BB6F3%27 stroke-width=%271%27 vector-effect=%27non-scaling-stroke%27/%3E%3C/svg%3E');
  --shell-bg:
    radial-gradient(70% 55% at 92% -12%, rgb(var(--bloom-rgb) / .22) 0%, rgb(var(--bloom-rgb) / .09) 36%, rgb(var(--bloom-rgb) / .03) 56%, rgb(var(--bloom-rgb) / 0) 70%),
    linear-gradient(118deg, transparent 58%, rgba(172,205,255,.035) 66%, transparent 74%),
    radial-gradient(ellipse at 72% 80%, #142C49 0%, #081422 58%);
  --stage-bg:
    radial-gradient(46% 58% at 90% -4%, rgb(var(--bloom-rgb) / .28) 0%, rgb(var(--bloom-rgb) / .11) 34%, rgb(var(--bloom-rgb) / .03) 58%, rgb(var(--bloom-rgb) / 0) 70%),
    linear-gradient(118deg, transparent 52%, rgba(172,205,255,.05) 60%, transparent 68%),
    radial-gradient(ellipse at 72% 80%, #142C49 0%, #081422 58%);
  --glass-dk:linear-gradient(160deg, rgba(17,35,56,.82), rgba(8,20,34,.90));   /* only together with backdrop-filter */
  --glass-dk-solid:#112338;                                                    /* rung-1 fallback; ink 14.11 */

  /* ── 2. LUMINOUS PAPER: every dense surface ── */
  --paper:#F2F6FC; --paper-2:#E8EFF8; --surface:#FFFFFF; --surface-2:#F7FAFE;
  --paper-grad:radial-gradient(60% 42% at 100% 0%, rgba(255,255,255,.95) 0%, rgba(255,255,255,0) 70%), linear-gradient(180deg,#F4F8FD 0%,#EEF3FA 100%);
  --text:#152D4A;          /* 13.94 white · 12.86 paper · 12.04 paper-2 */
  --text2:#4E6886;         /* 5.76 white · 5.31 paper · 4.97 paper-2 (old #56708D failed on paper-2) */
  --text3:#7D93AE;         /* 3.15. Icons, separators, disabled ONLY, never words */
  --muted:var(--text2);    /* ui.tsx references var(--muted); previously undefined */
  --placeholder:#627590;   /* 4.70 */
  --hair:rgba(21,45,74,.08); --hair-2:rgba(21,45,74,.14); --hair-3:rgba(21,45,74,.22); --rule-ink:#152D4A;
  --accent:#245AA7;        /* action blue: 6.78 as text and with white on it */
  --accent-2:#356BBA; --accent-hover:#1E4C8E; --accent-soft:#E2EDFF; --accent-tint:rgba(36,90,167,.08);
  --mark:#E2EDFF; --emph-rule:#4B7FD0;
  --btn-grad:linear-gradient(180deg,#2F66B8 0%,#245AA7 100%);        /* white text 5.65 top / 6.78 bottom */
  --btn-grad-hover:linear-gradient(180deg,#2A5DA9 0%,#1E4C8E 100%);
  --warn:#9E4512;          /* text: 6.34 white · 5.54 on warn-soft */
  --warn-strong:#B4521A;   /* fills with white text: 5.05 */
  --warn-dot:#C8661F;      /* non-text marks: 3.91 */
  --warn-soft:#FCEDE2; --warn-line:#E3A47E;
  --ok:#17695A; --ok-soft:#DDF1EB; --ok-led:#6FD3A8;   /* ok on ok-soft 5.57 */
  --c1:#2F63B8; --c1s:#E2EDFF; --c2:#16756C; --c2s:#DCF0EC; --c3:#6A48B0; --c3s:#ECE6FA; --c4:#56708D; --c4s:#E6ECF4;   /* category hues: 7px marks only */
  --chip-bg:#F1F5FB;
  --perf:#152D4A; --perf-s:#FFFFFF;

  /* ── 3. ACHIEVEMENT: slate → graphite, low chroma, never action-blue. ui.tsx ACH_COLORS must equal g0..g4 ── */
  --g0:#EEF2F7; --g1:#CBD5E1; --g2:#8E9DB0; --g3:#475569; --g4:#161B22;
  --g0-ink:#152D4A; --g1-ink:#152D4A; --g2-ink:#0B1420; --g3-ink:#FFFFFF; --g4-ink:#EAF2FF;   /* 12.40 · 9.39 · 6.70 · 7.58 · 15.36 */
  --pl-g0:linear-gradient(180deg,#F8FAFC,#E6EBF2);   /* stage plates: lit glass faces; worst-stop text 11.64 */
  --pl-g1:linear-gradient(180deg,#D6DEE8,#C0CBD8);   /* 8.48 */
  --pl-g2:linear-gradient(180deg,#9AA8BA,#8392A6);   /* 5.84 */
  --pl-g3:linear-gradient(180deg,#516073,#3E4B5E);   /* white 6.42 */
  --pl-g4:linear-gradient(180deg,#262E3A,#12161D);   /* #EAF2FF 12.15 */
  --g-ring-paper:rgba(21,45,74,.16);                 /* g0 alone on white is 1.12:1 */
  --g3-ring:rgba(172,205,255,.38); --g4-ring:rgba(172,205,255,.56);   /* on night: g3 alone 2.44, g4 alone 1.07 → MANDATORY */
  --gx-a:#FFFFFF; --gx-b:#E3E8EF;

  /* ── 4. Legacy aliases (existing CSS + inline TSX) ── */
  --bg:#EDF3FB; --line:#CFDBEB; --line2:#E1E9F4; --head-bg:#F7FAFE; --key-bg:transparent;
  --content-bg:#F7FAFE; --content-line:#D9E4F3; --navy:#081422; --navy2:#0D1C2E;

  /* ── 5. GLASS RECIPE (one light source: upper right) ── */
  --edge-light:linear-gradient(225deg, rgba(255,255,255,.75) 0%, rgba(172,205,255,.26) 22%, rgba(172,205,255,.06) 56%, rgba(172,205,255,.16) 100%);
  --edge-now:linear-gradient(225deg, #ACCDFF 0%, #4B7FD0 32%, rgba(75,127,208,.20) 72%, rgba(75,127,208,.12) 100%);
  --bezel:3px; --gutter:10px;

  /* ── 6. RADII: architectural, 3–5px on controls ── */
  --r-xs:3px; --r-plate:4px; --r-btn:5px; --r-field:6px; --r-card:10px; --r-paper:12px; --r-stage:12px; --r-modal:14px; --r-sheet:15px;

  /* ── 7. SHADOWS: navy-tinted, never black on paper ── */
  --sh-hair:0 1px 0 rgba(21,45,74,.04);
  --sh-card:0 1px 0 rgba(21,45,74,.04), 0 12px 32px -22px rgba(46,96,168,.32);
  --sh-lit:0 14px 40px -18px rgba(46,96,168,.45);
  --sh-float:0 1px 1px hsl(214 55% 30% / .06), 0 2px 4px hsl(214 55% 30% / .06), 0 6px 12px hsl(214 55% 30% / .06), 0 14px 28px hsl(214 55% 30% / .08), 0 28px 56px hsl(214 55% 30% / .10);
  --sh-float-dk:0 1px 2px rgb(2 8 16 / .5), 0 8px 24px -6px rgb(2 8 16 / .55), 0 24px 60px -18px rgb(2 8 16 / .7);
  --sh-sheet:0 0 0 1px rgba(171,201,241,.16), 0 40px 90px -30px rgba(0,0,0,.72), 0 -30px 90px -50px rgb(var(--bloom-rgb) / .55);
  --sh-plate:inset 0 1px 0 rgba(255,255,255,.42), 0 0 0 1px rgba(4,10,18,.55), 0 6px 14px -8px rgba(2,8,16,.9);
  --shadow:var(--sh-card); --shadow-lg:var(--sh-float);

  /* ── 8. TYPE (Pretendard Variable bundled; static CDN stays as 2nd fallback, where 550→600, 650→700) ── */
  --font:'Pretendard Variable','Pretendard','Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif;
  --num:'tnum' 1,'ss01' 1,'ss03' 1;   /* tabular, straight 6/9, centred colon (09:50–10:40). Set AFTER any font: shorthand */
  --fs-hero:52px; --fs-kpi:32px; --fs-title:26px; --fs-h2:19px; --fs-h3:15.5px; --fs-body:14px; --fs-ui:13.5px; --fs-prose:15px; --fs-meta:12px; --fs-micro:10.5px;
  --fw-hero:750; --fw-kpi:650; --fw-title:650; --fw-strong:650; --fw-ui:600; --fw-body:400;
  --tr-hero:-.052em; --tr-kpi:-.045em; --tr-title:-.036em; --tr-h2:-.028em; --tr-h3:-.018em; --tr-ui:-.012em; --tr-body:-.006em; --tr-eyebrow:.02em; --tr-latin:.18em;
  --lh-tight:1.2; --lh-ui:1.45; --lh-body:1.6; --lh-prose:1.85;

  /* ── 9. SPACE & LAYOUT ── */
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --s7:48px;
  --sidebar:208px; --topbar-h:64px; --pad:24px; --row:46px; --head:38px;

  /* ── 10. STAIRS (StairsView also sets --tagw/--base/--rise inline; keep BASE/RISE identical in TSX) ── */
  --tagw:76px; --plate-h:26px; --plate-gap:4px; --base:34px; --rise:14px; --floor-h:44px;

  /* ── 11. MOTION (landing values) ── */
  --ease-out:cubic-bezier(.2,.7,.2,1); --ease-std:cubic-bezier(.215,.61,.355,1); --ease-reel:cubic-bezier(.17,.68,.17,1);
  --d-1:.12s; --d-2:.2s; --d-3:.45s; --d-4:.65s; --stagger-step:50ms; --stagger-plate:12ms;

  /* ── 12. LAYERS ── */
  --z-sticky:5; --z-menu:40; --z-overlay:50; --z-toast:60; --z-pop:400;
}
@media (max-height:780px){ :root{ --gutter:6px; --bezel:2px; --topbar-h:54px; --pad:20px; } }
@media (max-width:760px){ :root{ --gutter:0px; --bezel:0px; } }

@keyframes rise-in{from{opacity:0;transform:translateY(20px)}}
@keyframes rise-sm{from{opacity:0;transform:translateY(10px)}}
@keyframes fade-in{from{opacity:0}}
@keyframes modal-in{from{opacity:0;transform:translateY(10px) scale(.99)}}
@keyframes pop-in{from{opacity:0;transform:translateY(4px)}}
@keyframes arrive{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
@keyframes pulse{50%{opacity:.35}}
```

## 컴포넌트별 처리
### styles.css structure + cascade rules (do this first)
1) Replace :root with the token block and add the @font-face. 2) Delete the whole '랜딩 테마' block (lines ~638–760). Every component rule below REPLACES the existing base rule with the same selector, edited in place in its base section, so there is one cascade and no override layers. 3) Append these new sections at the end, in this order: '/* 밤의 틀 · 종이 */' (shell, sheet, paper), '/* 어두운 바탕 공통 */' (the dark-ground family below), '/* 한눈에 · 밤의 계단 */' (the full stairs block from the stairs spec), '/* 첫 화면 */', '/* 모바일 미리보기 방화벽 */', '/* 접근성·성능 가드 */', '/* 인쇄 */'. 4) Element-level additions (scrollbars, focus halos, input hover/inset shadow, ::selection) are written as zero-specificity :where(x:not(.mp-phone *)) so they never reach the phone mock. 5) Delete the global overrides 'body{letter-spacing:-0.015em}' and 'h1,h2,h3{letter-spacing:-0.035em}'. The working-tree styles.css has no .stairs/.stair-*/.kid*/.cloud/.flag rules, so do not resurrect the HEAD versions.

### fonts (index.html, public/)
Put PretendardVariable.woff2 (Pretendard v1.3.9 release, SIL OFL, about 2MB) at apps/desktop/public/fonts/PretendardVariable.woff2. index.html: add <link rel='preload' href='/fonts/PretendardVariable.woff2' as='font' type='font/woff2' crossorigin> BEFORE the existing static jsDelivr link, and keep that link as a second fallback. With the variable font, 550/650/750 render as true weights; offline school PCs no longer depend on the CDN. Weights used in the app: 400 body, 500 meta, 550 nav/labels, 600 UI, 650 titles/names/KPIs, 700 brand/class name, 750 onboarding title only. Never use 300 (ClearType smears it), and never 800.

### page canvas: night shell (body, .app, .main)
body{background:var(--navy-1);color:var(--text);font-family:var(--font);font-size:var(--fs-body);line-height:var(--lh-body);letter-spacing:var(--tr-body);word-break:keep-all;overflow-wrap:anywhere;font-synthesis:none;-webkit-font-smoothing:antialiased} (navy body so nothing flashes white). .app{position:relative;isolation:isolate;display:flex;height:100%;color:var(--ink)}. Paint the night ONCE on a fixed layer, so sidebar collapse and scrolling never repaint the grain or gradients: .app::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--grain),var(--shell-bg);background-color:var(--navy-1)}. Never use background-attachment:fixed. .main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;padding:0 var(--gutter) var(--gutter) 0;background:transparent}. The night shows only as the sidebar, the header band and the thin gutter around the sheet. It never sits behind dense text. Rule: one dark focal object per screen inside the paper (the stairs stage, or nothing).

### work surface: glass sheet + luminous paper (new .sheet > .paper wrapper)
TSX (App.tsx): export function Sheet({children}:{children:React.ReactNode}){return <div className='sheet'><div className='paper'>{children}</div></div>}. Wrap everything after <TopBar/> in RecordsPage (the .rec-split), DraftPage, ReviewPage, SettingsPage and MobilePage. CSS: .sheet{position:relative;flex:1;min-height:0;display:flex;padding:var(--bezel);border-radius:var(--r-sheet);background:linear-gradient(225deg,rgba(234,242,255,.16) 0%,rgba(172,205,255,.06) 40%,rgba(172,205,255,.035) 100%);box-shadow:var(--sh-sheet)} .sheet::before{content:'';position:absolute;inset:0;padding:1px;border-radius:inherit;pointer-events:none;background:var(--edge-light);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude} (keep BOTH mask-composite lines, or older WebView2 paints a filled box). .paper{position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;border-radius:var(--r-paper);background:var(--paper-grad);color:var(--text);color-scheme:light;box-shadow:inset 0 1px 0 #fff,0 0 0 1px rgba(8,20,34,.55)}. That gives a milky face, a white top rim, a dark inner bezel line and a white pool at the top-right, with no blur. Entrance: .paper>*{animation:fade-in .2s var(--ease-out) backwards} (opacity only). CRITICAL comment in CSS: '/* .sheet/.paper must never get transform, filter, contain, will-change, backdrop-filter, isolation or z-index: Modal (.overlay, position:fixed, NOT portaled) renders inside .paper */'. Safety net for a page that misses the wrapper: .main>:is(.content,.tabsrow,.rec-split){background:var(--paper);color:var(--text)}. When --bezel is 0 (narrow window): .sheet{border-radius:0;box-shadow:none} .sheet::before{display:none} .paper{border-radius:0}.

### sidebar (.sidebar, .brand, .nav, .side-backlog, .syncbox, collapsed)
.sidebar{position:relative;width:var(--sidebar);flex:none;display:flex;flex-direction:column;gap:2px;padding:18px 12px 14px;background:transparent;border-right:0;color:var(--ink);transition:width .15s ease}. No right hairline: the sheet rim already separates them. Brand watermark: .sidebar::before{content:'';position:absolute;left:-14px;bottom:104px;width:200px;height:200px;pointer-events:none;opacity:.10;background:var(--stair-mark) no-repeat left bottom/contain} .sidebar.collapsed::before{display:none}. .brand{display:flex;align-items:center;gap:9px;padding:6px 10px 22px;color:var(--ink);font-size:20px;font-weight:700;letter-spacing:-.04em} .brand-mark{width:22px;height:22px;flex:none;fill:none;stroke:var(--sky);stroke-width:2.4;stroke-linecap:square;overflow:visible}. TSX: add <circle cx='29' cy='10' r='1.8' fill='#DCEBFF'/> to the brand svg, the landing path-connector endpoint. CSS .brand-mark circle{filter:drop-shadow(0 0 3px #7DA6DF)} (tiny and static). .brand-en{font-size:10px;font-weight:600;letter-spacing:.22em;color:var(--ink3);margin-top:3px} .brand .fold{width:26px;height:26px;border-radius:6px;border:1px solid var(--dline-2);background:transparent;color:var(--ink3)} .brand .fold:hover{background:rgba(172,205,255,.08);color:var(--ink)}. .sidebar .nav{position:relative;height:40px;padding:0 12px;gap:11px;border-radius:6px;color:var(--ink2);font-size:14px;font-weight:550;letter-spacing:-.015em;transition:background-color var(--d-1),color var(--d-1)} .sidebar .nav svg{color:var(--ink3)} .sidebar .nav:hover{background:rgba(172,205,255,.06);color:var(--ink)}. The active item is a glass pill with a light beam, the ONLY glow in the sidebar: .sidebar .nav.active{color:var(--ink);font-weight:650;background:linear-gradient(180deg,rgba(172,205,255,.14),rgba(172,205,255,.06));box-shadow:inset 0 1px 0 rgba(234,242,255,.10),inset 0 0 0 1px rgba(172,205,255,.16)} .sidebar .nav.active svg{color:var(--sky)} .sidebar .nav.active::before{content:'';position:absolute;left:-12px;top:10px;bottom:10px;width:2px;border-radius:0 2px 2px 0;background:var(--sky);box-shadow:0 0 10px rgb(var(--glow-rgb) / .85)} .sidebar.collapsed .nav.active::before{left:-8px}. Backlog: .sidebar .btn.side-backlog{margin:10px 2px 0;height:34px;justify-content:space-between;padding:0 12px;border-radius:var(--r-btn);background:rgb(var(--warm-rgb) / .10);border:1px solid rgb(var(--warm-rgb) / .45);color:var(--amber-ink);font-weight:600} .sidebar .btn.side-backlog b{color:var(--ink);font-size:14px;font-feature-settings:var(--num)} .sidebar .btn.side-backlog:hover{background:rgb(var(--warm-rgb) / .18)}. Footer: .syncbox{position:relative;border-top:0;padding-top:12px;margin-top:8px} .syncbox::before{content:'';position:absolute;top:0;left:8px;right:8px;height:1px;background:linear-gradient(90deg,transparent,var(--dline-2) 15%,var(--dline-2) 85%,transparent)} .syncbox .st{font-size:12px;font-weight:500;color:var(--ink3)} .syncbox .st .led{width:7px;height:7px;background:var(--ink4)} .syncbox .st .led.on{background:var(--ok-led);box-shadow:0 0 0 3px rgba(111,211,168,.16)} .syncbox .st .led.busy{background:var(--sky);animation:pulse 1.6s ease-in-out infinite} .syncbox .st .led.err{background:var(--amber)}. TSX App.tsx:84: replace the inline style {background:'var(--warn)'} with className 'err', because dark warn is invisible on navy.

### topbar = header band on the night (.topbar, h1, page index, 표|한눈에, view toggles)
.topbar{flex:none;display:flex;align-items:center;gap:10px;min-height:var(--topbar-h);padding:10px 16px 10px 20px;color:var(--ink);background:transparent;border:0}. No sticky, no blur, no border. Page index (the landing '01 ——' counter). TSX App.tsx: <main className='main' data-page={page}>. CSS: .topbar::before{flex:none;font-size:11px;font-weight:600;letter-spacing:.12em;color:var(--ink3);font-feature-settings:var(--num);padding-right:34px;background:linear-gradient(var(--dline-3),var(--dline-3)) no-repeat right 4px center/22px 1px} .main:is([data-page=today],[data-page=records]) .topbar::before{content:'01'} .main[data-page=draft] .topbar::before{content:'02'} .main[data-page=review] .topbar::before{content:'03'} .main[data-page=settings] .topbar::before{content:'04'} .main[data-page=mobile] .topbar::before{content:'05'}. Title: .topbar h1{margin:0;font-size:var(--fs-title);font-weight:var(--fw-title);letter-spacing:var(--tr-title);line-height:var(--lh-tight);color:var(--ink-display);white-space:nowrap}. Big, tight and tinted, the one scale jump in the band. No entrance animation (it would replay on every page change). .topbar .sep{flex:1}. 한눈에 control, TSX RecordsPage:79: replace <Switch> with <span className='seg stairs-switch' role='tablist' aria-label='보기'><button role='tab' aria-selected={!stairs} className={!stairs?'active':''} onClick={()=>setStairs(false)}>표</button><button role='tab' aria-selected={stairs} className={stairs?'active':''} onClick={()=>setStairs(true)}><svg width='14' height='14' viewBox='0 0 32 32' aria-hidden><path d='M3 26h9v-8h8v-8h9' fill='none' stroke='currentColor' strokeWidth='2.6' strokeLinecap='square'/></svg>한눈에</button></span>. Fix its title to '반 전체 기록 현황을 계단으로 봅니다'. Band contents use the dark-ground family (next item). RecordsPage '+기록' stays SECONDARY in the band, because the paper's quick-add '추가' is that view's one primary. ReviewPage's '검토' run button is the band primary there (the paper has none). .topbar .view-toggles{color:var(--ink2)} .topbar .view-toggles input{accent-color:var(--sky)}. Audit inline style={{color:'var(--warn)'}} in any TopBar prop: on the band it must be var(--amber-ink).

### dark-ground family: ONE place for controls on night surfaces
Write this once, after the base .btn/.seg/.switch rules. The :where() list keeps specificity equal to base, so the order in the file decides, and nothing else may re-declare these. :where(.topbar,.sidebar,.ttbar,.ach-pop,.stairs-stage,.modal.inbox .modal-h,.onb.hero-dark) .btn{height:32px;background:transparent;border:1px solid var(--btn2-line);color:var(--btn2-ink);box-shadow:none} :where(…same list…) .btn:hover{background:rgba(172,205,255,.08);border-color:var(--btn2-line-hover);color:var(--ink)} :where(…) .btn svg{color:currentColor} :where(…) .btn.primary{background:var(--btn-lt);border-color:var(--btn-lt);color:var(--btn-lt-ink);box-shadow:inset 0 1px 0 #fff,0 8px 20px -10px rgb(var(--glow-rgb) / .55)} :where(…) .btn.primary:hover{background:var(--btn-lt-hover)} :where(…) .btn.warn-outline{background:rgb(var(--warm-rgb) / .10);border-color:rgb(var(--warm-rgb) / .5);color:var(--amber-ink)} :where(…) .btn.warn-outline b{color:var(--ink)} :where(…) .muted{color:var(--ink2)} :where(…) .seg{gap:2px;padding:2px;border:0;border-radius:7px;background:rgba(172,205,255,.05);box-shadow:inset 0 0 0 1px var(--dline-2)} :where(…) .seg button{height:28px;padding:0 11px;border:0;border-radius:5px;background:transparent;color:var(--ink2);font-weight:600;display:inline-flex;align-items:center;gap:6px} :where(…) .seg button:hover{color:var(--ink)} :where(…) .seg button.active{background:var(--btn-lt);color:var(--btn-lt-ink);box-shadow:inset 0 1px 0 #fff} (the '한눈에' glyph turns var(--btn-lt-ink) when active) :where(…) .seg.seg-title button{height:32px;padding:0 15px;font-size:15px;font-weight:650} :where(…) .switch{background:rgba(171,201,241,.22)} :where(…) .switch.on{background:var(--sky)} :where(…) .switch.on::after{background:var(--navy-2)} :where(…) .chip.outline{background:transparent;border:0;box-shadow:inset 0 0 0 1px var(--dline-3);color:var(--ink2)} :where(…) :where(input:not([type=checkbox]):not([type=radio]):not([type=range]),select){background:rgba(172,205,255,.06);border-color:var(--btn2-line);color:var(--ink)} :where(…) :where(input,select):focus{border-color:var(--sky);box-shadow:0 0 0 3px rgba(172,205,255,.18)} :where(…) :is(input[type=checkbox],input[type=radio]){accent-color:var(--sky)} :where(…) .x{color:var(--ink2)} :where(…) .x:hover{background:rgba(172,205,255,.08);color:var(--ink)} :where(…) .stag:is(.g3,.g4){box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 0 0 1px var(--g4-ring)} (defensive: dark tags never sink on night).

### area pills + area menu (.area-list, .area-pill, .area, .area-add, .menu)
.topbar .area-pill{height:32px;padding:0 13px;border-radius:var(--r-btn);background:rgba(172,205,255,.05);border:1px solid var(--dline-2);color:var(--ink2);font-size:13.5px;font-weight:600;letter-spacing:-.015em} .topbar .area-pill:hover{color:var(--ink);border-color:var(--dline-3);background:rgba(172,205,255,.09)}. The current subject is the one lit object in the band: .topbar :is(.area-pill.on,.area){height:32px;background:var(--btn-lt);border:1px solid var(--btn-lt);color:var(--btn-lt-ink);font-size:14px;font-weight:700;letter-spacing:-.03em;border-radius:var(--r-btn);box-shadow:inset 0 1px 0 #fff,0 0 18px -2px rgba(122,170,242,.35)} .topbar .area .meta{border-left-color:rgba(18,42,71,.22)} .topbar .area-add{width:32px;height:32px;border-radius:var(--r-btn);border:1px dashed var(--dline-3);background:transparent;color:var(--sky)} .topbar .area-add:hover{background:rgba(172,205,255,.08)}. The menu is frosted floating glass (blur budget item 1 of 3): .topbar .menu{border:0;border-radius:10px;padding:6px;color:var(--ink2);background:var(--glass-dk-solid);box-shadow:inset 0 1px 0 rgba(234,242,255,.12),0 0 0 1px rgba(171,201,241,.2),var(--sh-float-dk);animation:pop-in .16s var(--ease-out) backwards} @supports (backdrop-filter:blur(1px)){@media (prefers-reduced-transparency:no-preference){.topbar .menu{background:var(--glass-dk);-webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%)}}} .topbar .menu .item{color:var(--ink2);border-radius:6px} .topbar .menu .item:hover{background:rgba(172,205,255,.08);color:var(--ink)} .topbar .menu .item.on{background:rgba(172,205,255,.12);color:var(--ink);box-shadow:inset 2px 0 0 var(--sky);font-weight:650} .topbar .menu .item .sub{color:var(--ink3)} .topbar .menu .sep{background:var(--dline)}.

### buttons on paper (.btn, .primary, .ghost, .warn, .warn-outline, .dark, sizes)
Rule: blue = action; slate/graphite = achievement only; ONE primary per view. .btn{height:34px;padding:0 13px;gap:6px;border-radius:var(--r-btn);border:1px solid var(--hair-3);background:var(--surface);color:var(--text);font-size:var(--fs-ui);font-weight:600;letter-spacing:var(--tr-ui);box-shadow:var(--sh-hair);transition:background-color var(--d-1),border-color var(--d-1),transform var(--d-1)} .btn svg{color:var(--text2)} .btn:hover{background:#F4F8FD;border-color:rgba(21,45,74,.32)} .btn:active{transform:translateY(1px)} .btn:disabled{opacity:.45;transform:none}. .btn.primary{background:var(--btn-grad);border-color:#1F4F95;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 6px 14px -8px rgba(36,90,167,.7)} .btn.primary svg{color:#fff} .btn.primary:hover{background:var(--btn-grad-hover)}. .btn.ghost{border-color:transparent;background:transparent;box-shadow:none;color:var(--text2)} .btn.ghost:hover{background:var(--accent-tint);color:var(--text)}. .btn.warn{background:var(--warn-strong);border-color:var(--warn-strong);color:#fff} .btn.warn-outline{background:var(--warn-soft);border-color:var(--warn-line);color:var(--warn)}. .btn.dark is retired as a fill: .btn.dark{background:var(--surface);color:var(--text);font-weight:650} (navy-black belongs to tags). .btn.sm{height:28px;padding:0 10px;font-size:12.5px} .btn.lg{height:42px;padding:0 18px;font-size:15px} .btn.icon{width:34px;padding:0;justify-content:center} .btn.sm.icon{width:28px}. Remove every filter:brightness hover. In the today pane, each class's '미반영 N' (btn sm primary) becomes .btn.sm.warn-outline, because only '추가' is primary on that page.

### inputs, segments, switches, checkboxes on paper
Keep the token-driven base 'input,select,textarea{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-btn);padding:7px 10px}' (the phone inherits it through its restored tokens). New polish, zero-specificity and phone-safe: :where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not(.mp-phone *),select:not(.mp-phone *),textarea:not(.mp-phone *)){border-color:var(--hair-3);box-shadow:inset 0 1px 1px rgba(21,45,74,.04);transition:border-color var(--d-1),box-shadow var(--d-1)} :where(input:not(.mp-phone *),select:not(.mp-phone *),textarea:not(.mp-phone *)):hover{border-color:rgba(21,45,74,.32)} :where(input:not(.mp-phone *),select:not(.mp-phone *),textarea:not(.mp-phone *)):focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(36,90,167,.15)} :where(:not(.mp-phone *))::placeholder{color:var(--placeholder);opacity:1}. .select{height:34px;padding-right:28px} (chevron SVG stroke %234E6886). .search input{height:34px;width:240px;padding-left:32px} .search svg{color:var(--text2)}. Segmented control as a quiet raised pill (active is never navy or blue): .seg{display:inline-flex;gap:2px;padding:2px;border:0;border-radius:7px;background:rgba(21,45,74,.06);box-shadow:inset 0 0 0 1px var(--hair)} .seg button{height:30px;padding:0 11px;border:0;border-radius:5px;background:transparent;color:var(--text2);font-size:13px;font-weight:600} .seg button:hover{color:var(--text)} .seg button.active{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(21,45,74,.14),0 0 0 1px rgba(21,45,74,.06)}. .switch{width:36px;height:20px;background:#C3D0E1} .switch::after{top:2px;left:2px;width:16px;height:16px;box-shadow:0 1px 2px rgba(21,45,74,.3)} .switch.on{background:var(--accent)} .switch.on::after{left:18px}. input[type=checkbox],input[type=radio],input[type=range]{accent-color:var(--accent)}. .field label{font-size:12px;font-weight:600;color:var(--text2);letter-spacing:0}. .kbd{border:0;border-radius:4px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--hair-3),inset 0 -1px 0 var(--hair-3);color:var(--text2);font-size:11px;font-feature-settings:var(--num)}. .cell-edit{height:30px;border-radius:4px}.

### chips, badges, dots (.chip c1–c4 / status / perf / outline, .badge, .dot, .lvl)
Category chips become a quiet mark next to ink text, so four hues stop competing with the tag tints: .chip{height:22px;padding:0 7px;gap:5px;border-radius:var(--r-xs);font-size:12px;font-weight:600;letter-spacing:-.01em;line-height:1} .chip:is(.c1,.c2,.c3,.c4){background:var(--chip-bg);color:var(--text);box-shadow:inset 0 0 0 1px var(--hair)} .chip:is(.c1,.c2,.c3,.c4)::before{content:'';flex:none;width:6px;height:6px;border-radius:1.5px;background:var(--c1)} .chip.c2::before{background:var(--c2)} .chip.c3::before{background:var(--c3)} .chip.c4::before{background:var(--c4)} .table .chip:is(.c1,.c2,.c3,.c4){background:transparent;box-shadow:none;padding-left:0}. Selectable (quick-add, QuickAdd modal, inbox): .chip.clickable{height:28px;padding:0 10px 0 8px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--hair-2);cursor:pointer} .chip.clickable:hover{box-shadow:inset 0 0 0 1px var(--hair-3);filter:none} .chip.selected,.chip.clickable.selected{background:var(--accent);color:#fff;box-shadow:none} .chip.selected::before{box-shadow:0 0 0 1.5px #fff}. Status: .chip.pass{background:var(--accent-soft);color:var(--accent)} (5.75) .chip:is(.check,.pending){background:var(--warn-soft);color:var(--warn)} (5.54) .chip.fix{background:var(--warn-strong);color:#fff} (5.05) .chip.none{background:#EEF3FA;color:var(--text2)} .chip.outline{background:transparent;border:0;box-shadow:inset 0 0 0 1px var(--hair-3);color:var(--text2);font-weight:500} .chip.perf{background:transparent;box-shadow:inset 0 0 0 1px var(--rule-ink);color:var(--text)} (no navy fill) .chip.tchip{background:var(--tcs);color:var(--tc);border-radius:var(--r-xs)} (timetable hues unchanged). .badge{min-width:18px;height:18px;padding:0 5px;border-radius:4px;background:var(--warn-strong);color:#fff;font-size:11px;font-weight:700;font-feature-settings:var(--num)} .badge.blue{background:var(--accent)}. Badge inside a tab: .tab .badge{background:var(--warn-soft);color:var(--warn)}. .dot.warn{background:var(--warn-dot)} .dot.gray{background:var(--text3)}. .lvl.A{background:var(--g4);color:var(--g4-ink)} .lvl.B{background:var(--surface);box-shadow:inset 0 0 0 1px var(--hair-3)} .lvl.C{background:var(--g1);color:var(--g1-ink)}.

### tabs (class tabs .tabsrow/.tab)
Whitney-style rail: a 3px ink bar centred on the 1px rule, with no blue underline and no boxes. .tabsrow{display:flex;align-items:flex-end;gap:26px;padding:12px var(--pad) 0;background:transparent;border-bottom:1px solid var(--hair-2)} .rec-right .tabsrow{padding:12px 20px 0} .tab{position:relative;margin:0;padding:10px 0 11px;border:0;border-radius:0;background:none;color:var(--text2);font-size:14.5px;font-weight:600;letter-spacing:-.02em} .tab::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:3px;border-radius:2px 2px 0 0;background:var(--rule-ink);transform:scaleX(0);transform-origin:left;transition:transform var(--d-3) var(--ease-std)} .tab:hover{color:var(--text)} .tab.active{color:var(--text);border-bottom-color:transparent} .tab.active::after{transform:scaleX(1)} .tab .cnt{margin-left:6px;font-size:11.5px;font-weight:500;color:var(--text2);font-feature-settings:var(--num)} .tab .badge{margin-left:6px;vertical-align:1px}.

### tables (records, StudentDetail, 검토, 일괄 draft): printed ledger
.table{width:100%;border-collapse:separate;border-spacing:0;background:var(--surface);border:0;border-radius:0;border-top:1.5px solid var(--rule-ink);box-shadow:0 1px 0 var(--hair-2)}. The header is quiet, solid and has no blur: .table th{position:sticky;top:0;z-index:1;height:var(--head);padding:0 14px;text-align:left;font-size:12px;font-weight:600;letter-spacing:.01em;color:var(--text2);background:var(--surface);border-bottom:1px solid var(--hair-3);white-space:nowrap} .table th.content-h{background:var(--surface)}. Body: .table td{height:var(--row);padding:8px 14px;border-bottom:1px solid var(--hair);font-size:var(--fs-ui);color:var(--text)} .table tr:last-child td{border-bottom:0}. No zebra stripes and no vertical rules except the content column. The 번호 cell is an index numeral: .table td.key:not(.name){background:transparent;text-align:right;font-weight:600;color:var(--text2);font-feature-settings:var(--num);padding-right:18px} .table td.key.name{background:transparent;font-size:14.5px;font-weight:650;letter-spacing:-.02em;overflow:visible;padding-top:10px}. Hover is a left-weighted wash so dense rows never flicker: .table tbody tr.row{transition:background-color var(--d-1)} .table tbody tr.row:hover{background:linear-gradient(90deg,rgba(36,90,167,.06),rgba(36,90,167,0) 70%)} .table tbody tr.row:hover td.key{background:transparent}. Selection: .table tbody tr.selected{background:var(--accent-tint)} .table tbody tr.selected>td:first-child{box-shadow:inset 2px 0 0 var(--accent)}. The content column is a quiet lane: .table td.content{background:var(--surface-2);box-shadow:inset 1px 0 0 var(--hair),inset -1px 0 0 var(--hair);font-weight:500} .table tr:hover td.content{background:#F1F6FD}. Record items: .recitem{gap:6px;font-size:13px;color:var(--text2)} .recitem .d{font-size:12px;color:var(--text2);font-feature-settings:var(--num)} .recitem .t{color:var(--text)} .recitem+.recitem::before{width:1px;height:12px;background:var(--hair-2)}. :is(.table td.num,.table td.last){font-feature-settings:var(--num)} .table td.last{color:var(--text2);font-size:12.5px}. .fold-th:hover{background:var(--accent-tint)} .draft-cell:hover{background:#F3F7FD}. The toolbar above the table (search, filter seg, '기록 부족 = 2건 이하') sits on paper with margin-bottom 14px.

### today pane (.rec-split, .rec-left, .rec-resizer, .rec-rail, .day-nav, .day-field, .df-*)
.rec-left{background:var(--paper-2);border-right:1px solid var(--hair-2)}. This is the recessed tone, the landing's quiet counterpart; the right pane stays brighter paper. .rec-resizer::after{left:2px;width:1px;background:var(--hair-2)} .rec-resizer:hover::after,body.resizing .rec-resizer::after{width:2px;background:rgba(36,90,167,.55)} .rec-rail{background:var(--paper-2);color:var(--text2);font-size:12.5px;font-weight:650} .rec-rail span{letter-spacing:.02em}. .today-pane{padding:0 18px 32px;gap:14px}. The day nav is sticky with a gradient fade instead of blur: .day-nav{position:sticky;top:0;z-index:2;margin:0 -18px;padding:16px 18px 12px;background:linear-gradient(180deg,var(--paper-2) 78%,rgba(232,239,248,0))} .day-nav h2{font-size:var(--fs-h2);font-weight:650;letter-spacing:var(--tr-h2);font-feature-settings:var(--num)} .day-nav h2 .muted{font-size:14px;font-weight:550}. Class field = white card: .day-field{position:relative;background:var(--surface);border:0;border-radius:var(--r-card);box-shadow:0 0 0 1px var(--hair-2),var(--sh-hair);overflow:hidden} .df-head{background:transparent;padding:11px 14px 10px;gap:10px;border-bottom:1px solid var(--hair)} .day-field .df-head:hover{background:#F7FAFE} .df-cls{font-size:16px;font-weight:700;letter-spacing:-.025em} .df-slot{font-size:13px;font-weight:600} .df-head .num,.df-head .df-time{font-size:12px;color:var(--text2);font-feature-settings:var(--num)}. The current period is the ONE lit glass card on paper: .day-field.now{box-shadow:var(--sh-lit)} .day-field.now::before{content:'';position:absolute;inset:0;z-index:1;padding:1.5px;border-radius:inherit;pointer-events:none;background:var(--edge-now);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude} .day-field.now .df-cls::after{content:'';display:inline-block;width:6px;height:6px;margin-left:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(36,90,167,.16);vertical-align:2px} (static live dot, no pulse). .day-field.sel{outline:0;box-shadow:0 0 0 1.5px var(--accent),var(--sh-hair)} .day-field.now.sel{box-shadow:0 0 0 1.5px var(--accent),var(--sh-lit)}. Rows: .df-row{min-height:38px;padding:5px 14px;border-bottom:1px solid var(--hair)} .df-row:hover{background:#F9FBFE} .df-row.pending{background:#FFF9F3;box-shadow:inset 2px 0 0 var(--warn-dot)} .df-row.pending .df-no{color:var(--warn)} (6.06) .df-no{font-weight:650;color:var(--text2);font-feature-settings:var(--num)} .df-name{font-weight:600;letter-spacing:-.02em} .df-note{border:1px solid transparent;background:transparent;box-shadow:none} .df-note:hover{border-color:var(--hair-2)} .df-note:focus{background:#fff;border-color:var(--accent);box-shadow:0 0 0 3px rgba(36,90,167,.12)} .df-time{font-size:12px;color:var(--text2);font-feature-settings:var(--num)}. Quick-add: .df-row.add{background:var(--surface-2);border-top:1px solid var(--hair);padding:9px 14px} .df-row.add .df-note{background:#fff;border-color:var(--hair-3)} .df-no-in{text-align:center;font-weight:650;font-feature-settings:var(--num)}; '추가' = .btn.primary.sm, the page's single primary. A newly added row flashes once: .df-row.fresh{animation:fresh 1.2s ease-out} @keyframes fresh{from{background:var(--mark)}} (colour only; TSX adds .fresh to the row whose id was just created). Keep the existing container query and 980px media rules.

### student name tag on paper (.stag sm/md/lg, g0–g4/gx, lowconf, .stag-lv) + ACH_COLORS
A museum wall-label plaque. Its fill is achievement on the slate→graphite ramp, flat, with a top highlight, so it can never be mistaken for a blue button or the white seg pill. .stag{position:relative;display:inline-flex;align-items:center;height:28px;padding:0 12px 0 10px;border:0;border-radius:var(--r-plate);font-size:14.5px;font-weight:650;letter-spacing:-.02em;white-space:nowrap;max-width:100%;vertical-align:middle;background:var(--tg);color:var(--tg-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,var(--tg-hl,.4)),0 0 0 1px var(--tg-ring,transparent)} .stag.g0{--tg:var(--g0);--tg-ink:var(--g0-ink);--tg-ring:var(--g-ring-paper);--tg-hl:.6} .stag.g1{--tg:var(--g1);--tg-ink:var(--g1-ink);--tg-ring:rgba(21,45,74,.10);--tg-hl:.45} .stag.g2{--tg:var(--g2);--tg-ink:var(--g2-ink);--tg-hl:.3} .stag.g3{--tg:var(--g3);--tg-ink:var(--g3-ink);--tg-hl:.14} .stag.g4{--tg:var(--g4);--tg-ink:var(--g4-ink);--tg-hl:.10} .stag.gx{background:repeating-linear-gradient(135deg,var(--gx-a) 0 5px,var(--gx-b) 5px 7px);color:var(--text);--tg-ring:rgba(21,45,74,.20)}. Sizes: .stag.sm{height:24px;padding:0 9px 0 8px;font-size:13.5px} .stag.lg{height:36px;padding:0 16px 0 13px;font-size:18px;border-radius:5px} .stag.nob{padding-right:12px} .stag.sm.nob{padding-right:9px}. Low confidence: .stag.lowconf{border:0} .stag.lowconf::before{content:'';position:absolute;inset:2px;border:1px dashed currentColor;border-radius:3px;opacity:.45;pointer-events:none}. The level badge is a small hairline pill: .stag-lv{position:absolute;top:-7px;right:-8px;min-width:19px;height:16px;padding:0 4px;border:0;border-radius:4px;font-size:10px;font-weight:700;line-height:16px;font-feature-settings:var(--num);background:#fff;color:var(--text);box-shadow:0 0 0 1px rgba(21,45,74,.30),0 1px 2px rgba(21,45,74,.12);transition:transform var(--d-1)} .stag:is(.g3,.g4) .stag-lv{background:var(--navy-1);color:#DCE9FF;box-shadow:0 0 0 1px rgba(172,205,255,.55),0 0 8px rgb(var(--bloom-rgb) / .3)} .stag.gx .stag-lv{color:var(--text2)} .stag-lv:hover{transform:translateY(-1px)} (replaces scale 1.12). button.stag-name keeps its hover underline. ui.tsx: ACH_COLORS = ['#EEF2F7','#CBD5E1','#8E9DB0','#475569','#161B22']; update the comment to '남색 계열이 아닌 슬레이트→흑연 5단계'. Extract export function useAchStep(student:TagStudent){const doc=useStore(s=>s.doc);const ach=achievementOf(doc,student);const preview=useAchPreview(s=>s.key===achKey(student)?s.value:null);const shown=preview??ach.value;return {step:gradeStep(shown),shown,edited:ach.edited,lowConf:!ach.edited&&ach.confidence==='low'};} and make StudentTag use it, so table tags and stair plates share ONE tint, preview and lowconf code path.

### cards, eyebrow, section heads, empty states, notes, progress, CSS tooltip
.card{background:var(--surface);border:0;border-radius:var(--r-card);box-shadow:0 0 0 1px var(--hair-2),var(--sh-hair)} .card.pad{padding:20px 24px} .card h3{margin:0 0 10px;font-size:var(--fs-h3);font-weight:650;letter-spacing:var(--tr-h3)} .card.focus{border-top:2px solid var(--emph-rule);box-shadow:0 0 0 1px var(--hair-2),0 14px 50px rgba(46,96,168,.06)} .card.override{box-shadow:0 0 0 1px var(--warn-line),inset 2px 0 0 var(--warn-dot);background:#FFFBF7}. The eyebrow is the landing signature, rewritten in base: .eyebrow{display:inline-flex;align-items:center;gap:12px;font-size:12.5px;font-weight:600;letter-spacing:var(--tr-eyebrow);color:var(--text2)} .eyebrow::before{content:'';width:24px;height:1px;background:currentColor;opacity:.7} .eyebrow .en{font-size:var(--fs-micro);letter-spacing:var(--tr-latin);text-transform:uppercase} (Latin only, never Hangul). Section masthead (optional class, CSS only): .sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding-bottom:12px;margin-bottom:4px;border-bottom:1.5px solid var(--rule-ink)} .sec-head h2{margin:8px 0 0;font-size:var(--fs-h2);font-weight:650;letter-spacing:var(--tr-h2)}. Empty: .empty{position:relative;isolation:isolate;overflow:hidden;padding:56px 20px;text-align:center;color:var(--text2)} .empty b{display:block;color:var(--text);font-size:15px;font-weight:650;letter-spacing:-.02em;margin-bottom:4px} .empty::after{content:'';position:absolute;right:-20px;bottom:-30px;width:220px;height:220px;z-index:-1;opacity:.08;background:var(--stair-mark) no-repeat right bottom/contain;pointer-events:none}. .note{background:#FFF8EC;border:0;box-shadow:inset 0 0 0 1px #F0DDB0;color:#5C4A12;border-radius:var(--r-field)}. Progress as a hairbar: .prog{height:3px;border-radius:2px;background:rgba(21,45,74,.10)} .prog i{background:var(--accent);transition:width .5s ease} .spin{border-color:var(--hair-2);border-top-color:var(--accent)}. CSS tooltip: .tooltip:hover::after{background:var(--navy-2);color:var(--ink);border-radius:5px;box-shadow:0 0 0 1px var(--dline-2),var(--sh-float-dk);font-size:11.5px}.

### generic modal (.overlay, .modal, .modal-h/-b/-f, .x, Confirm, StudentDetail, QuickAdd)
The scrim has no blur: the full-screen blur(2px) is removed (it was the most expensive layer, and glass would sit on glass). .overlay{background:rgba(5,12,22,.58);backdrop-filter:none;padding:24px;animation:fade-in .18s ease-out}. The modal is a lit sheet of paper on the dark scrim and stays FULLY LIGHT, because StudentDetail puts an lg g4 StudentTag in its header (RecordsPage.tsx:153): .modal{color:var(--text);background:var(--surface);border-radius:var(--r-modal);box-shadow:0 0 0 1px rgba(171,201,241,.28),inset 0 1px 0 #fff,0 40px 100px -30px rgba(2,8,16,.75);animation:modal-in .26s var(--ease-out) backwards} .modal-h{padding:20px 24px 12px;gap:12px} .modal-h h2{font-size:var(--fs-h2);font-weight:650;letter-spacing:var(--tr-h2)} .modal-b{padding:4px 24px 22px;background:var(--surface)} .modal-f{padding:14px 24px;background:var(--surface-2);border-top:1px solid var(--hair)} .x{width:32px;height:32px;border-radius:6px;color:var(--text2);font-size:18px} .x:hover{background:rgba(21,45,74,.06);color:var(--text)}. color is set explicitly on .modal because the overlay mounts inside .paper (not portaled). Closing is instant.

### inbox modal '쉬는 시간 기록' (.modal.inbox, .ib-*)
This is the one modal whose header continues the night (its header holds no name tags). .modal.inbox .modal-h{background:var(--grain),radial-gradient(60% 140% at 92% -20%,rgb(var(--bloom-rgb) / .30),rgb(var(--bloom-rgb) / 0) 70%),linear-gradient(180deg,#0D1C2E,#081422);color:var(--ink);padding:18px 24px 16px;box-shadow:inset 0 -1px 0 rgba(171,201,241,.14)} .modal.inbox .modal-h::after{content:'';position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(234,242,255,.45) 60%,var(--spec-warm) 85%,transparent)} (rim light; give .modal-h position:relative) .modal.inbox .ib-head h2{font-size:var(--fs-h2);font-weight:650;letter-spacing:var(--tr-h2);color:var(--ink-display)}. Header buttons, .muted and .x come from the dark-ground family. Body grid as a ledger: .ib-grid{border:0;border-radius:0;border-top:1.5px solid var(--rule-ink);background:var(--surface)} .ib-th{position:sticky;top:0;background:var(--surface);font-size:12px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--hair-3)} .ib-cls,.ib-col{border-bottom:1px solid var(--hair)} .ib-col+.ib-col,.ib-cls+.ib-col{border-left:1px solid var(--hair)} .ib-cls{background:var(--paper-2)} .ib-cls b{font-size:22px;font-weight:700;letter-spacing:-.03em;font-feature-settings:var(--num)}. Cards: .ib-item{border:0;border-radius:8px;background:var(--surface);box-shadow:0 0 0 1px var(--hair-2)} .ib-item.later{background:var(--surface-2)} .ib-item.man{box-shadow:0 0 0 1px var(--hair-2),inset 2px 0 0 var(--warn-dot)} .ib-item.sg.open{position:relative;box-shadow:var(--sh-lit)} .ib-item.sg.open::before{the --edge-now gradient rim, same recipe as .day-field.now::before}. Quotes become editorial: .ib-quote,.sg-text{background:transparent;border:0;border-left:2px solid var(--emph-rule);border-radius:0;padding:2px 0 2px 12px;font-size:14.5px;line-height:1.6}. .ib-ctx,.ib-reason,.ib-none{color:var(--text2)} (text3 is never used for words). Roster: .ib-roster{border-left:1px solid var(--hair)} .ib-roster-list button{height:30px;border:0;border-radius:4px;background:var(--surface);box-shadow:0 0 0 1px var(--hair-2);font-weight:600} .ib-roster-list button .num{color:var(--text2);font-feature-settings:var(--num)} .ib-roster-list button:hover{box-shadow:0 0 0 1px var(--accent);background:var(--accent-soft);color:var(--accent)} .ib-cands button{border:1px dashed var(--hair-3);background:var(--surface-2);border-radius:6px} .ib-cands button:hover{border:1px solid var(--accent)}. Columns get no mask-image edge fades (no masks on scrollers).

### toasts (.toasts, .toast, .toast.notice) — solid, no blur
Small solid night tiles, so blur budget stays for transient overlays only. .toasts{right:24px;bottom:24px;gap:8px} .toast{min-width:260px;max-width:420px;padding:10px 14px 10px 16px;gap:12px;color:var(--ink);background:linear-gradient(180deg,var(--navy-3),var(--navy-2));border-radius:8px;font-size:13px;position:relative;box-shadow:inset 0 1px 0 rgba(234,242,255,.10),0 0 0 1px var(--dline-2),var(--sh-float-dk);animation:rise-sm .22s var(--ease-out) backwards} .toast::before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:2px;border-radius:0 2px 2px 0;background:var(--sky)} .toast.warn::before{background:var(--amber)} .toast .act{color:var(--sky);font-weight:650} (11.4:1). The info toast is paper: .toast.notice{color:var(--text);background:var(--surface);border:0;border-top:2px solid var(--emph-rule);box-shadow:0 0 0 1px var(--hair-2),var(--sh-float)} .toast.notice::before{display:none} .toast.notice .act{color:var(--accent)}. Show at most 3.

### achievement slider popover (.ach-pop, AchievementControl)
Dark frosted HUD, blur budget item 2 of 3. .ach-pop{position:fixed;z-index:var(--z-pop);width:300px;color:var(--ink2);border:0;border-radius:10px;padding:14px 16px 16px;background:var(--glass-dk-solid);box-shadow:inset 0 1px 0 rgba(234,242,255,.12),0 0 0 1px rgba(171,201,241,.2),var(--sh-float-dk);animation:pop-in .16s var(--ease-out) backwards} .ach-pop::before{gradient rim: content:'';position:absolute;inset:0;padding:1px;border-radius:inherit;pointer-events:none;background:var(--edge-light);opacity:.6;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude} @supports (backdrop-filter:blur(1px)){@media (prefers-reduced-transparency:no-preference){.ach-pop{background:var(--glass-dk);-webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%)}}}. The fill is at least 82% opaque, so ink stays ≥10:1 over any backdrop. .ach-pop b{color:var(--ink);font-weight:650} .ach-pop .ach-num{font-size:30px;font-weight:650;letter-spacing:-.045em;line-height:1;color:var(--ink-num);font-feature-settings:var(--num)}. TSX ui.tsx:51: REMOVE the inline style color ACH_COLORS[max(3,step)], because g3/g4 colour is invisible on the dark popover; render <i className={`ach-sw g${step<0?'x':step}`}/> before the number instead: .ach-sw{width:22px;height:14px;border-radius:3px;background:var(--tg);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 1px rgba(172,205,255,.45)} (reuse the .g0–.g4 --tg variables: give .ach-sw.g0{--tg:var(--g0)} … .ach-sw.gx{background:repeating-linear-gradient(135deg,#E9EEF5 0 3px,#C9D2DE 3px 5px)}). The slider track IS the scale (GRADE_BANDS are uniform 20-point bands, so 20% stops are exact). Delete the .ach-scale row in TSX. .ach-track input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:20px;background:transparent;accent-color:auto} .ach-track input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--g0) 0 20%,var(--g1) 20% 40%,var(--g2) 40% 60%,var(--g3) 60% 80%,var(--g4) 80%);box-shadow:0 0 0 1px rgba(172,205,255,.35)} .ach-track input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-5px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(8,20,34,.6),0 0 0 4px rgb(var(--glow-rgb) / .22),0 2px 6px rgba(2,8,16,.6)} plus the ::-moz-range-track/::-moz-range-thumb equivalents. .ach-track input.unset{opacity:.5}. Auto marker: .ach-auto{top:2px;width:2px;height:16px;background:var(--sky);box-shadow:0 0 6px rgba(172,205,255,.8)}. Buttons come from the dark-ground family. On paper (non-compact, StudentEdit): .ach-ctl:not(.compact) .ach-num{color:var(--text)} .ach-ctl:not(.compact) input[type=range]::-webkit-slider-runnable-track{box-shadow:0 0 0 1px var(--hair-3)} .ach-ctl:not(.compact) .ach-auto{background:var(--rule-ink);box-shadow:none}.

### draft page (.draft-layout, .stulist/.stu, .profile, .reccard, .chatdock, highlights, .lenbar, .msg, .dm-*)
.draft-layout{grid-template-columns:188px minmax(0,1fr);gap:16px}. .stulist{background:var(--surface);border:0;border-radius:var(--r-card);box-shadow:0 0 0 1px var(--hair-2)} .stu{min-height:36px;padding:6px 14px;font-size:14.5px;border-bottom:1px solid var(--hair)} .stu:hover{background:#F6F9FE} .stu.active{background:var(--accent-soft);box-shadow:inset 2px 0 0 var(--accent)} .stu .no{font-size:12px;color:var(--text2);font-feature-settings:var(--num)}. .profile .name{font-size:20px;font-weight:650;letter-spacing:-.03em}. .reccard{border-bottom:1px solid var(--hair)} .reccard .rc-text{background:var(--surface-2);border:0;border-left:2px solid #C5D5EC;border-radius:0 6px 6px 0;padding:6px 12px;font-weight:500}. Chat dock: .chatdock{border:0;border-radius:var(--r-card) var(--r-card) 0 0;box-shadow:0 0 0 1px var(--hair-2),0 -10px 30px -20px rgba(46,96,168,.35)} .chatdock .drag::after{width:36px;height:3px;background:var(--hair-3)}. Long prose: :is(.chatdock textarea.draft,.chatdock .draft.dv-box,.dm-draft){background:#FBFCFE;font-size:var(--fs-prose);line-height:var(--lh-prose);letter-spacing:-.004em;border-color:var(--hair);text-wrap:pretty;word-break:keep-all}. .msg{border-radius:10px} .msg.user{background:var(--accent);color:#fff;border-bottom-right-radius:3px} .msg.assistant{background:#EEF3FA;color:var(--text);border-bottom-left-radius:3px}. Evidence highlights use the landing's marker underlay, which wraps cleanly on long prose: .hl{border-radius:0;padding:0 1px;-webkit-box-decoration-break:clone;box-decoration-break:clone;color:var(--text)} .hl-activity{background:none;box-shadow:inset 0 -.5em #FDDDBB} .hl-competency{background:none;box-shadow:inset 0 -.5em #FFEE8A} .hl-evaluation{background:none;box-shadow:inset 0 -.5em #FFCACA} .span-legend .hl{box-shadow:none;border-radius:3px} .span-legend .hl-activity{background:#FDDDBB} .span-legend .hl-competency{background:#FFEE8A} .span-legend .hl-evaluation{background:#FFCACA} (same hue meaning as before). .focus-sent{background:var(--mark)} .dv-ev{border-radius:4px;background:var(--accent-soft);color:var(--accent);font-feature-settings:var(--num)} .dv-ev.none{background:var(--warn-soft);color:var(--warn)}. The length bar is a hairbar: .lenbar{height:3px;border-radius:2px;background:rgba(21,45,74,.10)} .lenbar i{background:var(--accent-2);transition:width .5s ease} .lenbar i.over{background:var(--warn-strong)} .lenbar i.low{background:var(--g2)} .lenbar>b{width:1.5px;background:rgba(8,20,34,.45)}. .ratio-bar{height:5px;background:rgba(21,45,74,.08)}. Batch xl modal: .dm-right{border:0;box-shadow:0 0 0 1px var(--hair-2)} .dm-right-h{background:var(--surface-2);border-bottom:1px solid var(--hair)} .dm-rec{border-bottom:1px solid var(--hair)} .dm-rec .t{background:transparent;padding:0}.

### review page + charts (.issue, .reviewtext, .chart-card, .metric, Charts.tsx)
.review-side{gap:12px}. .issue .q{background:#FFF7F0;border-radius:0 6px 6px 0;border-left:2px solid var(--warn-dot);line-height:1.65} .issue .q mark,.reviewtext mark{background:none;color:inherit;box-shadow:inset 0 -.5em #FFD8B8;padding:0 1px;-webkit-box-decoration-break:clone;box-decoration-break:clone} .reviewtext mark.style{box-shadow:inset 0 -.5em var(--mark)} .issue .q .sug{color:var(--ok)} .reviewtext{font-size:14.5px;line-height:var(--lh-prose)}. Charts: .chart-card{border:0;border-radius:var(--r-card);background:var(--surface);box-shadow:0 0 0 1px var(--hair-2);padding:16px 18px;gap:10px}; card titles use .eyebrow. .metric{font-size:13px} .mbar,.stack{height:6px;border-radius:3px;background:#E6EDF6} .mbar b{width:1.5px;background:var(--rule-ink);opacity:.45} .mv{color:var(--text2);font-feature-settings:var(--num)} .legend-row{color:var(--text2)} .legend-row i{border-radius:2px} .checklist li.bad{background:#FFF4EC} .checklist li.bad .mark{color:var(--warn)} .checklist li.ok .mark{color:var(--accent)} .checklist li.na{color:var(--text2)}. TSX Charts.tsx: remap the old warm-theme literals to hex (not var(), because SVG presentation attributes don't resolve var() reliably): CAT_COLORS {1:'#2F63B8',2:'#16756C',3:'#6A48B0',4:'#56708D',perf:'#152D4A'}; '#2448C9'→'#245AA7'; '#E0873A'→'#C8661F'; '#F1F4FD'→'#F1F6FD'; '#FDEEE3'→'#FCEDE2'; '#F4F3EF'→'#EEF3FA'; '#D9D6CE','#C9CBD2'→'#CFDBEB'; '#7C8090','#9EA2AD'→'#4E6886'; '#1A1C21'→'#152D4A'. TranscriptView stays on paper, so no change.

### settings (.settings-layout/nav/body, cards, radio cards, timetable, .ttbar, .scope-note, .qr, .steps)
CSS only; markup unchanged. .settings-layout{grid-template-columns:188px minmax(0,1fr);gap:28px} .settings-nav{gap:2px} .settings-nav button{height:36px;padding:0 12px;border:0;border-radius:6px;color:var(--text2);font-size:13.5px;font-weight:600} .settings-nav button:hover{color:var(--text);background:rgba(21,45,74,.04)} .settings-nav button.active{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--hair-2),0 1px 2px rgba(21,45,74,.06),inset 2px 0 0 var(--accent)} .settings-nav .tag{font-size:10.5px;color:var(--warn)}. .settings-body{gap:20px;max-width:880px}; section titles may take an .eyebrow above the h3. Rows inside cards are separated by hairlines, not nested boxes: .settings-body .card .row+.row{border-top:1px solid var(--hair);padding-top:14px;margin-top:14px}. Scope notes: .scope-note{border-radius:8px;padding:10px 14px;box-shadow:inset 2px 0 0 currentColor} .scope-note.common{background:#EEF4FD;color:var(--accent)} .scope-note.area{background:var(--warn-soft);color:var(--warn)} .scope-note span{color:var(--text2)}. Radio cards: :is(.level-card,.arrival-opt,.check-row){border:0;border-radius:8px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--hair-3);position:relative;transition:box-shadow var(--d-1)} :is(.level-card,.arrival-opt):hover{box-shadow:inset 0 0 0 1px rgba(36,90,167,.45)} :is(.level-card.active,.arrival-opt.on){background:#F5F9FF;box-shadow:inset 0 0 0 1.5px var(--accent)} .level-card.active::after{content:'';position:absolute;top:10px;right:10px;width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(36,90,167,.16)} .level-card span{color:var(--text2)} .level-card.big b{font-size:18px;font-weight:650;letter-spacing:-.03em}. Timetable: .ttcell{border-radius:6px;border:1px dashed var(--hair-3);color:var(--text2)} .ttcell:hover{border-color:var(--accent)} .ttcell.sel{outline:2px solid var(--accent);background:#E8F0FD!important} .ttgrid .h,.ttgrid .p{color:var(--text2)}; the six .tc hues stay, for timetable cells only. The sticky .ttbar is a floating SOLID night bar (no blur): .ttbar{background:var(--navy-2);color:var(--ink);border-radius:10px;box-shadow:inset 0 1px 0 rgba(234,242,255,.10),0 0 0 1px var(--dline-2),var(--sh-float-dk)} .ttbar .sep{background:var(--dline-2)} (its .btn come from the dark-ground family, replacing every color:#fff there). .qr img{background:#fff;padding:8px;border:0;box-shadow:0 0 0 1px var(--hair-2);border-radius:10px} (a white quiet zone is required for scanning). Setup steps: .steps .s{background:#E6EDF6;color:var(--text2)} .steps .s.done{background:var(--accent-soft);color:var(--accent)} .steps .s.cur{background:var(--accent);color:#fff} .steps .l{background:var(--hair-2)}, and the same mapping for .ocr-steps.

### onboarding hero (.onb.hero-dark) + setup wizard (.onb)
The first run is the brand scene at full scale. .onb.hero-dark{position:relative;isolation:isolate;overflow:hidden;color:var(--ink);align-items:center;background:var(--grain),radial-gradient(50% 60% at 86% 0%,rgb(var(--bloom-rgb) / .22),rgb(var(--bloom-rgb) / 0) 70%),linear-gradient(118deg,transparent 52%,rgba(172,205,255,.045) 60%,transparent 68%),radial-gradient(ellipse at 72% 80%,#142C49 0%,#081422 58%)} .onb.hero-dark::before{content:'';position:absolute;right:-4%;bottom:-6%;width:46%;height:60%;z-index:-1;opacity:.08;background:var(--stair-mark) no-repeat right bottom/contain;pointer-events:none}. .onb.hero-dark .box{width:1000px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:56px;align-items:center} .onb-brand{display:flex;align-items:center;gap:9px;font-weight:700;font-size:21px;letter-spacing:-.04em;margin-bottom:48px} .onb.hero-dark .eyebrow{color:var(--ink2)}. Type: .onb.hero-dark h1.onb-title{margin:18px 0 20px;font-size:var(--fs-hero);line-height:1.16;font-weight:var(--fw-hero);letter-spacing:var(--tr-hero);color:var(--ink-display);text-wrap:balance} .onb-title em{font-style:normal;color:var(--sky)} .onb-lead{color:var(--ink2);font-size:16px;line-height:1.75;margin:0 0 32px;max-width:30em} .onb-note{margin-top:26px;font-size:12.5px;color:var(--ink3)}. CTAs: .onb-cta{display:flex;flex-direction:column;gap:4px;text-align:left;border-radius:var(--r-btn);padding:16px 20px;border:1px solid var(--btn2-line);background:transparent;color:var(--btn2-ink);transition:transform var(--d-2) var(--ease-out),background-color var(--d-2),border-color var(--d-2)} .onb-cta b{font-size:16px;letter-spacing:-.02em} .onb-cta span{font-size:13px;color:var(--ink2);line-height:1.5} .onb-cta:hover{transform:translateY(-2px);border-color:var(--btn2-line-hover);background:rgba(172,205,255,.06)} .onb-cta.main{background:var(--btn-lt);border-color:var(--btn-lt);color:var(--btn-lt-ink);box-shadow:inset 0 1px 0 #fff,0 18px 40px -20px rgba(122,170,242,.6)} .onb-cta.main span{color:#3D5878} .onb-cta.main:hover{background:var(--btn-lt-hover)}. The four glass steps use the hero card recipe with NO avatars. TSX Onboarding.tsx: replace each <i/> disc with <em className='idx'>01</em>…'04', and replace '···' with <small className='dots' aria-hidden><i/><i/><i/></small>. .onb-stairs{position:relative;height:420px} .onb-step{position:absolute;width:236px;height:68px;border-radius:6px;display:flex;align-items:center;gap:12px;padding:0 16px;background:linear-gradient(180deg,#E2E9FD,#CCD9F9 60%,#B9C3E3);color:#0A2460;font-weight:700;font-size:15px;letter-spacing:-.03em;border:1px solid rgba(255,255,255,.9);box-shadow:inset 0 1px 0 #fff,inset 0 0 0 5px rgba(255,255,255,.18),inset 0 0 0 6px rgba(195,211,248,.5),0 0 0 1px rgb(var(--bloom-rgb) / .3),0 18px 40px -16px rgba(60,120,220,.55),0 -12px 40px -16px rgba(150,195,255,.5);animation:rise-in var(--d-4) var(--ease-out) backwards} (title 12.07:1) .onb-step .idx{font-style:normal;font-size:12px;font-weight:600;color:#4E6FB3;font-feature-settings:var(--num)} .onb-step .dots{margin-left:auto;display:inline-flex;gap:4px} .onb-step .dots i{width:4px;height:4px;border-radius:50%;background:#4E94FD;box-shadow:0 0 6px rgba(78,148,253,.7)}. The thin stacked sheets under each card: .onb-step::after{content:'';position:absolute;left:8px;right:-8px;top:100%;height:18px;background:repeating-linear-gradient(180deg,rgba(172,205,255,.28) 0 1px,transparent 1px 4px);opacity:.7}. Positions: s1 left 0 bottom 0 delay .05s; s2 left 70px bottom 96px delay .17s; s3 left 140px bottom 192px delay .29s; s4 left 210px bottom 288px delay .41s. Bloom with no filter: .onb-stairs::after{content:'';position:absolute;left:-10%;right:-10%;bottom:-40px;height:120px;filter:none;background:radial-gradient(50% 50% at 50% 50%,rgba(80,140,230,.32),rgba(80,140,230,.12) 45%,transparent 72%)}. Floor reflection on each card: .onb-step{-webkit-box-reflect:below 6px linear-gradient(transparent 70%,rgba(255,255,255,.12))}. @media (max-width:900px){.onb.hero-dark .box{grid-template-columns:1fr} .onb-stairs{display:none} .onb.hero-dark h1.onb-title{font-size:38px}}. The setup wizard (.onb without hero-dark) sits on paper: .onb{background:var(--paper-grad);color:var(--text)}.

### global chrome: focus, scrollbars, selection, numerals, type base
Focus on paper: :where(:not(.mp-phone *)):focus-visible{outline:2px solid var(--accent);outline-offset:2px}. Focus on dark: :where(.sidebar,.topbar,.stairs-stage,.ach-pop,.ttbar,.onb.hero-dark,.modal.inbox .modal-h) :focus-visible{outline-color:var(--sky);box-shadow:0 0 0 6px rgb(var(--glow-rgb) / .16)}. Scrollbars: :where(.app *:not(.mp-phone *)){scrollbar-width:thin;scrollbar-color:rgba(21,45,74,.24) transparent} :where(.sidebar *,.topbar *,.stairs-stage *){scrollbar-color:rgba(172,205,255,.24) transparent}. Selection: :where(:not(.mp-phone *))::selection{background:#CFE0FB;color:#0B1A2C} :where(.sidebar,.topbar,.stairs-stage,.ach-pop) ::selection{background:rgba(172,205,255,.32);color:#fff}. Numerals: :is(.num,.badge,.df-time,.df-no,.recitem .d,.stag-lv,.tab .cnt,.kpi b,.stair-range,.stair-n,.plate-no,.mv,.ratio-txt){font-variant-numeric:tabular-nums;font-feature-settings:var(--num)}. Put these AFTER any font: shorthand, because the shorthand resets numeric features. Headings: weight 700 only for the brand, the today-pane class name and onboarding; 650 for titles and names; display tracking (≤ -.036em) only at 26px and up. p,.lead,.draft-view,.reviewtext{text-wrap:pretty} .topbar h1,.onb-title{text-wrap:balance}.

### phone mock firewall (.mp-phone, must stay identical to the Android app)
Add at the end of styles.css. This restores every token whose value changed to its original light value inside the phone: .mp-phone{--bg:#EDF3FB;--surface:#FFFFFF;--line:#CFDBEB;--line2:#E1E9F4;--head-bg:#E2EAF5;--key-bg:#F5F8FD;--content-bg:#F0F5FD;--content-line:#D3E0F3;--text:#152D4A;--text2:#56708D;--text3:#7D93AE;--muted:#56708D;--accent:#356BBA;--accent-soft:#E2EDFF;--accent-hover:#245AA7;--warn:#B4521A;--warn-soft:#FCEDE2;--ok:#1E7A68;--ok-soft:#DDF1EB;--c1:#2F63B8;--c1s:#E2EDFF;--c2:#16756C;--c2s:#DCF0EC;--c3:#6A48B0;--c3s:#ECE6FA;--c4:#56708D;--c4s:#E6ECF4;--perf:#152D4A;--perf-s:#FFFFFF;--r-card:8px;--shadow:0 1px 2px rgba(21,45,74,.05),0 10px 30px rgba(46,96,168,.07);--shadow-lg:0 18px 50px rgba(8,20,34,.22);--hair:#E1E9F4;--hair-2:#CFDBEB;--hair-3:#CFDBEB;color-scheme:light;letter-spacing:-0.01em;font-feature-settings:normal} .mp-phone *{scrollbar-width:auto;scrollbar-color:auto} .mp-phone :focus-visible{outline:revert;box-shadow:none} .mp-phone ::selection{background:#E2EDFF;color:inherit}. Every new rule targets classes (.chip, .stag, .plate, .table) or uses the :where(x:not(.mp-phone *)) pattern; never add bare element rules. MobilePage's outer chrome (.mp-side, .mp-log, .mp-steps, .mp-seg) sits on paper and follows the paper tokens. .mp-seg button.on currently uses var(--text) background with #fff text, which stays fine (13.94). Verify with before/after screenshots of 모바일 확인 at the same zoom; the phone frame must be pixel-identical.

### accessibility, performance and print guards (one block, end of file)
Blur budget: backdrop-filter ONLY on .ach-pop, .stair-tip and .topbar .menu. All are transient and small, never animated, 14–18px, and at most 2 visible at once (the tip hides while the popover is open; the menu closes on outside click). Nothing persistent or repeated ever blurs (sheet, paper, sidebar, rows, sticky headers, scrollers, 30 plates, 12 slabs, overlay, toasts). Never animate opacity/filter/will-change on an ANCESTOR of a blurred surface (backdrop root); all three are portaled or top-level. Every scroll container (.content, .rec-left, .tablewrap, .modal-b, .dm-recs, .ib-col) keeps an opaque background-color and no mask-image, so Chromium keeps LCD text and composited scrolling. @media (prefers-reduced-transparency:reduce){.ach-pop,.stair-tip,.topbar .menu{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background:var(--glass-dk-solid)!important} .stair-step,.onb-step{-webkit-box-reflect:none}}. @media (prefers-contrast:more){.paper{--hair:rgba(21,45,74,.18);--hair-2:rgba(21,45,74,.28);--hair-3:rgba(21,45,74,.4);--text2:#3F5876} .stairs-stage{background:var(--navy-1)} .stairs-stage .plate,.stag{box-shadow:0 0 0 1.5px currentColor!important} .stair-step{background:#132A47;box-shadow:inset 0 2px 0 #fff} .stair-step::before,.stair-step::after{display:none}}. @media (forced-colors:active){.stag,.stairs-stage .plate{border:1px solid CanvasText} .stair-step{border-top:2px solid CanvasText;-webkit-box-reflect:none} .sheet::before,.day-field.now::before,.stairs-stage::before,.ach-pop::before{display:none}}. @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}: every element is authored so its resting state is the final state (from-only keyframes). @media print{:root{color-scheme:light} body,.app,.sheet,.paper{background:#fff!important;box-shadow:none!important} .app::before,.sidebar,.topbar,.rec-left,.rec-resizer,.stairs-wrap,.toasts{display:none!important} .main{padding:0} .sheet{padding:0} .sheet::before{display:none} .qr img{background:#fff}}.

### TSX change list (structure unchanged)
(1) App.tsx: add Sheet; <main className='main' data-page={page}>; the sync error LED gets className 'err' instead of the inline var(--warn); add a circle endpoint to the brand svg. (2) RecordsPage, DraftPage, ReviewPage, SettingsPage, MobilePage: wrap the post-TopBar content in <Sheet>. (3) RecordsPage: Switch → '표 | 한눈에' seg; when stairs is on, render <div className='stairs-tools'><SearchBox value={q} onChange={setQ} placeholder='이름·번호 찾기'/><span className='grow'/><span className='muted small'>이름표를 누르면 학생 기록 · 오른쪽 클릭으로 도달 정도</span></div> and then <StairsView key={cls} doc={doc} students={students} onOpen={setOpen} q={q}/>; add className={`content ${stairs?'is-stairs':''}`}; today pane per-class '미반영' → warn-outline. (4) StairsView.tsx: full rewrite per the stairs spec; delete HAIRS, ACCS, hash, KidChar, clouds, flag and every title tooltip. (5) ui.tsx: new ACH_COLORS; export useAchStep and make StudentTag use it; remove the inline .ach-num colour and render the .ach-sw swatch; delete the .ach-scale row. (6) Charts.tsx: hex remap. (7) Onboarding.tsx: index numerals and blue dots instead of avatar discs. (8) index.html: preload the bundled Pretendard Variable. (9) styles.css: per the structure item.

## 한눈에 기록 계단
한눈에 기록 계단: 종이 위에 열린 밤의 창 (NO characters, faces, clouds, flags or idle loops)

0. GLANCE CONTRACT. Each of these must be readable in about 1 second, and none may depend on colour alone.
  a. Where the class sits: the silhouette of the stacks. Plates are equal-size units, so stack height equals headcount (a unit histogram).
  b. Who is still at 0: the 출발선 tower at the far left on an unlit dashed floor line, plus the amber KPI '출발선 N명'.
  c. Who was recorded this week: a small sky dot on the plate, plus the KPI 'N/M명' with a 2px light meter.
  d. Achievement: the plate tint on the slate→graphite ramp. The legend is top-right; the number is in the hover card.
  e. Low-record zone: amber nosings, a dashed amber threshold guide, an amber range label, and a legend key.
  Restraint test: with every glow, rim and reflection switched off, a–e still read.

1. PLACEMENT (RecordsPage, stairs mode)
.content.is-stairs{display:flex;flex-direction:column;gap:12px;padding-bottom:16px}
.stairs-tools{display:flex;align-items:center;gap:8px;flex:none}   /* paper toolbar: SearchBox | grow | muted hint */
.stairs-wrap{flex:1;min-height:0;display:flex;flex-direction:column;container-type:inline-size}

2. DOM (StairsView.tsx rewrite; props { doc, students, onOpen, q? })
<div class='stairs-wrap'>
  <section class='stairs-stage [filtering] [settled]' data-density='full|compact|tight|ladder' role='region' aria-label='기록 계단: 반 전체 기록 현황' style='--tagw:76px;--base:34px;--rise:14px'>
    <header class='stairs-head'>
      <p class='eyebrow'>기록 계단 <b>2-5 · 28명</b></p>
      <div class='kpis'>
        <div class='kpi'><span class='k'>평균</span><b>4.3<small>건</small></b></div>
        <button type='button' class='kpi tg warn' aria-pressed='false'><span class='k'>출발선</span><b>3<small>명</small></b></button>
        <button type='button' class='kpi tg' aria-pressed='false' title='이번 주 기록이 없는 학생만 밝게'><span class='k'>이번 주 기록</span><b>18<small>/28명</small></b><i class='meter' style='--v:.64'><i></i></i></button>
        <button type='button' class='kpi tg warn' aria-pressed='false'><span class='k'>기록 부족</span><b>9<small>명</small></b></button>   (only when lowRecordEnabled)
        <div class='kpi'><span class='k'>가장 높이</span><b>14<small>건</small></b></div>
      </div>
      <div class='stairs-legend' aria-hidden='true'>
        <span class='lg-row'>도달 정도 <span class='sw'><i class='g0'></i><i class='g1'></i><i class='g2'></i><i class='g3'></i><i class='g4'></i></span> 낮음 → 높음</span>
        <span class='lg-row'><i class='wk'></i>이번 주 기록 <i class='lowk'></i>기록 부족 (2건 이하) <i class='gxk'></i>미정</span>   (lowk only when enabled; gxk only if any plate is gx)
      </div>
    </header>
    <div class='stairs-grid' style='grid-template-columns:…'>
      <section class='stair-col start low' role='group' aria-label='출발선 0건, 3명' style='--i:0;--rows:3'>
        <div class='stair-stack'> [placeholders <i class='ph' aria-hidden>] [<button class='plate g2 …'>…] </div>
        <div class='stair-start'><span class='stair-range'>출발선</span><span class='stair-n'>3명</span></div>
      </section>
      <section class='stair-col [low] [low-edge] [peak] [top] [empty]' role='group' aria-label='3–4건, 6명' style='--i:2;--rows:3'>
        <div class='stair-stack'>…</div>
        <div class='stair-step' data-tier='1'><span class='stair-range'>3–4<small>건</small></span><span class='stair-n'>6명</span></div>
      </section>
      …
      [all-zero only] <p class='stairs-note'><b>시작</b>첫 기록이 쌓이면 계단에 불이 켜집니다</p>
    </div>
    <div class='stairs-horizon' aria-hidden='true'></div>
  </section>
  {tip && <StairTip/>}   (createPortal → document.body)
</div>
Plates are SIBLINGS of .stair-step, never children, so box-reflect never mirrors names.

3. TSX SKELETON (keep the existing kids/max/size/steps/stepOf math)
const BASE=34, RISE=14, PH=26, GAP=4;
const TIERS=[['full',76],['compact',62],['tight',52]] as const;
type Focus=null|'zero'|'week0'|'low';
interface Kid{ s:Student; n:number; week:number; last:string; cats:{key:number; l:string; n:number}[] }
// size = max(2, ceil(max/11)); steps = max(4, 1+ceil(max/size)); stepOf(n) = n===0 ? 0 : min(steps-1, 1+floor((n-1)/size))
const range=(i:number)=>`${(i-1)*size+1}–${i*size}`;
const cols=Array.from({length:steps},(_,i)=>kids.filter(k=>stepOf(k.n)===i).sort((a,b)=>a.s.no-b.s.no));
const lowOn=doc.settings.lowRecordEnabled, lowTh=doc.settings.lowRecordThreshold;
const isLow=(i:number)=>lowOn && i*size<=lowTh;
const lowEdge=Math.max(-1,...cols.map((_,i)=>i>0&&isLow(i)?i:-1));
const peak=Math.max(-1,...cols.map((c,i)=>i>0&&c.length?i:-1));      // bloom goes to the highest OCCUPIED step
const [focus,setFocus]=useState<Focus>(null);
const matchQ=(k:Kid)=>!q.trim()||(k.s.name||'').includes(q.trim())||String(k.s.no)===q.trim();
const matchF=(k:Kid)=>focus==='zero'?k.n===0:focus==='week0'?k.week===0:focus==='low'?k.n<=lowTh:true;
const filtering=!!q.trim()||!!focus;
// measured layout: ONE ResizeObserver on .stairs-grid, 2px threshold, columns render only after the first measure
const gridRef=useRef<HTMLDivElement>(null); const [box,setBox]=useState({w:0,h:0});
useLayoutEffect(()=>{const el=gridRef.current; if(!el) return; const ro=new ResizeObserver(([e])=>{const {width,height}=e.contentRect; setBox(b=>Math.abs(b.w-width)<2&&Math.abs(b.h-height)<2?b:{w:width,h:height});}); ro.observe(el); return ()=>ro.disconnect();},[]);
const tread=(i:number)=>i===0?0:BASE+RISE*(i-1);
const rowsAt=(i:number)=>Math.max(2,Math.floor((box.h-tread(i)-8+GAP)/(PH+GAP)));
const plan=(t:number)=>cols.map((c,i)=>{const n=c.length; if(!n) return {w:0,rows:0,min:36}; const w=Math.ceil(n/rowsAt(i)); return {w,rows:Math.ceil(n/w),min:w*t+(w-1)*GAP+10};});
let density='ladder', tagw=62, L=plan(62);
for(const [d,t] of TIERS){const p=plan(t); if(p.reduce((a,x)=>a+x.min,0)<=box.w){density=d; tagw=t; L=p; break;}}
const template=density==='ladder'?undefined:L.map(x=>x.w?`minmax(${x.min}px, ${x.w}fr)`:'minmax(36px, .45fr)').join(' ');
// entrance plays once per mount (the stage is keyed by class); after that only moved plates get the 'arrive' ring
const [settled,setSettled]=useState(false); useEffect(()=>{const t=setTimeout(()=>setSettled(true),1300); return ()=>clearTimeout(t);},[]);
const prevRef=useRef<Map<number,number>|null>(null); const [arrived,setArrived]=useState<Set<number>>(new Set());
const sig=kids.map(k=>`${k.s.no}:${stepOf(k.n)}`).join(',');
useEffect(()=>{const now=new Map(kids.map(k=>[k.s.no,stepOf(k.n)] as const)); const prev=prevRef.current; prevRef.current=now; if(!prev) return; const up=[...now].filter(([no,st])=>(prev.get(no)??st)<st).map(([no])=>no); if(!up.length) return; setArrived(new Set(up)); const t=setTimeout(()=>setArrived(new Set()),1000); return ()=>clearTimeout(t);},[sig]);
const [tip,setTip]=useState<TipData|null>(null);
let order=0;
Columns: for each i render
<section key={i} role='group' aria-label={i?`${range(i)}건, ${col.length}명`:`출발선 0건, ${col.length}명`} className={['stair-col',i===0&&'start',i===steps-1&&'top',i===peak&&'peak',!col.length&&'empty',isLow(i)&&'low',i===lowEdge&&'low-edge'].filter(Boolean).join(' ')} style={{'--i':i,'--rows':L[i].rows||1} as React.CSSProperties}>
  {col.length>0 && <div className='stair-stack'>{Array.from({length:L[i].w*L[i].rows-col.length},(_,j)=><i key={'ph'+j} className='ph' aria-hidden/>)}{col.map(k=><Plate key={k.s.no} k={k} order={order++} hit={filtering&&matchQ(k)&&matchF(k)} arrived={arrived.has(k.s.no)} onOpen={onOpen} onTip={setTip}/>)}</div>}
  {i===0 ? <div className='stair-start'><span className='stair-range'>출발선</span><span className='stair-n'>{col.length}명</span></div>
         : <div className='stair-step' data-tier={Math.round(i/Math.max(1,steps-1)*3)}><span className='stair-range'>{range(i)}<small>건</small></span>{col.length>0&&<span className='stair-n'>{col.length}명</span>}</div>}
</section>
(render columns only when box.h>0). KPI toggles: onClick={()=>setFocus(f=>f==='zero'?null:'zero')} and the same for 'week0' and 'low'; the 출발선 toggle is disabled when zero===0. Esc on the stage clears focus (stopPropagation). The plate order is placeholders first, then 번호 ascending. With column-major flow the holes sit at the top-left, plates rest flat on the tread, and 01→28 reads top-to-bottom then left-to-right. DOM, tab and visual order are the same.

Plate (one tint code path with StudentTag):
function Plate({k,order,hit,arrived,onOpen,onTip}){
  const a=useAchStep(k.s); const {bind,popover}=useAchievementPress(k.s);
  const ref=useRef<HTMLButtonElement>(null); const t=useRef<number>();
  useEffect(()=>{ if(popover){ clearTimeout(t.current); onTip(null);} },[!!popover]);   // only ONE floating glass at a time
  const show=()=>{ clearTimeout(t.current); t.current=window.setTimeout(()=>{ if(ref.current&&!popover) onTip({k,a,r:ref.current.getBoundingClientRect()}); },120); };
  const hide=()=>{ clearTimeout(t.current); onTip(null); };
  const name=k.s.name||`${k.s.no}번`;
  return <><button ref={ref} type='button' className={`plate g${a.step<0?'x':a.step} ${a.lowConf?'lowconf':''} ${hit?'hit':''} ${arrived?'arrive':''}`} data-week={k.week>0?'':undefined} style={{'--k':order} as React.CSSProperties}
    aria-label={`${k.s.no}번 ${name}, 기록 ${k.n}건${k.week?`, 이번 주 ${k.week}건`:''}, 도달 정도 ${a.shown??'없음'}`}
    onClick={()=>onOpen(k.s)} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
    onKeyDown={e=>{ if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){ e.preventDefault(); bind.onContextMenu(e as unknown as React.MouseEvent<HTMLElement>); } }} {...bind}>
    <span className='plate-no'>{String(k.s.no).padStart(2,'0')}</span><span className='plate-name'>{name}</span>
  </button>{popover}</>;
}
No title= attribute (it would duplicate the hover card).

StairTip: measure its own height in useLayoutEffect. left=clamp(8, r.left+r.width/2-w/2, innerWidth-w-8). top=r.top-h-8 when that is ≥8, otherwise r.bottom+8. Render off-screen until measured, then add .show. Content: <b>07 김민준</b>, then rows .r <span>label</span><em>value</em>: 기록 9건; categories (each with <i class='sw c{key}'/> and count: 질문 3 · 발표 4 · 협동 2); 이번 주 +2 or —; 마지막 10. 2.; 도달 정도 72 · 교사 조정 | 근거 부족.

4. STAGE (the only dark surface inside the paper)
.stairs-stage{position:relative;isolation:isolate;overflow:hidden;flex:1;min-height:440px;display:flex;flex-direction:column;padding:22px 26px var(--floor-h);border-radius:var(--r-stage);color:var(--ink);color-scheme:dark;background:var(--grain),var(--stage-bg);box-shadow:0 0 0 1px #0B1828,inset 0 1px 0 rgba(255,255,255,.07),0 24px 60px -28px rgba(8,20,34,.7)}
/* glass rim, brightest top-right where the light is */
.stairs-stage::before{content:'';position:absolute;inset:0;z-index:4;padding:1px;border-radius:inherit;pointer-events:none;background:var(--edge-light);opacity:.7;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
/* glossy floor: painted on the stage itself (z -1), so no later sibling can cover the reflections */
.stairs-stage::after{content:'';position:absolute;left:0;right:0;bottom:0;height:var(--floor-h);z-index:-1;pointer-events:none;background:linear-gradient(180deg,var(--floor-reflect) 0%,rgba(5,17,35,0) 62%),var(--floor)}
/* horizon = landing path-connector: gradient hairline ending in a glowing dot under the summit */
.stairs-horizon{position:absolute;left:26px;right:26px;bottom:var(--floor-h);height:1px;z-index:0;pointer-events:none;background:linear-gradient(90deg,rgba(55,85,115,.55),#8DB4E9)}
.stairs-horizon::after{content:'';position:absolute;right:-3px;top:-3px;width:7px;height:7px;border-radius:50%;background:#BDD6FA;box-shadow:0 0 14px #7DA6DF}
Composition copies the hero: KPIs in the empty top-left, legend top-right, stairs climbing bottom-left → top-right toward the light ('at 90% -4%'). The dark upper-middle is intentional negative space.

5. HEADER (landing reel-number at app scale)
.stairs-head{position:relative;z-index:1;display:flex;align-items:flex-start;flex-wrap:wrap;gap:16px 32px}
.stairs-head .eyebrow{color:var(--ink2);flex-basis:100%} .stairs-head .eyebrow b{color:#C6D6EC;font-weight:600;font-feature-settings:var(--num)}
.kpis{display:flex;flex-wrap:wrap;row-gap:12px}
.kpi{display:grid;gap:7px;justify-items:start;padding:0 22px;border:0;border-left:1px solid var(--dline-2);background:none;color:inherit;font:inherit;text-align:left;position:relative}
.kpi:first-child{padding-left:0;border-left:0}
.kpi .k{font-size:12px;font-weight:550;color:var(--ink2);white-space:nowrap}
.kpi b{font-size:var(--fs-kpi);line-height:1;font-weight:var(--fw-kpi);letter-spacing:var(--tr-kpi);color:var(--ink-num);font-variant-numeric:tabular-nums;font-feature-settings:var(--num)}
.kpi b small{font-size:13px;font-weight:550;letter-spacing:0;color:var(--ink3);margin-left:3px}
.kpi.warn .k,.kpi.warn b{color:var(--amber-ink)}   /* 12.5:1 */
.kpi.tg{cursor:pointer} .kpi.tg:disabled{cursor:default} .kpi.tg:not(:disabled):hover .k{color:var(--ink)}
.kpi.tg::after{content:'';position:absolute;left:22px;right:22px;bottom:-8px;height:2px;border-radius:1px;background:var(--sky);box-shadow:0 0 8px rgb(var(--glow-rgb) / .7);transform:scaleX(0);transform-origin:left;transition:transform var(--d-3) var(--ease-std)}
.kpi.tg:first-child::after{left:0} .kpi.tg.warn::after{background:var(--amber);box-shadow:0 0 8px rgb(var(--warm-rgb) / .6)}
.kpi.tg[aria-pressed=true]::after{transform:scaleX(1)} .kpi.tg[aria-pressed=true] .k{color:var(--ink)}
.kpi .meter{display:block;width:96px;height:2px;border-radius:1px;background:rgba(171,201,241,.16);overflow:hidden}
.kpi .meter i{display:block;height:100%;width:calc(var(--v)*100%);background:linear-gradient(90deg,#6E9EE8,#ACCDFF);box-shadow:0 0 8px rgba(172,205,255,.7)}
.stairs-legend{margin-left:auto;display:grid;justify-items:end;gap:7px;font-size:11.5px;font-weight:500;color:var(--ink2)}
.stairs-legend .sw{display:inline-flex;gap:3px;margin:0 6px;vertical-align:-1px} .stairs-legend .sw i{width:14px;height:9px;border-radius:2px;box-shadow:inset 0 0 0 1px rgba(171,201,241,.4)}
.stairs-legend .sw .g0{background:var(--g0)} .g1{background:var(--g1)} .g2{background:var(--g2)} .g3{background:var(--g3)} .g4{background:var(--g4)}   (scoped under .stairs-legend .sw)
.stairs-legend .wk{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--dot);box-shadow:0 0 6px rgba(120,170,255,.8);margin-right:6px;vertical-align:1px}
.stairs-legend .lowk{display:inline-block;width:16px;border-top:1px dashed var(--amber);margin:0 6px 0 12px;vertical-align:3px}
.stairs-legend .gxk{display:inline-block;width:14px;height:9px;border-radius:2px;margin:0 6px 0 12px;background:repeating-linear-gradient(135deg,rgba(234,242,255,.22) 0 3px,rgba(234,242,255,.06) 3px 5px);outline:1px dashed rgba(171,201,241,.5);outline-offset:-1px}

6. GRID AND COLUMNS (measured; column-gap 0 → one continuous staircase silhouette)
.stairs-grid{position:relative;z-index:1;flex:1;min-height:0;display:grid;grid-template-rows:minmax(0,1fr);align-items:stretch;column-gap:0;margin-top:22px}
.stair-col{position:relative;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.stair-stack{position:relative;z-index:2;display:grid;grid-auto-flow:column;grid-template-rows:repeat(var(--rows),var(--plate-h));grid-auto-columns:var(--tagw);gap:var(--plate-gap);justify-content:center;padding:0 5px 6px}
.stair-stack .ph{visibility:hidden}
[data-density=compact]{--tagw:62px} [data-density=tight]{--tagw:52px}   (TSX also sets --tagw inline; the values must match)
When w>1 the stack height is capped, so the slab's 'N명' count is the quantity cue.

7. GLASS SLAB (hero step: stacked record sheets, lit nosing, upward bloom; no backdrop-filter, no calc() in colour alpha, no color-mix)
.stair-step{position:relative;width:100%;height:calc(var(--base) + var(--rise) * (var(--i) - 1));display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 8px 0;border-radius:3px 3px 0 0;
  background:
    linear-gradient(180deg,rgba(234,242,255,.18) 0,rgba(234,242,255,.04) 6px,rgba(234,242,255,0) 18px),   /* lit top face */
    linear-gradient(90deg,rgba(255,255,255,0) 45%,rgba(234,242,255,.05) 100%),                             /* right side lit (light from the right) */
    repeating-linear-gradient(180deg,rgba(172,205,255,.10) 0 1px,transparent 1px 6px),                     /* stacked record sheets */
    linear-gradient(180deg,rgba(53,107,186,.32) 0%,rgba(14,32,56,.74) 100%);                              /* glass body melting into navy */
  box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 1px 0 0 rgba(172,205,255,.16),inset -1px 0 0 rgba(172,205,255,.08),0 -10px 30px -16px rgb(var(--bloom-rgb) / .26);
  -webkit-box-reflect:below 0 linear-gradient(transparent calc(100% - 12px),rgba(255,255,255,.13));   /* only the bottom 12px (sheet lines) reflects; labels are never mirrored */
}
.stair-step[data-tier='2']{box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 1px 0 0 rgba(172,205,255,.18),inset -1px 0 0 rgba(172,205,255,.09),0 -12px 36px -16px rgb(var(--bloom-rgb) / .36)}
.stair-step[data-tier='3']{box-shadow:inset 0 1px 0 rgba(255,255,255,.9),inset 1px 0 0 rgba(172,205,255,.22),inset -1px 0 0 rgba(172,205,255,.10),0 -14px 40px -16px rgb(var(--bloom-rgb) / .42)}
/* nosing beam: white, fading at both ends, warm specular at the right end; brightness ramps by tier via opacity */
.stair-step::before{content:'';position:absolute;left:4%;right:4%;top:-1px;height:1px;pointer-events:none;background:linear-gradient(90deg,transparent 0%,rgba(234,242,255,.85) 16%,#fff 70%,var(--spec-warm) 88%,transparent 100%);box-shadow:0 0 10px 1px rgba(172,205,255,.5);opacity:.4}
.stair-step[data-tier='1']::before{opacity:.6} .stair-step[data-tier='2']::before{opacity:.8} .stair-step[data-tier='3']::before{opacity:1}
/* corner light-catch toward the light */
.stair-step::after{content:'';position:absolute;inset:0;border:1px solid rgba(234,242,255,.5);border-bottom:0;border-radius:inherit;pointer-events:none;-webkit-mask:radial-gradient(ellipse 70% 45% at 100% 0%,#000,transparent 85%);mask:radial-gradient(ellipse 70% 45% at 100% 0%,#000,transparent 85%)}
.stair-range{font-size:12px;font-weight:650;letter-spacing:-.01em;color:#DCE9FC;white-space:nowrap;font-variant-numeric:tabular-nums;font-feature-settings:var(--num)}   /* 9.6 on the face, ≥5.4 on the lit band */
.stair-range small{font-size:10.5px;font-weight:550;color:var(--ink2);margin-left:1px}
.stair-n{font-size:11px;font-weight:550;color:var(--ink2);white-space:nowrap;font-feature-settings:var(--num)}   /* 5.75 */
.stair-col:hover .stair-step::before{opacity:1} .stair-col:hover .stair-range{color:var(--ink)}
Height reads as more light and more records, with no legend needed.

8. MODIFIERS
Peak (the highest OCCUPIED step: the one strong bloom on the stage):
.stair-col.peak .stair-step{box-shadow:inset 0 1px 0 #fff,inset 1px 0 0 rgba(172,205,255,.24),inset -1px 0 0 rgba(172,205,255,.12),0 -22px 60px -16px rgba(150,195,255,.58)}
.stair-col.peak .stair-step::before{opacity:1;box-shadow:0 0 14px 2px rgb(var(--glow-rgb) / .6)}
.stair-col.peak .stair-stack{background:radial-gradient(60% 40% at 50% 100%,rgb(var(--bloom-rgb) / .12),transparent 70%)}
Top (the last column), when empty, is just an unlit goal with a faint rim: .stair-col.top.empty .stair-step{box-shadow:inset 0 1px 0 rgba(255,255,255,.45)}
Empty step (unlit glass that keeps the staircase continuous):
.stair-col.empty .stair-step{align-items:center;padding:6px 2px 0;background:repeating-linear-gradient(180deg,rgba(172,205,255,.05) 0 1px,transparent 1px 6px),linear-gradient(180deg,rgba(53,107,186,.12),rgba(14,32,56,.5));box-shadow:inset 0 1px 0 rgba(234,242,255,.26),inset 1px 0 0 rgba(172,205,255,.08)}
.stair-col.empty .stair-step::before{opacity:.12} .stair-col.empty .stair-step::after{display:none}
.stair-col.empty .stair-range{font-size:10.5px;font-weight:600;color:var(--ink3)} .stair-col.empty .stair-range small{display:none}
Low-record (amber replaces sky; no fills; plate tints never change):
.stair-col.low .stair-step{box-shadow:inset 0 1px 0 rgba(255,220,195,.8),inset 1px 0 0 rgb(var(--warm-rgb) / .14),inset -1px 0 0 rgb(var(--warm-rgb) / .06),0 -10px 30px -16px rgb(var(--warm-rgb) / .36)}
.stair-col.low .stair-step::before{opacity:1;background:linear-gradient(90deg,transparent,#FFD9BC 16%,#FFE7D3 80%,transparent);box-shadow:0 0 10px 1px rgb(var(--warm-rgb) / .42)}
.stair-col.low .stair-range{color:var(--amber-ink)}
.stair-col.low-edge::after{content:'';position:absolute;top:6%;bottom:0;right:0;border-right:1px dashed rgb(var(--warm-rgb) / .45);pointer-events:none}   /* threshold guide */
출발선 (i=0): no slab. Students stand on the floor at an unlit dashed line; the labels sit in the floor band.
.stair-col.start{padding-right:6px}
.stair-start{position:relative;width:100%;height:0;border-top:1px dashed rgba(172,205,255,.42)}
.stair-start .stair-range{position:absolute;left:4px;top:10px;color:var(--ink2)} .stair-start .stair-n{position:absolute;left:4px;top:26px;color:var(--ink3)}
.stair-col.start.low .stair-start{border-top-color:rgb(var(--warm-rgb) / .6)} .stair-col.start.low .stair-range{color:var(--amber-ink)}

9. NAME PLATES (museum wall label '07 김민준'; three channels only: position, tint, week dot)
.stairs-stage .plate{position:relative;display:inline-flex;align-items:center;gap:5px;width:var(--tagw);height:var(--plate-h);padding:0 7px;border:0;border-radius:var(--r-plate);background:var(--pl-bg);color:var(--pl-ink);font-family:inherit;font-size:13px;font-weight:650;letter-spacing:-.02em;line-height:1;text-align:left;cursor:pointer;box-shadow:var(--sh-plate);transition:transform var(--d-1) var(--ease-out),opacity var(--d-2);animation:rise-sm .45s var(--ease-out) backwards;animation-delay:calc(240ms + min(var(--k),24) * var(--stagger-plate))}
.stairs-stage.settled .plate{animation:none}   /* data changes never replay the entrance */
.plate.g0{--pl-bg:var(--pl-g0);--pl-ink:var(--g0-ink)} .plate.g1{--pl-bg:var(--pl-g1);--pl-ink:var(--g1-ink)} .plate.g2{--pl-bg:var(--pl-g2);--pl-ink:var(--g2-ink)}
.plate.g3{--pl-bg:var(--pl-g3);--pl-ink:#FFFFFF;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 0 0 1px var(--g3-ring),0 0 0 1px rgba(4,10,18,.6),0 6px 14px -8px rgba(2,8,16,.9)}
.plate.g4{--pl-bg:var(--pl-g4);--pl-ink:var(--g4-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 0 0 1px var(--g4-ring),0 0 0 1px rgba(4,10,18,.7),0 6px 14px -8px rgba(2,8,16,.9)}   /* obsidian plate with a silver rim; never sinks into the navy */
.plate.gx{--pl-bg:repeating-linear-gradient(135deg,rgba(234,242,255,.10) 0 4px,rgba(234,242,255,.03) 4px 7px),#14263D;--pl-ink:#C6D6EC;box-shadow:none;outline:1px dashed rgba(171,201,241,.5);outline-offset:-1px}   /* 미정, 10.35:1 */
.plate.lowconf{outline:1px dashed currentColor;outline-offset:-3px}
.plate .plate-no{flex:none;min-width:13px;font-size:10.5px;font-weight:600;letter-spacing:0;color:inherit;font-feature-settings:var(--num)}   /* FULL ink, no opacity → same ratio as the name */
.plate .plate-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* this-week dot: the only per-plate glow; the plate is not overflow:hidden, so it is never clipped */
.plate[data-week]::after{content:'';position:absolute;top:-3px;right:-3px;width:6px;height:6px;border-radius:50%;background:var(--dot);box-shadow:0 0 0 2px var(--navy-1),0 0 8px rgba(120,170,255,.85);pointer-events:none}
/* hover/focus ring is PRE-RENDERED and only its opacity changes (box-shadow is never transitioned) */
.plate::before{content:'';position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity var(--d-1);box-shadow:0 0 0 1px rgba(214,231,255,.85),0 0 0 4px rgb(var(--glow-rgb) / .16),0 10px 22px -10px rgb(var(--bloom-rgb) / .6)}
.plate:hover,.plate:focus-visible{transform:translateY(-1px);z-index:3} .plate:hover::before,.plate:focus-visible::before{opacity:1} .plate:active{transform:none}
.plate:focus-visible{outline:2px solid var(--sky);outline-offset:2px}
.plate.arrive::before{animation:arrive .9s var(--ease-out)}   /* one-time 'climbed' ring on a plate that moved up a step */
:is([data-density=compact],[data-density=tight]) .plate .plate-no{display:none}
[data-density=tight] .plate{font-size:12px;padding:0 5px;gap:3px}
Filtering (search q and KPI toggles share it; non-matches dim and are never hidden, so the silhouette stays):
.stairs-stage.filtering .plate:not(.hit){opacity:.2}
.stairs-stage.filtering .plate.hit::before{opacity:1}
Plate faces are fully opaque, so no name text ever sits on translucency.

10. HOVER CARD (replaces title=; blur budget item 3 of 3; hidden while the achievement popover is open)
.stair-tip{position:fixed;z-index:var(--z-pop);min-width:208px;max-width:260px;padding:10px 12px 11px;border-radius:8px;pointer-events:none;font-size:12.5px;line-height:1.55;color:var(--ink2);font-variant-numeric:tabular-nums;font-feature-settings:var(--num);background:var(--glass-dk-solid);box-shadow:inset 0 1px 0 rgba(234,242,255,.12),0 0 0 1px rgba(171,201,241,.2),var(--sh-float-dk);opacity:0;transform:translateY(4px);transition:opacity var(--d-1),transform var(--d-1)}
@supports (backdrop-filter:blur(1px)){@media (prefers-reduced-transparency:no-preference){.stair-tip{background:var(--glass-dk);-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%)}}}
.stair-tip.show{opacity:1;transform:none}
.stair-tip b{display:block;margin-bottom:4px;color:var(--ink);font-size:14px;font-weight:650;letter-spacing:-.02em}
.stair-tip .r{display:flex;justify-content:space-between;gap:16px} .stair-tip .r em{font-style:normal;color:var(--ink)}
.stair-tip .r.cats{justify-content:flex-start;gap:10px} .stair-tip .sw{display:inline-block;width:6px;height:6px;border-radius:1.5px;margin-right:4px;background:var(--c1)} .stair-tip .sw.c2{background:#4FB8A6} .stair-tip .sw.c3{background:#A58BEA} .stair-tip .sw.c4{background:var(--ink2)} .stair-tip .sw.c1{background:#86B2F2}   (lightened for dark)

11. EMPTY / CROWDED / EDGE CASES
- No roster: the stage still renders. KPIs and legend are hidden. Centre <div class='stairs-empty'><b>명단이 없습니다</b><p>설정 → 반·명단에서 학생을 등록하면 계단이 채워집니다</p><button class='btn' onClick={()=>setPage('settings')}>설정 열기</button></div>. .stairs-empty{margin:auto;text-align:center;display:grid;gap:8px;justify-items:center} .stairs-empty b{font-size:16px;font-weight:650;color:#C6D6EC} .stairs-empty p{margin:0;font-size:13px;color:var(--ink2)}. A large var(--stair-mark) watermark sits bottom-right at opacity .10.
- Semester start (everyone at 0): steps=4. The start tower holds everyone (w=ceil(n/rows), e.g. 2–3 wide). Treads 1–3 are unlit empty slabs with no peak. KPI '출발선 28명' is amber. .stairs-note{position:absolute;right:8px;bottom:calc(var(--base) + var(--rise) * 2 + 24px);max-width:260px;margin:0;text-align:right;font-size:13px;line-height:1.55;color:var(--ink2)} .stairs-note b{display:block;font-size:12px;font-weight:600;color:var(--ink3);margin-bottom:2px}.
- About 10 at 출발선: one tower if rows allow, otherwise 2 wide. The tower height is the alarm, backed by the amber dashed start line and the KPI.
- One crowded step (e.g. 18 at 3–4건): w grows to 2–4 from the measured rows; 'N명' stays on the slab.
- Many empty middle steps: narrow 36px unlit slabs keep the staircase continuous.
- Long or foreign names: ellipsis on the plate; the full name is in the hover card and aria-label.
- Very high counts (60+): bucket size grows ('7–12건'); still at most 12 steps.
- 1366px with the today pane open and 9+ occupied steps: the measured tiers fall to compact/tight (numbers hidden) or to ladder. Folding the today pane restores the full staircase.
- Short windows: the stage keeps min-height 440px and .content scrolls; nothing overlaps or clips.

12. LADDER (narrow pane or 200% zoom: horizontal step rows, highest on top)
[data-density=ladder]{--tagw:62px}
[data-density=ladder] .stairs-grid{display:flex;flex-direction:column-reverse;justify-content:flex-start;gap:6px;overflow:auto;background-color:transparent}
[data-density=ladder] .stair-col{flex-direction:row;align-items:flex-start;justify-content:flex-start;gap:10px;padding:6px 0;border-top:1px solid var(--dline)}
[data-density=ladder] :is(.stair-step,.stair-start){order:-1;flex:none;width:92px;height:28px;margin-left:calc(var(--i) * 6px);border-radius:4px;padding:0 8px;flex-direction:row;align-items:center;justify-content:space-between;-webkit-box-reflect:none}   /* indented chips trace the stair diagonal */
[data-density=ladder] .stair-start{border:1px dashed rgba(172,205,255,.42)} [data-density=ladder] .stair-start :is(.stair-range,.stair-n){position:static}
[data-density=ladder] .stair-stack{flex:1;min-width:0;grid-auto-flow:row;grid-template-rows:none;grid-template-columns:repeat(auto-fill,var(--tagw));justify-content:start;padding:0}
[data-density=ladder] .stair-stack .ph{display:none}
[data-density=ladder] .stair-col.empty{display:none}
[data-density=ladder] .stair-col.low-edge::after,[data-density=ladder] .stairs-horizon{display:none}
@container (max-width:640px){ .kpis{display:grid;grid-template-columns:1fr 1fr} .kpi:nth-child(odd){padding-left:0;border-left:0} .stairs-legend{margin-left:0;justify-items:start} }

13. INTERACTIONS AND ACCESSIBILITY
- Click / Enter / Space on a plate → onOpen(student), which opens StudentDetail (unchanged).
- Right-click, long-press, the ContextMenu key or Shift+F10 → the existing AchievementPopover (dark glass). useAchStep reads the preview store, so the plate retints live while the slider drags. The tip is suppressed while it is open.
- KPI toggles: 출발선 → hit = n===0; 이번 주 기록 → hit = week===0 ('미기록 보기'); 기록 부족 → hit = n<=lowTh. They combine with the toolbar search (AND). Esc clears the toggle. Each toggle is a real <button aria-pressed>.
- The stage has role=region. Each column is role=group with an aria-label like '3–4건, 6명'. Each plate is a <button> with a full aria-label ('7번 김민준, 기록 9건, 이번 주 2건, 도달 정도 72'). Tab order is the visual order (columns left→right, plates top→bottom by 번호).
- Hovering a column brightens its nosing and label only. Slabs are not click targets.

14. MOTION (entrance only, once per mount; stage keyed by class)
.stairs-head{animation:fade-in .5s var(--ease-out) backwards}
.stair-step{animation:rise-in var(--d-4) var(--ease-out) backwards;animation-delay:calc(var(--i) * var(--stagger-step))}   /* 12 steps start within .55s; the reflection follows the transform */
Plates: rise-sm .45s from 240ms with a 12ms stagger capped at 24, so everything settles in about 1s. After 1.3s .settled disables the plate entrance. A moved plate plays only the .9s ring-opacity 'arrive'. Nothing loops. Under prefers-reduced-motion everything shows its final state.

15. PERFORMANCE BUDGET (school PCs, WebView2)
- One static stage paint (grain + 3 gradients) on a non-scrolling element.
- At most 12 slabs, each with box-reflect; this doubles only the slab paint, because plates are siblings.
- 30 plates with 3 shadow layers each. Only transform and opacity animate; there is no box-shadow transition.
- No filter anywhere on the stage.
- One ResizeObserver with a 2px threshold.
- backdrop-filter only on the single hover card.
- Firefox web build: no reflection, and the floor still reads.

16. DELETE
HAIRS, ACCS, hash, KidChar; the .stairs-sky clouds, .flag and the +N bubble; the .stairs-sum/.stairs-low-key markup; percentage-based step heights and the absolute .stair-kids; every title tooltip. Do not restore the HEAD CSS (.cloud, .flag, .kid*, and keyframes drift/wave/bob/hop/kidIn).

## 모션
Principle: the landing's motion. Slow, short, plays once on entering a scene. Only opacity and transform animate. No idle loops, except the sync LED busy pulse (1.6s opacity) and the spinner, which both stop under reduced motion.

Tokens:
- --ease-out cubic-bezier(.2,.7,.2,1): the landing rise-in, for entrances.
- --ease-std cubic-bezier(.215,.61,.355,1): tab rails and KPI beams.
- --ease-reel cubic-bezier(.17,.68,.17,1): optional numerals.
- Durations: --d-1 .12s (hover colour, press), --d-2 .2s (lifts, fades), --d-3 .45s (rails), --d-4 .65s (stair slabs).
- Staggers: --stagger-step 50ms, --stagger-plate 12ms.

Keyframes are from-only with fill-mode backwards, so they never pin a transform and hover lifts keep working: rise-in (20px), rise-sm (10px), fade-in, modal-in (10px + scale .99), pop-in (4px), arrive (ring opacity 0→1→0), fresh (mark-colour flash), pulse.

Inventory:
- Page change: the .paper children fade in over .2s, opacity only. A transform here would turn .paper into the containing block for the non-portaled fixed modals. The band title does NOT animate, so nothing replays on every navigation. The sidebar never moves except its existing .15s width collapse.
- Class tabs: the 3px ink rail scales in from the left over .45s ease-std.
- Buttons: background and border over .12s; :active translateY(1px). Onboarding CTAs lift 2px over .2s. Cards and table rows never lift; a row hover is only a .12s background change.
- Name tags: the badge lifts 1px; there is no scale.
- Plates: translateY(-1px) over .12s, and the ring cross-fades through a pre-rendered ::before opacity. box-shadow is never transitioned.
- Today pane: the current-period card has a static lit rim and a static dot, no pulse. A newly added row gets a one-shot 1.2s colour flash, with no movement.
- Overlays: the scrim fades in .18s; a modal rises 10px from scale .99 over .26s and closes instantly. The area menu, slider popover and stair hover card pop in over .16s; the hover card has a 120ms intent delay and hides instantly. Toasts rise 10px over .22s.
- 표↔한눈에: the newly mounted view fades in through the paper rule.
- Stairs, on mount and on class switch via key={cls}:
  - the header fades in over .5s;
  - slabs rise 20px over .65s, staggered 50ms per step (12 steps start within .55s);
  - plates rise 10px over .45s from 240ms with a 12ms stagger capped at 24, so the class settles in about 1s;
  - KPI beams draw only when toggled.
  After 1.3s the stage gets .settled and data changes never replay the entrance. A plate that moved up a step plays only the .9s 'arrive' ring.
- Optional KPI count-up (rAF, 700ms ease-reel, first stairs mount per session only) is OFF by default for a daily tool.

Never animate:
- blur, backdrop-filter or filter;
- box-shadow (in loops or on hover);
- background-position, the grain, or slab heights;
- anything on .sheet or .paper beyond child opacity.
Never use 3D tilt or perspective on Korean text, and never leave a fractional translateY at rest (it blurs glyphs). Never animate opacity or filter on an ancestor of a blurred surface (backdrop root).

@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}. This is the landing's own rule: every element is authored so its resting state is the final state.

## 가독성
1. TWO-SURFACE RULE. All reading happens on paper: tables, today pane, drafts, forms, settings, modal bodies, the inbox grid and toasts.notice are dark text on #FFFFFF, #F7FAFE, #F2F6FC or #E8EFF8. The night carries only chrome (navigation, page titles, band buttons), the stairs stage (short labels, numbers, plates) and transient HUDs. No body copy, table cell or form field ever sits on navy or on translucent glass. Every scroll container has an opaque background-color, so Chromium keeps LCD text and composited scrolling on 1x school monitors.

2. MEASURED CONTRAST (WCAG 2.x)
Paper:
- --text #152D4A: 13.94 on white, 12.86 on #F2F6FC, 12.04 on #E8EFF8, 12.74 on the chip bg.
- --text2 #4E6886, for all meaningful small text (timestamps, labels, counts, ib-ctx): 5.76, 5.31, 4.97. The old #56708D failed on the recessed pane. On the selected-row tint it is 5.11.
- --text3 #7D93AE is 3.15, so it is only for icons, separators and disabled controls, never words.
- --placeholder #627590: 4.70.
- --accent #245AA7: 6.78 as text and white-on, 6.26 on paper, 5.75 on #E2EDFF. White on the primary gradient: 5.65 top, 6.78 bottom.
- --warn #9E4512: 6.34 on white, 6.06 on the pending row, 5.54 on #FCEDE2 (the old pair was 4.41). White on --warn-strong #B4521A: 5.05. ok #17695A on #DDF1EB: 5.57.
- Primary landing CTA #122A47 on #DEEBFF: 12.04.
Night:
- --ink #EAF2FF: 16.45 on #081422, 12.54 on the #142C49 pool, 15.25 on #0D1C2E.
- --ink2 #A3B7D2: 9.05, 6.90 on the pool.
- --ink3 #7F95B2: 6.04, 4.61 on the pool, 5.60 on #0D1C2E. This is the floor for readable dark text: ≥12px and weight ≥500.
- --ink4 #5B6E86: 3.55, non-text only.
- Band title #DCE9FC: 11.51 even under the bloom.
- KPI numerals #D6E6FD: 14.64. Amber-ink #FFC9A8: 12.50, 10.48 on its tint. Secondary button text #C6DCFC: 13.27; its boundary #52719A is 3.69.
- HUDs: #EAF2FF on the #112338 solid fallback is 14.11. Glass fills are ≥82% opaque, so text stays ≥10:1 over any backdrop.
Stage:
- Slab range label #DCE9FC: 9.58 on the slab face, ≥5.47 on the brightest lit band. Counts #A3B7D2: 5.75 on the face (they sit below the band).
- Onboarding glass title #0A2460: 12.07 on #E2E9FD, 10.36 on #CCD9F9.

3. NAME TAGS AND PLATES
- Paper tags (flat): g0 12.40, g1 9.39, g2 6.70, g3 7.58 (white), g4 15.36.
- Stage plates (worst gradient stop): g0 11.64, g1 8.48, g2 5.84, g3 6.42 (white), g4 12.15, gx 10.35.
- The plate number uses the full ink colour (no opacity) at 10.5px/600, so it matches the name's ratio. On compact and tight densities it is hidden; the aria-label and hover card carry it.
- Non-text ≥3:1: g0 on white is only 1.12 alone, so g0 always carries a rgba(21,45,74,.16) ring on paper. On night, g3 is 2.44 alone and g4 is 1.07 alone, so the inset sky rings are MANDATORY. Composited, the ring edge is 4.4–5.2:1 against #081422 (≈3–4 over the pool). The ring lives in the base rule and is re-declared in every state.
- The achievement ramp is low-chroma slate→graphite, never action blue (primary #245AA7). The g0 plate differs from the white secondary button by its ring, its 4px vs 5px radius, its fixed width and its inline number, and plates never sit in action rows.

4. TYPE FOR DENSE KOREAN
- Body: 14px/1.6, weight 400, -0.006em. UI: 13.5px/600, -0.012em. Table names: 14.5px/650, -0.02em. Prose (drafts, review): 15px/1.85 at -0.004em with text-wrap:pretty.
- word-break:keep-all with overflow-wrap:anywhere, so Hangul never splits mid-word.
- Display tracking (≤ -0.036em) only at ≥26px; the -0.052em/750 hero only at 52px. Hangul never gets wide tracking or uppercase; .18em and uppercase are for Latin micro-labels only (NUGA, the 01 index).
- Every count, date and time uses tnum + ss01 + ss03, so columns align, 6 and 9 are unambiguous, and 09:50–10:40 has a centred colon. These are set after any font: shorthand.
- Weights stay ≥500 below 14px on dark (ClearType); there is no 300 and no 800 anywhere.
- Pure #FFF is used only for rims, speculars, white-on-blue/warn fills and g3 plates, never for body text on navy.

5. STRUCTURE WITHOUT BOXES
- Hairlines are 1px at 8/14/22% ink alpha, never 0.5px (it blurs or vanishes at Windows 125/150%). Strong rules are 1.5px ink (table tops, the inbox grid, section mastheads).
- Density is preserved: rows 46px, today rows 38px, header 38px. The extra air goes only to the gutter, the band and the sheet padding.
- One lit card per screen: the current period. No zebra stripes, no grey key column, no nested borders.
- Hover is a left-weighted 6% wash; selection is an 8% tint plus a 2px accent bar, so dense lists never flicker.

6. COLOUR IS NEVER THE ONLY CHANNEL
- Category: swatch + word.
- Achievement: tint + number badge on paper; on the stage, tint + hover-card number + legend.
- Low-record: amber nosing + dashed guide + amber label + legend key + KPI.
- This week: dot + KPI meter + hover text.
- Pending: amber left bar + amber number.
- Sync error: amber LED + status text.

7. PREFERENCES
- prefers-contrast:more: darker hairlines, --text2 becomes #3F5876, solid currentColor rings on tags and plates, a flat navy stage, and no nosing glows.
- prefers-reduced-transparency: all glass becomes solid #112338 and reflections are removed.
- forced-colors: CanvasText borders on tags and plates, a CanvasText top edge on slabs, and decorative rims hidden.
- 200% zoom or a narrow pane: the stairs fall to ladder rows with no horizontal scroll.
- Focus is always visible: 2px #245AA7 with a 2px offset on paper; 2px sky plus a 6px halo on dark.

## 위험
- Vertical space on 1366×768 school screens: the 64px band plus the 10px gutter and 3px bezel cost about 30px. Under max-height:780px the tokens shrink to 54px / 6px / 2px with --pad 20px. Verify that the today pane still shows at least two class fields without scrolling and that the stairs stage gets ≥440px (otherwise .content scrolls by design).
- Fixed-position modals are NOT portaled (ui.tsx Modal renders .overlay in place), so they live inside .paper. Any future transform, filter, contain, will-change, backdrop-filter, isolation or z-index on .sheet/.paper, or a transform entrance on them, traps or mis-stacks StudentDetail and QuickAdd. The paper entrance is opacity-only on purpose; keep the CSS warning comment and consider portaling Modal later.
- The Sheet wrapper is a TSX change in five pages. A page that misses it would put dark text on the night. The .main>:is(.content,.tabsrow,.rec-split) paper safety net covers it, but visually check every page, including the 설정 sub-tabs and 모바일 확인.
- The phone mock: the tokens --accent, --text2, --warn, --ok, --muted, --head-bg and --key-bg change globally. The .mp-phone token-restore block and :where(x:not(.mp-phone *)) scoping are mandatory. Compare before/after screenshots of 모바일 확인; the phone frame must be pixel-identical.
- Dark-ground leakage: the TopBar now sits on navy. Any inline style color:'var(--warn)' (dark brown) or var(--text) passed into TopBar props (center/right/titleSlot) becomes invisible. Grep the TopBar call sites and swap them to var(--amber-ink) / var(--ink). The same applies to the sidebar LED (fixed via the .err class).
- The dark-ground family relies on :where() keeping specificity equal to base .btn/.seg, so the order in the file decides. If someone later appends a stronger .btn rule, band buttons revert to paper styling. Keep that block after all base rules and forbid re-declarations in a comment.
- Achievement rings: on the stage g3 is 2.44:1 and g4 is 1.07:1 without their inset sky rings. Any refactor that sets box-shadow:none in a hover, contrast or state override makes the 'black-based' high achievers vanish. The ring is in the base plate rule and the hover ring is a separate ::before, so the plate's own box-shadow never changes.
- ACH_COLORS, StudentTag and the plates must change together. The new ramp in ui.tsx, the shared useAchStep hook, removing the inline .ach-num colour (otherwise the number disappears on the dark popover) and deleting the .ach-scale row all have to ship in the same commit as the CSS.
- Stairs layout depends on measurement: ResizeObserver → setState can flash or loop. It is guarded by the 2px threshold and by rendering columns only after the first measure. Keep BASE=34/RISE=14/PH=26/GAP=4 identical in TSX and the --base/--rise/--plate-h tokens, and keep --tagw values identical between the TIERS array and the [data-density] rules.
- Density fallback: with the today pane open at 1366px, 9+ occupied steps drop to compact/tight (numbers hidden) or ladder. This is acceptable but should be mentioned once in the hint or release notes ('오늘 기록을 접으면 계단이 넓어집니다'). Four-character names ellipsize in tight plates; the hover card and aria-label carry the full name.
- -webkit-box-reflect is Chromium-only and doubles each slab's paint. It is decorative only (Firefox web shows no reflection). Plates must stay siblings of .stair-step, and the floor must be painted on the stage's own ::after, never on a later sibling with a background, or the reflection is covered.
- Gradient rims built with mask-composite need both -webkit-mask-composite:xor and mask-composite:exclude. Without the prefix, older WebView2 runtimes paint a filled rectangle over the sheet, the current-period card, the stage and the popover.
- Pretendard Variable is bundled (about 2MB in public/fonts). That avoids blocked-CDN school networks but grows the web build, and true 650/750 weights render slightly lighter than the landing's static 700/800 snap. This is deliberate. The static CDN link stays as the second fallback, and Malgun Gothic is the last resort.
- Glow inflation is how this look turns into gaming/crypto. The budget per screen is fixed: sheet bloom, active-nav beam, current-period rim, and on the stage the peak bloom, this-week dots, KPI beam and horizon dot. Reject any added neon hover, glowing table rows, animated or conic borders, or cursor spotlights. Every addition must pass the restraint test (switch all glow off, and the screen must still read).
- Projectors and washed-out classroom displays can erase the difference between lit, empty and low slabs. No information depends on it alone: range labels, N명 counts, amber labels, the dashed guide and the legend carry it.
- The primary-button colour changes: navy-ink becomes a blue gradient on paper (and the landing light CTA on the band). This fixes the confusion between g4 tags and buttons, but it changes a learned colour. Enforce one primary per view: the band '+기록' is secondary and the today-pane '추가' is primary; per-class '미반영' becomes warn-outline.
- Removing the characters loses some playfulness the teacher may have liked. The peak bloom, the 'arrive' ring on a student who climbed, and the KPI toggles are the remaining delight cues. Keep them subtle rather than adding new ones.
- Draft review highlights change from pastel full fills to marker underlays with the same hue meaning. The .span-legend must show the new look so teachers relearn it instantly.
- Print: without the @media print reset, printing a draft or table would include the navy shell. The QR image keeps a white 8px quiet zone, or phone pairing scans fail.