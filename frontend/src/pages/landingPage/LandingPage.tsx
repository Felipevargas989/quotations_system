import { useEffect, useRef } from "react";

// Landing pública de Eventia (rediseño 23-07 con Felipe).
// HTML/CSS aprobado como maqueta; botones -> flujos reales:
// "Prueba gratis" -> /register (crea la empresa), "Acceder" -> /login.

const LANDING_HTML = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  :root{
    --azure:#1597E5;        /* Azul Eventia — primario */
    --azure-deep:#0f7ac2;   /* hover */
    --navy:#0B1F33;         /* Azul Noche — oscuros y títulos */
    --celeste:#EAF6FF;      /* Celeste Claro — fondos/chips */
    --teal:#24C6C8;         /* Turquesa Digital — acento */
    --teal-deep:#159fa1;
    --gris:#F4F7FA;         /* Gris Interfaz */
    --ink:#12263f;
    --muted:#5b6b82;
    --line:#e4ebf3;
    --ok:#10b981;
    --danger:#ef4444;
    --radius:18px;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{font-family:"Inter",ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--ink);background:#fff;line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1140px;margin:0 auto;padding:0 24px}
  .btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;border-radius:12px;
    padding:13px 22px;font-size:15px;cursor:pointer;transition:.18s;border:1px solid transparent}
  .btn-primary{background:var(--azure);color:#fff}
  .btn-primary:hover{background:var(--azure-deep);transform:translateY(-2px);box-shadow:0 12px 26px rgba(21,151,229,.32)}
  .btn-teal{background:var(--teal);color:#04302f}
  .btn-teal:hover{background:var(--teal-deep);color:#fff;transform:translateY(-2px);box-shadow:0 12px 26px rgba(36,198,200,.4)}
  .btn-ghost{background:#fff;color:var(--azure);border-color:var(--line)}
  .btn-ghost:hover{background:var(--celeste);transform:translateY(-1px)}
  .btn-white{background:#fff;color:var(--azure)}.btn-white:hover{transform:translateY(-2px)}
  .eyebrow{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--azure)}
  .section{padding:92px 0}
  h2.title{font-size:36px;line-height:1.12;font-weight:800;letter-spacing:-.025em;color:var(--navy)}
  .sub{color:var(--muted);font-size:17px;max-width:620px;margin-top:14px}

  .reveal{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
  .reveal.in{opacity:1;transform:none}

  /* NAV */
  nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .nav-in{display:flex;align-items:center;justify-content:space-between;height:68px}
  .logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;letter-spacing:-.01em;color:var(--navy)}
  .logo .mark{display:grid;place-items:center}
  .nav-links{display:flex;gap:28px;align-items:center;font-size:15px;color:var(--muted);font-weight:600}
  .nav-links a:hover{color:var(--ink)}
  .nav-cta{display:flex;gap:10px;align-items:center}
  @media(max-width:820px){.nav-links{display:none}}

  /* HERO */
  .hero{background:
      radial-gradient(1200px 520px at 84% -10%, rgba(21,151,229,.16), transparent 58%),
      radial-gradient(680px 340px at 8% 120%, rgba(36,198,200,.14), transparent 60%),
      linear-gradient(180deg,#fff,#f3faff);padding:80px 0 40px}
  .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:52px;align-items:center}
  .hero h1{font-size:54px;line-height:1.04;font-weight:800;letter-spacing:-.035em;color:var(--navy)}
  .hero h1 .hl{position:relative;white-space:nowrap;color:var(--azure)}
  .hero h1 .hl:after{content:"";position:absolute;left:0;right:0;bottom:6px;height:12px;background:rgba(36,198,200,.4);z-index:-1;border-radius:3px}
  .hero p.lead{font-size:19px;color:#334a63;margin-top:20px;max-width:520px}
  .hero .cta{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
  .trust{margin-top:22px;display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14px}
  .trust .dot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px rgba(16,185,129,.15)}
  @media(max-width:820px){.hero-grid{grid-template-columns:1fr;gap:36px}.hero h1{font-size:39px}}

  @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  .shot{background:#fff;border:1px solid var(--line);border-radius:var(--radius);
    box-shadow:0 34px 70px -34px rgba(11,31,51,.4);overflow:hidden}
  .shot.float{animation:floaty 6s ease-in-out infinite}
  .shot .bar{height:40px;background:var(--azure);display:flex;align-items:center;gap:6px;padding:0 15px}
  .shot .bar i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.5)}
  .shot .body{padding:18px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .kpi{background:var(--gris);border:1px solid var(--line);border-radius:12px;padding:12px}
  .kpi .l{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}
  .kpi .v{font-size:21px;font-weight:800;margin-top:4px;color:var(--navy)}
  .kpi .v.green{color:var(--ok)}.kpi .v.teal{color:var(--teal-deep)}
  .rowline{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}
  .rowline:last-child{border-bottom:0}
  .pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px}
  .pill.g{background:#dcfce7;color:#166534}.pill.y{background:#fef3c7;color:#92400e}.pill.r{background:#fee2e2;color:#991b1b}

  /* trust strip */
  .strip{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff}
  .strip-in{display:flex;justify-content:center;gap:40px;flex-wrap:wrap;padding:18px 0}
  .strip-in span{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--navy)}
  .strip-in .ck{color:var(--teal-deep)}

  /* PAIN */
  .pain{background:
      radial-gradient(760px 320px at 12% -5%, rgba(239,68,68,.12), transparent 55%),
      radial-gradient(640px 320px at 100% 120%, rgba(21,151,229,.22), transparent 60%),
      var(--navy);color:#dbe7f5}
  .pain h2{color:#fff}
  .pain .sub{color:#9fb3d1}
  .pain-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:38px}
  .pcard{position:relative;overflow:hidden;background:linear-gradient(180deg,#12294a,#0f2240);
    border:1px solid #244066;border-radius:16px;padding:24px;transition:.22s;min-height:212px}
  .pcard:hover{transform:translateY(-6px);border-color:#c23a3a;box-shadow:0 22px 44px -22px rgba(0,0,0,.55)}
  .pic{width:44px;height:44px;border-radius:12px;background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.35);
    display:grid;place-items:center;color:#fca5a5;transition:.22s}
  .pcard:hover .pic{background:rgba(239,68,68,.28);transform:scale(1.06)}
  .pcard h4{color:#fff;font-size:16px;font-weight:800;margin:15px 0 7px}
  .pcard p{font-size:13.5px;color:#aebfdb}
  .pcard .solve{margin-top:14px;display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#5eead4;font-weight:600;
    max-height:0;opacity:0;transform:translateY(6px);transition:.28s;overflow:hidden}
  .pcard:hover .solve{max-height:80px;opacity:1;transform:none}
  .pcard .solve .ck{flex-shrink:0;color:var(--teal);margin-top:1px}
  @media(max-width:900px){.pain-grid{grid-template-columns:1fr 1fr}}
  @media(max-width:540px){.pain-grid{grid-template-columns:1fr}}

  /* 3 pasos */
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:44px}
  .step{border:1px solid var(--line);border-radius:var(--radius);padding:30px;background:#fff;transition:.2s}
  .step:hover{border-color:#bfe0f6;box-shadow:0 22px 46px -28px rgba(11,31,51,.4);transform:translateY(-4px)}
  .step .n{width:44px;height:44px;border-radius:12px;color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px}
  .step:nth-child(1) .n{background:var(--navy)}
  .step:nth-child(2) .n{background:var(--azure)}
  .step:nth-child(3) .n{background:var(--teal);color:#04302f}
  .step h3{font-size:21px;font-weight:800;margin:16px 0 8px;color:var(--navy)}
  .step p{color:var(--muted);font-size:15px}
  @media(max-width:820px){.steps{grid-template-columns:1fr}}

  /* features */
  .feat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:44px}
  .feat{border:1px solid var(--line);border-radius:15px;padding:22px;transition:.2s;background:#fff}
  .feat:hover{border-color:#bfe0f6;background:#fbfdff;transform:translateY(-4px);box-shadow:0 18px 40px -30px rgba(11,31,51,.5)}
  .feat .ic{width:44px;height:44px;border-radius:12px;background:var(--celeste);color:var(--azure);display:grid;place-items:center;transition:.2s}
  .feat:hover .ic{background:var(--azure);color:#fff}
  .feat h4{font-size:15.5px;font-weight:800;margin:14px 0 6px;color:var(--navy)}
  .feat p{font-size:13.5px;color:var(--muted)}
  @media(max-width:900px){.feat-grid{grid-template-columns:1fr 1fr}}
  @media(max-width:540px){.feat-grid{grid-template-columns:1fr}}

  /* split */
  .split{display:grid;grid-template-columns:1fr 1fr;gap:52px;align-items:center}
  .split ul{list-style:none;margin-top:22px;display:flex;flex-direction:column;gap:14px}
  .split li{display:flex;gap:12px;font-size:15px;color:#334a63}
  .split li .ck{color:var(--ok);flex-shrink:0;margin-top:2px}
  .chart{display:flex;align-items:flex-end;gap:14px;height:150px;padding:26px 4px 0}
  .bar{flex:1;border-radius:8px 8px 0 0;background:linear-gradient(180deg,#49b0ec,#1597E5);position:relative}
  .bar.t{background:linear-gradient(180deg,#5ad6d8,#24C6C8)}
  .bar .cap{position:absolute;top:-22px;left:0;right:0;text-align:center;font-size:12px;font-weight:800;color:var(--navy)}
  .chart-x{display:flex;gap:14px;padding:8px 4px 0}
  .chart-x span{flex:1;text-align:center;font-size:11px;color:var(--muted);font-weight:600}
  @media(max-width:820px){.split{grid-template-columns:1fr;gap:32px}}

  /* SOCIAL PROOF */
  .logos{display:flex;justify-content:center;align-items:center;gap:20px 44px;flex-wrap:wrap;margin-top:24px}
  .logos span{display:inline-flex;align-items:center;gap:9px;font-size:19px;font-weight:800;color:#93a3ba;letter-spacing:-.01em}
  .logos span svg{opacity:.55}
  .testi{max-width:780px;margin:46px auto 0;background:var(--celeste);border:1px solid #d6e8fb;border-radius:20px;padding:40px 44px;position:relative}
  .testi .qm{position:absolute;top:16px;left:26px;font-size:72px;line-height:1;color:#bfdcf7;font-weight:800;font-family:Georgia,serif}
  .tq{font-size:23px;line-height:1.45;font-weight:600;color:var(--navy);letter-spacing:-.01em;position:relative}
  .tauthor{display:flex;align-items:center;gap:14px;justify-content:center;margin-top:26px}
  .tav{width:52px;height:52px;border-radius:50%;background:var(--azure);color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px;flex-shrink:0;object-fit:cover;overflow:hidden}
  .tn{font-weight:800;color:var(--navy)}
  .tr{font-size:13px;color:var(--muted)}
  @media(max-width:540px){.testi{padding:30px 24px}.tq{font-size:19px}}

  /* PRICING */
  .price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:44px;align-items:start}
  .plan{border:1px solid var(--line);border-radius:var(--radius);padding:30px;background:#fff;position:relative;transition:.2s}
  .plan:hover{transform:translateY(-5px);box-shadow:0 26px 56px -34px rgba(11,31,51,.45)}
  .plan.pop{border:2px solid var(--azure);box-shadow:0 26px 60px -34px rgba(21,151,229,.5)}
  .plan .tag{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--azure);color:#fff;
    font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:5px 14px;border-radius:999px}
  .plan .pname{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--azure)}
  .plan.teal .pname{color:var(--teal-deep)}
  .plan .who{font-size:13px;color:var(--muted);margin-top:6px;min-height:36px}
  .plan .amt{font-size:44px;font-weight:800;letter-spacing:-.025em;margin-top:12px;color:var(--navy)}
  .plan .amt span{font-size:15px;font-weight:600;color:var(--muted)}
  .plan .limits{font-size:13px;color:var(--muted);margin-top:6px;padding-bottom:16px;border-bottom:1px solid var(--line)}
  .plan ul{list-style:none;margin:18px 0 24px;display:flex;flex-direction:column;gap:11px}
  .plan li{display:flex;gap:10px;font-size:14px;color:#334a63}
  .plan li .ck{color:var(--ok);flex-shrink:0}
  .plan .btn{width:100%;justify-content:center}
  @media(max-width:820px){.price-grid{grid-template-columns:1fr}}

  /* origin */
  .origin{background:var(--celeste)}
  .origin-in{display:grid;grid-template-columns:.9fr 1.1fr;gap:44px;align-items:center}
  .quote{font-size:27px;font-weight:800;line-height:1.3;letter-spacing:-.015em;color:var(--navy)}
  .quote .hl{color:var(--azure)}
  .stat3{margin-top:22px;display:flex;gap:34px;flex-wrap:wrap}
  .stat3 .num{font-size:34px;font-weight:800;color:var(--azure)}
  .stat3 .num.teal{color:var(--teal-deep)}
  .stat3 .cap{color:var(--muted);font-size:14px;max-width:150px}
  @media(max-width:820px){.origin-in{grid-template-columns:1fr}}

  /* final */
  .final{background:linear-gradient(120deg,var(--navy),var(--azure));color:#fff;text-align:center;border-radius:26px;padding:64px 24px;position:relative;overflow:hidden}
  .final:after{content:"";position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(36,198,200,.4),transparent 70%);top:-120px;right:-70px}
  .final h2{font-size:36px;font-weight:800;letter-spacing:-.025em;position:relative;color:#fff}
  .final p{color:#d3e6f7;margin-top:12px;font-size:17px;position:relative}
  .final .cta{margin-top:26px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative}
  .final small{display:block;margin-top:16px;color:#bcd6ec;font-size:13px;position:relative}

  footer{border-top:1px solid var(--line);padding:38px 0;color:var(--muted);font-size:14px}
  .foot-in{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px}

  /* ===== AJUSTES MÓVIL (24-07) — header y titulares sin desborde en el teléfono.
     Todo vive dentro de <=560px: el desktop NO cambia una coma. ===== */
  @media(max-width:560px){
    .nav-in{height:60px}
    .logo{font-size:17px;gap:8px}
    .logo svg{width:30px;height:30px}
    .nav-cta{gap:8px}
    .nav-cta .btn{padding:9px 14px;font-size:13px;white-space:nowrap}
    .hero{padding:52px 0 30px}
    .hero h1{font-size:33px}
    .hero h1 .hl{white-space:normal}
    .hero p.lead{font-size:17px}
    h2.title{font-size:29px}
    .strip-in{gap:12px 22px;padding:16px 0}
  }
</style>
<!-- NAV -->
<nav>
  <div class="wrap nav-in">
    <div class="logo"><span class="mark">
      <svg width="34" height="34" viewBox="0 0 64 64" fill="none" aria-label="Eventia">
        <path d="M8 11 H41 L32 21 H8 Z" fill="#1597E5"/>
        <path d="M8 25 H35 L26 35 H8 Z" fill="#1597E5"/>
        <path d="M11 41 L22 53 L49 24" stroke="#0B1F33" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>Eventia</div>
    <div class="nav-links">
      <a href="#funciones">Funciones</a><a href="#como">Cómo funciona</a><a href="#precios">Precios</a>
    </div>
    <div class="nav-cta">
      <a class="btn btn-ghost" href="/login">Acceder</a>
      <a class="btn btn-primary" href="/register">Prueba gratis</a>
    </div>
  </div>
</nav>

<!-- HERO -->
<header class="hero">
  <div class="wrap hero-grid">
    <div>
      <span class="eyebrow">Orden inteligente para eventos</span>
      <h1 style="margin-top:14px">Vende el doble con<br><span class="hl">la mitad del esfuerzo</span></h1>
      <p class="lead">Eventia cotiza, gestiona y cobra tus eventos en un solo lugar.
        Sin planillas, sin cabos sueltos, sin perder un detalle.</p>
      <div class="cta">
        <a class="btn btn-primary" href="/register">Empieza gratis
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
        <a class="btn btn-ghost" href="#como">Ver cómo funciona</a>
      </div>
      <div class="trust"><span class="dot"></span>Para hoteles, banqueterías, centros de eventos y productoras.</div>
    </div>
    <div class="shot float">
      <div class="bar"><i></i><i></i><i></i></div>
      <div class="body">
        <div class="kpis">
          <div class="kpi"><div class="l">Ventas del mes</div><div class="v">$8,2M</div></div>
          <div class="kpi"><div class="l">Margen</div><div class="v green">41%</div></div>
          <div class="kpi"><div class="l">Por cobrar</div><div class="v teal">$1,4M</div></div>
        </div>
        <div style="margin-top:16px">
          <div class="rowline"><span>Matrimonio · 220 personas</span><span class="pill g">Pagado</span></div>
          <div class="rowline"><span>Cena de empresa · 80 personas</span><span class="pill y">Pendiente</span></div>
          <div class="rowline"><span>Coctel corporativo · 150 personas</span><span class="pill r">Vencido</span></div>
        </div>
      </div>
    </div>
  </div>
</header>

<!-- TRUST STRIP -->
<div class="strip">
  <div class="wrap strip-in">
    <span><span class="ck"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg></span> Menos planillas</span>
    <span><span class="ck"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg></span> Más control</span>
    <span><span class="ck"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg></span> Mejores eventos</span>
  </div>
</div>

<!-- PAIN -->
<section class="section pain">
  <div class="wrap">
    <span class="eyebrow reveal" style="color:#7fd4ff">¿Te suena?</span>
    <h2 class="title reveal" style="margin-top:12px">El caos que Eventia elimina</h2>
    <p class="sub reveal">Pasa el cursor por cada uno y mira cómo se resuelve.</p>
    <div class="pain-grid">
      <div class="pcard reveal">
        <div class="pic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M9 13h6M9 17h4"/></svg></div>
        <h4>Cotizaciones en Word</h4>
        <p>Que se pierden, se repiten y nunca sabes cuál era la última.</p>
        <div class="solve"><span class="ck"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg></span> Una sola cotización viva, siempre la última.</div>
      </div>
      <div class="pcard reveal">
        <div class="pic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></div>
        <h4>¿Quién me debe?</h4>
        <p>Pagos sueltos en cuadernos y WhatsApp, saldos que no cuadran.</p>
        <div class="solve"><span class="ck"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg></span> Semáforo de cobranza: quién te debe, hoy.</div>
      </div>
      <div class="pcard reveal">
        <div class="pic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg></div>
        <h4>Compras a ojo</h4>
        <p>Compras de más o de menos, sin saber el costo real del evento.</p>
        <div class="solve"><span class="ck"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg></span> Compras exactas, calculadas desde la receta.</div>
      </div>
      <div class="pcard reveal">
        <div class="pic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg></div>
        <h4>Márgenes tarde</h4>
        <p>Descubres si ganaste cuando el evento ya pasó. Sin control.</p>
        <div class="solve"><span class="ck"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg></span> El margen, antes de confirmar el evento.</div>
      </div>
    </div>
  </div>
</section>

<!-- 3 PASOS -->
<section class="section" id="como">
  <div class="wrap">
    <span class="eyebrow reveal">En 3 pasos</span>
    <h2 class="title reveal" style="margin-top:12px">Cotiza, gestiona y cobra</h2>
    <p class="sub reveal">Todo el evento vive en un solo lugar, del primer contacto al último pago.</p>
    <div class="steps">
      <div class="step reveal"><div class="n">1</div><h3>Cotiza</h3><p>Arma cotizaciones profesionales en minutos, con tu marca y tu carta. Recibe pedidos desde un enlace público que compartes por WhatsApp.</p></div>
      <div class="step reveal"><div class="n">2</div><h3>Gestiona</h3><p>Agenda, cocina, mobiliario y compras de cada evento coordinados. Tu equipo sabe qué hacer, cuándo y para cuántos.</p></div>
      <div class="step reveal"><div class="n">3</div><h3>Cobra</h3><p>Semáforo de cobranza, saldos claros y avisos de vencidos. Deja de perseguir clientes: el sistema te dice a quién llamar hoy.</p></div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section" id="funciones" style="background:var(--gris)">
  <div class="wrap">
    <span class="eyebrow reveal">Todo incluido</span>
    <h2 class="title reveal" style="margin-top:12px">Un sistema, no diez planillas</h2>
    <div class="feat-grid">
      <div class="feat reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg></div><h4>Cotizador con tu marca</h4><p>Categorías, menús guardados, niños y adultos, PDF profesional.</p></div>
      <div class="feat reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></div><h4>Pagos y cobranza</h4><p>Cuotas, saldos, comprobantes y semáforo de vencidos.</p></div>
      <div class="feat reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg></div><h4>Ficha de cocina</h4><p>Recetas calculadas, retiro de bodega y checklist imprimible.</p></div>
      <div class="feat reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg></div><h4>Compras y proveedores</h4><p>Consolida insumos por proveedor y genera órdenes en PDF.</p></div>
      <div class="feat reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div><h4>Calendario de eventos</h4><p>Tu agenda visual, con eventos de varios días.</p></div>
      <div class="feat reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg></div><h4>Clientes 360°</h4><p>Historial, múltiples contactos y segmentos comerciales.</p></div>
      <div class="feat reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg></div><h4>Dashboard con márgenes</h4><p>Ventas, caja y utilidad por evento en tiempo real.</p></div>
      <div class="feat reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v12H5.17L4 17.17V4Z"/><path d="M8 9h8M8 12h5"/></svg></div><h4>Enlace público</h4><p>Tus clientes piden cotización solos desde un link.</p></div>
    </div>
  </div>
</section>

<!-- DASHBOARD HIGHLIGHT -->
<section class="section">
  <div class="wrap split">
    <div class="shot reveal">
      <div class="bar" style="background:var(--navy)"><i></i><i></i><i></i></div>
      <div class="body">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Margen por mes</span>
          <span style="font-size:12px;color:var(--ok);font-weight:800">▲ 41% promedio</span>
        </div>
        <div class="chart">
          <div class="bar" style="height:58%"><span class="cap">38%</span></div>
          <div class="bar" style="height:66%"><span class="cap">39%</span></div>
          <div class="bar" style="height:80%"><span class="cap">44%</span></div>
          <div class="bar t" style="height:74%"><span class="cap">41%</span></div>
        </div>
        <div class="chart-x"><span>Oct</span><span>Nov</span><span>Dic</span><span>Ene</span></div>
      </div>
    </div>
    <div class="reveal">
      <span class="eyebrow">Inteligencia, no adivinanza</span>
      <h2 class="title" style="margin-top:12px">Sabe cuánto ganas<br>antes de confirmar</h2>
      <ul>
        <li><span class="ck"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg></span> El margen de cada evento, calculado desde tus recetas y compras reales.</li>
        <li><span class="ck"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg></span> Qué cobrar hoy, qué evento se viene y qué cotización se está enfriando.</li>
        <li><span class="ck"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg></span> En qué proveedor gastas más y dónde puedes comprar mejor.</li>
      </ul>
    </div>
  </div>
</section>

<!-- SOCIAL PROOF -->
<section class="section" style="background:#fff;padding-top:70px;padding-bottom:70px">
  <div class="wrap" style="text-align:center">
    <span class="eyebrow reveal">Confían en Eventia</span>
    <div class="logos reveal">
      <span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 7v6c0 5 3.5 8 9 9 5.5-1 9-4 9-9V7l-9-5Z"/></svg> Complejo Turístico Valle del Sol</span>
    </div>
    <div class="testi reveal">
      <span class="qm">&ldquo;</span>
      <p class="tq">Eventia me permitió vender el doble con la mitad del esfuerzo. Dejé las planillas para siempre y por fin sé cuánto gano en cada evento — antes de confirmarlo.</p>
      <div class="tauthor">
        <img class="tav" src="data:image/jpeg;base64,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" alt="Felipe Vargas" />
        <div style="text-align:left">
          <div class="tn">Felipe Vargas</div>
          <div class="tr">Complejo Turístico Valle del Sol · Quillón</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="section" id="precios" style="background:var(--gris)">
  <div class="wrap">
    <div style="text-align:center">
      <span class="eyebrow reveal">Precios simples</span>
      <h2 class="title reveal" style="margin-top:12px">Crece a tu ritmo</h2>
      <p class="sub reveal" style="margin:14px auto 0">Empieza gratis 7 días. Sin tarjeta. Cambias de plan cuando quieras.</p>
    </div>
    <div class="price-grid">
      <div class="plan reveal">
        <div class="pname">Cotiza</div>
        <div class="who">Para el que quiere dejar el Excel y vender profesional.</div>
        <div class="amt">$20<span> USD/mes</span></div>
        <div class="limits">Hasta 20 cotizaciones/mes · 1 usuario</div>
        <ul>
          <li><span class="ck">✓</span> Cotizador con tu marca y PDF al cliente</li>
          <li><span class="ck">✓</span> Catálogo de servicios y precios</li>
          <li><span class="ck">✓</span> Enlace público de cotización</li>
          <li><span class="ck">✓</span> Ficha de clientes</li>
          <li><span class="ck">✓</span> Panel comercial (ventas y conversión)</li>
        </ul>
        <a class="btn btn-ghost" href="/register">Empezar gratis</a>
      </div>
      <div class="plan pop reveal">
        <div class="tag">Más popular</div>
        <div class="pname">Gestiona y Cobra</div>
        <div class="who">Para el que ya vende y necesita cobrar sin perder cuentas.</div>
        <div class="amt">$50<span> USD/mes</span></div>
        <div class="limits">Cotizaciones ilimitadas · 3 usuarios</div>
        <ul>
          <li><span class="ck">✓</span> Todo lo de Cotiza</li>
          <li><span class="ck">✓</span> Post-Venta: pagos, saldos y cobranza</li>
          <li><span class="ck">✓</span> Calendario de eventos</li>
          <li><span class="ck">✓</span> Clientes 360° y múltiples contactos</li>
          <li><span class="ck">✓</span> Eventos de varios días</li>
          <li><span class="ck">✓</span> Panel comercial + de caja</li>
        </ul>
        <a class="btn btn-primary" href="/register">Empezar gratis</a>
      </div>
      <div class="plan teal reveal">
        <div class="pname">Opera y Crece</div>
        <div class="who">Para la operación que quiere márgenes y controlar todo.</div>
        <div class="amt">$120<span> USD/mes</span></div>
        <div class="limits">Todo ilimitado · equipo completo</div>
        <ul>
          <li><span class="ck">✓</span> Todo lo de Gestiona y Cobra</li>
          <li><span class="ck">✓</span> Logística: compras, insumos, mobiliario</li>
          <li><span class="ck">✓</span> Recetas, costos y ficha de cocina</li>
          <li><span class="ck">✓</span> Márgenes por evento y por mes</li>
          <li><span class="ck">✓</span> Análisis de proveedores y clientes</li>
          <li><span class="ck">✓</span> Correos automáticos y encuestas</li>
        </ul>
        <a class="btn btn-teal" href="/register">Empezar gratis</a>
      </div>
    </div>
    <p style="text-align:center;color:var(--muted);font-size:13px;margin-top:24px">
      El panel de control está en todos los planes — se completa a medida que subes: más datos, más visión.</p>
  </div>
</section>

<!-- ORIGIN -->
<section class="section origin">
  <div class="wrap origin-in">
    <div class="reveal">
      <span class="eyebrow">Por qué Eventia es distinto</span>
      <p class="quote" style="margin-top:14px">Eventia no nació en una oficina de software.
        Nació en una <span class="hl">banquetería real</span> que lo usa cada día.</p>
    </div>
    <div class="reveal">
      <p style="color:#334a63;font-size:16px">Cada función existe porque resolvió un problema de verdad en un evento de verdad — no en una pizarra. Por eso encaja con cómo trabajas: el flujo, los tiempos, las palabras que ya usas.</p>
      <div class="stat3">
        <div><div class="num teal">2×</div><div class="cap">más ventas, con la mitad del esfuerzo</div></div>
        <div><div class="num">1</div><div class="cap">lugar para todo el evento</div></div>
        <div><div class="num">0</div><div class="cap">planillas de Excel</div></div>
      </div>
    </div>
  </div>
</section>

<!-- FINAL -->
<section class="section">
  <div class="wrap">
    <div class="final reveal">
      <h2>Vende el doble con la mitad del esfuerzo</h2>
      <p>Prueba Eventia gratis por 7 días y siente la diferencia en tu próximo evento.</p>
      <div class="cta">
        <a class="btn btn-teal" href="/register">Empezar gratis</a>
        <a class="btn" style="background:rgba(255,255,255,.16);color:#fff" href="mailto:felipe@eventi-app.com?subject=Quiero%20una%20demo%20de%20Eventia">Agendar una demo</a>
      </div>
      <small>Sin tarjeta · Listo en 10 minutos</small>
    </div>
  </div>
</section>

<footer>
  <div class="wrap foot-in">
    <div class="logo" style="font-size:17px"><span class="mark">
      <svg width="28" height="28" viewBox="0 0 64 64" fill="none" aria-label="Eventia">
        <path d="M8 11 H41 L32 21 H8 Z" fill="#1597E5"/>
        <path d="M8 25 H35 L26 35 H8 Z" fill="#1597E5"/>
        <path d="M11 41 L22 53 L49 24" stroke="#0B1F33" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>Eventia</div>
    <div>© 2026 Eventia · Orden inteligente para cada evento.</div>
  </div>
</footer>`;

export default function LandingPage() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    root.querySelectorAll<HTMLElement>(".reveal").forEach((el, i) => {
      el.style.transitionDelay = ((i % 4) * 0.07).toString() + "s";
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />;
}
