import { useEffect, useRef } from "react";

// Landing pública de Eventia (rediseño 27-07 — screenshots reales, FAQ, WhatsApp).
// Botones -> flujos reales: "Prueba gratis" -> /register, "Acceder" -> /login.
// Imágenes: copiar la carpeta images/landing/ a frontend/public/images/landing/

const WA_URL =
  "https://api.whatsapp.com/send/?phone=%2B56940589151&text=Hola,%20quiero%20hablar%20con%20ventas&type=phone_number&app_absent=0";

const LANDING_HTML = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap');
  :root{
    --azure:#1597E5;--azure-deep:#0f7ac2;--navy:#0B1F33;--celeste:#EAF6FF;
    --teal:#24C6C8;--teal-deep:#159fa1;--gris:#F4F7FA;--ink:#12263f;
    --muted:#5b6b82;--line:#e4ebf3;--ok:#10b981;--radius:18px;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{font-family:"Inter",ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--ink);background:#fff;line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  h1,h2,h3,.display{font-family:"Sora","Inter",sans-serif}
  .wrap{max-width:1140px;margin:0 auto;padding:0 24px}
  .btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;border-radius:12px;
    padding:13px 22px;font-size:15px;cursor:pointer;transition:.18s;border:1px solid transparent}
  .btn-primary{background:var(--azure);color:#fff}
  .btn-primary:hover{background:var(--azure-deep);transform:translateY(-2px);box-shadow:0 12px 26px rgba(21,151,229,.32)}
  .btn-teal{background:var(--teal);color:#04302f}
  .btn-teal:hover{background:var(--teal-deep);color:#fff;transform:translateY(-2px);box-shadow:0 12px 26px rgba(36,198,200,.4)}
  .btn-ghost{background:#fff;color:var(--azure);border-color:var(--line)}
  .btn-ghost:hover{background:var(--celeste);transform:translateY(-1px)}
  .btn-dark{background:#fff;color:var(--navy);border-color:var(--line)}
  .btn-dark:hover{background:var(--celeste)}
  .btn-white{background:#fff;color:var(--azure)}.btn-white:hover{transform:translateY(-2px)}
  .eyebrow{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--azure)}
  .section{padding:92px 0}
  h2.title{font-size:36px;line-height:1.12;font-weight:800;letter-spacing:-.025em;color:var(--navy)}
  .sub{color:var(--muted);font-size:17px;max-width:620px;margin-top:14px}
  .reveal{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
  .reveal.in{opacity:1;transform:none}

  /* NAV */
  nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .nav-in{display:flex;align-items:center;justify-content:space-between;height:68px}
  .logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;letter-spacing:-.01em;color:var(--navy);font-family:"Sora",sans-serif}
  .nav-links{display:flex;gap:28px;align-items:center;font-size:15px;color:var(--muted);font-weight:600}
  .nav-links a:hover{color:var(--ink)}
  .nav-cta{display:flex;gap:10px;align-items:center}
  @media(max-width:820px){.nav-links{display:none}}

  /* HERO */
  .hero{background:
      radial-gradient(1200px 520px at 84% -10%, rgba(21,151,229,.16), transparent 58%),
      radial-gradient(680px 340px at 8% 120%, rgba(36,198,200,.14), transparent 60%),
      linear-gradient(180deg,#fff,#f3faff);padding:76px 0 56px}
  .hero-grid{display:grid;grid-template-columns:1.02fr .98fr;gap:52px;align-items:center}
  .hero h1{font-size:52px;line-height:1.06;font-weight:800;letter-spacing:-.03em;color:var(--navy)}
  .hero h1 .hl{color:var(--azure)}
  .hero p.lead{font-size:19px;color:#334a63;margin-top:20px;max-width:520px}
  .hero .cta{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
  .trust{margin-top:22px;display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14px}
  .trust .dot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px rgba(16,185,129,.15)}
  @media(max-width:820px){.hero-grid{grid-template-columns:1fr;gap:36px}.hero h1{font-size:38px}}
  @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  .shotwrap{position:relative}
  .shot{background:#fff;border:1px solid var(--line);border-radius:var(--radius);
    box-shadow:0 34px 70px -34px rgba(11,31,51,.4);overflow:hidden}
  .shot.float{animation:floaty 6s ease-in-out infinite}
  .shot .bar{height:38px;background:var(--navy);display:flex;align-items:center;gap:6px;padding:0 15px}
  .shot .bar i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.4)}
  .shot .bar em{margin-left:10px;color:rgba(255,255,255,.6);font-size:12px;font-weight:600;font-style:normal}
  .shot img{display:block;width:100%;height:auto}
  .badge{position:absolute;right:-14px;bottom:26px;background:var(--navy);color:#fff;border-radius:14px;
    padding:12px 18px;box-shadow:0 18px 40px -18px rgba(11,31,51,.6)}
  .badge .l{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7fd4ff}
  .badge .v{font-family:"Sora",sans-serif;font-size:22px;font-weight:800;color:var(--teal)}
  @media(max-width:560px){.badge{right:6px}}

  /* STATS STRIP */
  .strip{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff}
  .strip-in{display:flex;justify-content:center;gap:16px 56px;flex-wrap:wrap;padding:20px 0}
  .strip-in .st{display:flex;align-items:baseline;gap:8px}
  .strip-in .n{font-family:"Sora",sans-serif;font-size:22px;font-weight:800;color:var(--azure)}
  .strip-in .n.teal{color:var(--teal-deep)}
  .strip-in .c{font-size:14px;font-weight:600;color:var(--navy)}

  /* PAIN */
  .pain{background:
      radial-gradient(760px 320px at 12% -5%, rgba(239,68,68,.12), transparent 55%),
      radial-gradient(640px 320px at 100% 120%, rgba(21,151,229,.22), transparent 60%),
      var(--navy);color:#dbe7f5}
  .pain h2{color:#fff}
  .pain-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:38px}
  .pcard{background:linear-gradient(180deg,#12294a,#0f2240);border:1px solid #244066;border-radius:16px;padding:24px;transition:.22s}
  .pcard:hover{transform:translateY(-6px);box-shadow:0 22px 44px -22px rgba(0,0,0,.55)}
  .pic{width:44px;height:44px;border-radius:12px;background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.35);
    display:grid;place-items:center;color:#fca5a5}
  .pcard h4{color:#fff;font-size:16px;font-weight:800;margin:15px 0 7px}
  .pcard p{font-size:13.5px;color:#aebfdb}
  .pcard .solve{margin-top:14px;display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#5eead4;font-weight:600;
    border-top:1px solid #244066;padding-top:12px}
  .pcard .solve svg{flex-shrink:0;margin-top:1px}
  @media(max-width:900px){.pain-grid{grid-template-columns:1fr 1fr}}
  @media(max-width:540px){.pain-grid{grid-template-columns:1fr}}

  /* PRODUCT SPLITS */
  .prod{display:flex;flex-direction:column;gap:88px}
  .split{display:grid;grid-template-columns:1fr 1fr;gap:52px;align-items:center}
  .split h3{font-size:27px;font-weight:800;letter-spacing:-.02em;color:var(--navy);margin-top:10px}
  .split ul{list-style:none;margin-top:20px;display:flex;flex-direction:column;gap:13px}
  .split li{display:flex;gap:12px;font-size:15px;color:#334a63}
  .split li svg{flex-shrink:0;margin-top:2px}
  @media(max-width:820px){.split{grid-template-columns:1fr;gap:32px}.split.rev .shot{order:-1}}

  /* FEATURES GRID */
  .feat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:32px}
  .feat{border:1px solid var(--line);border-radius:15px;padding:22px;transition:.2s;background:#fff}
  .feat:hover{border-color:#bfe0f6;background:#fbfdff;transform:translateY(-4px);box-shadow:0 18px 40px -30px rgba(11,31,51,.5)}
  .feat .ic{width:44px;height:44px;border-radius:12px;background:var(--celeste);color:var(--azure);display:grid;place-items:center}
  .feat h4{font-size:15.5px;font-weight:800;margin:14px 0 6px;color:var(--navy)}
  .feat p{font-size:13.5px;color:var(--muted)}
  @media(max-width:900px){.feat-grid{grid-template-columns:1fr 1fr}}
  @media(max-width:540px){.feat-grid{grid-template-columns:1fr}}

  /* CASO */
  .origin{background:var(--celeste)}
  .origin-in{display:grid;grid-template-columns:.9fr 1.1fr;gap:44px;align-items:center}
  .quote{font-size:27px;font-weight:800;line-height:1.3;letter-spacing:-.015em;color:var(--navy);font-family:"Sora",sans-serif;margin-top:14px}
  .quote .hl{color:var(--azure)}
  .stat3{margin-top:26px;display:flex;gap:34px;flex-wrap:wrap}
  .stat3 .num{font-family:"Sora",sans-serif;font-size:34px;font-weight:800;color:var(--azure)}
  .stat3 .num.teal{color:var(--teal-deep)}
  .stat3 .cap{color:var(--muted);font-size:14px;max-width:150px}
  .testi{background:#fff;border:1px solid #d6e8fb;border-radius:20px;padding:40px 44px;position:relative}
  .testi .qm{position:absolute;top:16px;left:26px;font-size:72px;line-height:1;color:#bfdcf7;font-weight:800;font-family:Georgia,serif}
  .tq{font-size:22px;line-height:1.45;font-weight:600;color:var(--navy);letter-spacing:-.01em;position:relative}
  .tauthor{display:flex;align-items:center;gap:14px;margin-top:26px}
  .tav{width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0}
  .tn{font-weight:800;color:var(--navy)}
  .tr{font-size:13px;color:var(--muted)}
  @media(max-width:820px){.origin-in{grid-template-columns:1fr}}
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
  .plan .amt{font-family:"Sora",sans-serif;font-size:44px;font-weight:800;letter-spacing:-.025em;margin-top:12px;color:var(--navy)}
  .plan .amt span{font-family:"Inter",sans-serif;font-size:15px;font-weight:600;color:var(--muted)}
  .plan .limits{font-size:13px;color:var(--muted);margin-top:6px;padding-bottom:16px;border-bottom:1px solid var(--line)}
  .plan ul{list-style:none;margin:18px 0 24px;display:flex;flex-direction:column;gap:11px}
  .plan li{display:flex;gap:10px;font-size:14px;color:#334a63}
  .plan li .ck{color:var(--ok);flex-shrink:0}
  .plan .btn{width:100%;justify-content:center}
  @media(max-width:820px){.price-grid{grid-template-columns:1fr}}

  /* FAQ */
  .faq-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:44px}
  .faq{border:1px solid var(--line);border-radius:15px;padding:24px;background:#fff}
  .faq h4{font-size:16px;font-weight:800;color:var(--navy);margin-bottom:8px;font-family:"Inter",sans-serif}
  .faq p{font-size:14px;color:var(--muted)}
  @media(max-width:640px){.faq-grid{grid-template-columns:1fr}}

  /* FINAL */
  .final{background:linear-gradient(120deg,var(--navy),var(--azure));color:#fff;text-align:center;border-radius:26px;padding:64px 24px;position:relative;overflow:hidden}
  .final:after{content:"";position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(36,198,200,.4),transparent 70%);top:-120px;right:-70px}
  .final h2{font-size:36px;font-weight:800;letter-spacing:-.025em;position:relative;color:#fff}
  .final p{color:#d3e6f7;margin-top:12px;font-size:17px;position:relative}
  .final .cta{margin-top:26px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative}
  .final small{display:block;margin-top:16px;color:#bcd6ec;font-size:13px;position:relative}

  footer{border-top:1px solid var(--line);padding:38px 0;color:var(--muted);font-size:14px}
  .foot-in{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px}

  @media(max-width:560px){
    .nav-in{height:60px}
    .logo{font-size:17px;gap:8px}
    .logo svg{width:30px;height:30px}
    .nav-cta{gap:8px}
    .nav-cta .btn{padding:9px 14px;font-size:13px;white-space:nowrap}
    .hero{padding:52px 0 30px}
    .hero h1{font-size:33px}
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
      <a href="#funciones">Funciones</a><a href="#caso">Caso real</a><a href="#precios">Precios</a><a href="#faq">Preguntas</a>
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
      <span class="eyebrow">Gestión de eventos, sin planillas</span>
      <h1 style="margin-top:14px">Vende el doble con<br><span class="hl">la mitad del esfuerzo</span></h1>
      <p class="lead">Eventia cotiza, gestiona y cobra tus eventos en un solo lugar. Y te muestra el margen de cada evento <strong>antes</strong> de confirmarlo.</p>
      <div class="cta">
        <a class="btn btn-primary" href="/register">Empieza gratis — 7 días
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
        <a class="btn btn-dark" href="WA_URL_PLACEHOLDER" target="_blank" rel="noopener">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.9 1.5 2 2.4 1.4 1.2 2.5 1.6 2.9 1.7.3.2.5.1.7-.1l1-1.1c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4.1.2.1.7-.2 1.3Z"/></svg>
          Hablemos por WhatsApp</a>
      </div>
      <div class="trust"><span class="dot"></span>Nació dentro de una banquetería real en Chile. Sin tarjeta para probar.</div>
    </div>
    <div class="shotwrap">
      <div class="shot float">
        <div class="bar"><i></i><i></i><i></i><em>app.eventi-app.com — Panel</em></div>
        <img src="/images/landing/dashboard-nuevo.png" alt="Dashboard real de Eventia">
      </div>
      <div class="badge"><div class="l">Margen del período</div><div class="v">94,3% de la venta ✓</div></div>
    </div>
  </div>
</header>

<!-- STATS STRIP -->
<div class="strip">
  <div class="wrap strip-in">
    <span class="st"><span class="n">5 min</span><span class="c">por cotización, con PDF</span></span>
    <span class="st"><span class="n">0</span><span class="c">planillas para operar</span></span>
    <span class="st"><span class="n teal">100%</span><span class="c">de los saldos visibles, hoy</span></span>
  </div>
</div>

<!-- PAIN -->
<section class="section pain">
  <div class="wrap">
    <span class="eyebrow reveal" style="color:#7fd4ff">¿Te suena?</span>
    <h2 class="title reveal" style="margin-top:12px">El caos que Eventia elimina</h2>
    <div class="pain-grid">
      <div class="pcard reveal">
        <div class="pic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M9 13h6M9 17h4"/></svg></div>
        <h4>Cotizaciones en Word</h4>
        <p>Que se pierden, se repiten y nunca sabes cuál era la última.</p>
        <div class="solve"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24C6C8" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg> Una sola cotización viva, siempre la última.</div>
      </div>
      <div class="pcard reveal">
        <div class="pic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></div>
        <h4>¿Quién me debe?</h4>
        <p>Pagos sueltos en cuadernos y WhatsApp, saldos que no cuadran.</p>
        <div class="solve"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24C6C8" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg> Semáforo de cobranza: quién te debe, hoy.</div>
      </div>
      <div class="pcard reveal">
        <div class="pic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg></div>
        <h4>Compras a ojo</h4>
        <p>Compras de más o de menos, sin saber el costo real del evento.</p>
        <div class="solve"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24C6C8" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg> Compras exactas, calculadas desde la receta.</div>
      </div>
      <div class="pcard reveal">
        <div class="pic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg></div>
        <h4>Márgenes tarde</h4>
        <p>Descubres si ganaste cuando el evento ya pasó. Sin control.</p>
        <div class="solve"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24C6C8" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg> El margen, antes de confirmar el evento.</div>
      </div>
    </div>
  </div>
</section>

<!-- PRODUCTO REAL -->
<section class="section" id="funciones">
  <div class="wrap prod">
    <div style="text-align:center">
      <span class="eyebrow reveal">El producto real</span>
      <h2 class="title reveal" style="margin-top:12px">Así se ve por dentro</h2>
      <p class="sub reveal" style="margin:14px auto 0">Sin mockups: pantallas reales de Eventia funcionando hoy.</p>
    </div>
    <div class="split">
      <div class="shot reveal"><img src="/images/landing/cotizacion-nueva.png" alt="Cotizador de Eventia con resumen, IVA y margen en vivo"></div>
      <div class="reveal">
        <span class="eyebrow">1 · Cotiza</span>
        <h3>Cotizaciones profesionales en minutos</h3>
        <ul>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Con tu marca, tu carta y PDF listo para el cliente.</li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Enlace público: tus clientes piden solos por WhatsApp.</li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Estados claros: enviada, aceptada, enfriándose.</li>
        </ul>
      </div>
    </div>
    <div class="split rev">
      <div class="reveal">
        <span class="eyebrow" style="color:var(--teal-deep)">2 · Cobra</span>
        <h3>Deja de perseguir clientes</h3>
        <ul>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Cuotas, saldos y comprobantes por evento.</li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Semáforo de vencidos: el sistema te dice a quién llamar hoy.</li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Flujo de caja del mes, sin abrir una planilla.</li>
        </ul>
      </div>
      <div class="shot reveal"><img src="/images/landing/pagos-evento.png" alt="Calendario de pagos por evento en Eventia"></div>
    </div>
    <div class="split">
      <div class="shot reveal"><img src="/images/landing/analisis-comercial.png" alt="Análisis comercial de Eventia: conversión e ingresos por tipo de evento y cliente"></div>
      <div class="reveal">
        <span class="eyebrow">3 · Controla</span>
        <h3>Sabe cuánto ganas antes de confirmar</h3>
        <ul>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Margen por evento, calculado desde recetas y compras reales.</li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Ventas, caja y conversión por mes, en tiempo real.</li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> En qué proveedor gastas más y dónde comprar mejor.</li>
        </ul>
      </div>
    </div>
    <div class="reveal">
      <h3 class="display" style="font-size:24px;font-weight:800;letter-spacing:-.02em;color:var(--navy);text-align:center">Y toda la operación incluida</h3>
      <div class="feat-grid">
        <div class="feat"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div><h4>Calendario de eventos</h4><p>Tu agenda visual, con eventos de varios días.</p></div>
        <div class="feat"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg></div><h4>Clientes 360°</h4><p>Historial, múltiples contactos y segmentos comerciales.</p></div>
        <div class="feat"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg></div><h4>Ficha de cocina</h4><p>Recetas calculadas, retiro de bodega y checklist imprimible.</p></div>
        <div class="feat"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg></div><h4>Compras y proveedores</h4><p>Consolida insumos por proveedor y genera órdenes en PDF.</p></div>
        <div class="feat"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v12H5.17L4 17.17V4Z"/><path d="M8 9h8M8 12h5"/></svg></div><h4>Enlace público</h4><p>Tus clientes piden cotización solos desde un link.</p></div>
        <div class="feat"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg></div><h4>Cotizador con tu marca</h4><p>Categorías, menús guardados, niños y adultos, PDF profesional.</p></div>
        <div class="feat"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></div><h4>Pagos y cobranza</h4><p>Cuotas, saldos, comprobantes y semáforo de vencidos.</p></div>
        <div class="feat"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg></div><h4>Encuestas y correos</h4><p>Encuestas post-evento y correos automáticos a clientes.</p></div>
      </div>
    </div>
  </div>
</section>

<!-- CASO REAL -->
<section class="section origin" id="caso">
  <div class="wrap origin-in">
    <div class="reveal">
      <span class="eyebrow">Caso real de origen</span>
      <p class="quote">Eventia no nació en una oficina de software. <span class="hl">Nació dentro de una banquetería</span> que vivía este caos todos los días.</p>
      <div class="stat3">
        <div><div class="num">2×</div><div class="cap">más ventas con el mismo equipo</div></div>
        <div><div class="num teal">317</div><div class="cap">cotizaciones gestionadas en un año</div></div>
        <div><div class="num">0</div><div class="cap">planillas en la operación</div></div>
      </div>
    </div>
    <div class="testi reveal">
      <span class="qm">&ldquo;</span>
      <p class="tq">Dejé las planillas para siempre y por fin sé cuánto gano en cada evento — antes de confirmarlo.</p>
      <div class="tauthor">
        <img class="tav" src="/images/landing/felipe.jpg" alt="Felipe Vargas">
        <div>
          <div class="tn">Felipe Vargas</div>
          <div class="tr">Complejo Turístico Valle del Sol · Quillón — primer cliente y cofundador</div>
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
        <div class="who">Para dejar el Excel y vender profesional.</div>
        <div class="amt">$20<span> USD/mes</span></div>
        <div class="limits">Hasta 20 cotizaciones/mes · 1 usuario</div>
        <ul>
          <li><span class="ck">✓</span> Cotizador con tu marca y PDF</li>
          <li><span class="ck">✓</span> Catálogo de servicios y precios</li>
          <li><span class="ck">✓</span> Enlace público de cotización</li>
          <li><span class="ck">✓</span> Panel comercial</li>
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
          <li><span class="ck">✓</span> Pagos, saldos y semáforo de cobranza</li>
          <li><span class="ck">✓</span> Calendario de eventos</li>
          <li><span class="ck">✓</span> Clientes 360° y múltiples contactos</li>
          <li><span class="ck">✓</span> Panel comercial + de caja</li>
        </ul>
        <a class="btn btn-primary" href="/register">Empezar gratis</a>
      </div>
      <div class="plan teal reveal">
        <div class="pname">Opera y Crece</div>
        <div class="who">Para la operación que quiere márgenes y controlarlo todo.</div>
        <div class="amt">$120<span> USD/mes</span></div>
        <div class="limits">Todo ilimitado · equipo completo</div>
        <ul>
          <li><span class="ck">✓</span> Todo lo de Gestiona y Cobra</li>
          <li><span class="ck">✓</span> Logística: compras, insumos, mobiliario</li>
          <li><span class="ck">✓</span> Recetas, costos y ficha de cocina</li>
          <li><span class="ck">✓</span> Márgenes por evento y por mes</li>
          <li><span class="ck">✓</span> Correos automáticos y encuestas</li>
        </ul>
        <a class="btn btn-teal" href="/register">Empezar gratis</a>
      </div>
    </div>
    <p style="text-align:center;color:var(--muted);font-size:13px;margin-top:24px">¿Prefieres facturar en CLP? <a href="WA_URL_PLACEHOLDER" target="_blank" rel="noopener" style="color:var(--azure)">Escríbenos por WhatsApp</a>.</p>
  </div>
</section>

<!-- FAQ -->
<section class="section" id="faq">
  <div class="wrap" style="max-width:900px">
    <div style="text-align:center">
      <span class="eyebrow reveal">Antes de partir</span>
      <h2 class="title reveal" style="margin-top:12px">Preguntas frecuentes</h2>
    </div>
    <div class="faq-grid">
      <div class="faq reveal"><h4>¿Necesito instalar algo?</h4><p>No. Eventia funciona en el navegador, también desde el celular. Entras con tu correo y listo.</p></div>
      <div class="faq reveal"><h4>¿Mis datos están seguros?</h4><p>Sí. Respaldo automático diario en la nube. Tus cotizaciones, clientes y pagos nunca dependen de un computador.</p></div>
      <div class="faq reveal"><h4>¿Me ayudan a partir?</h4><p>Te acompañamos a cargar tu carta, servicios y precios. En el plan profesional el onboarding va incluido.</p></div>
      <div class="faq reveal"><h4>¿Puedo cancelar cuando quiera?</h4><p>Sí. Sin contrato de permanencia. Y puedes exportar tus datos antes de irte.</p></div>
      <div class="faq reveal"><h4>¿Sirve si trabajo solo?</h4><p>Sí. El plan Cotiza está pensado para una persona: cotizas profesional desde el día uno y creces cuando lo necesites.</p></div>
      <div class="faq reveal"><h4>¿Qué pasa al terminar los 7 días?</h4><p>Eliges un plan o tu cuenta queda pausada. No te cobramos nada automáticamente: nunca pedimos tarjeta para probar.</p></div>
    </div>
  </div>
</section>

<!-- FINAL CTA -->
<section style="padding:0 24px 92px">
  <div class="wrap final">
    <h2>Tu próximo evento, sin caos</h2>
    <p>Prueba Eventia gratis por 7 días y siente la diferencia.</p>
    <div class="cta">
      <a class="btn btn-white" href="/register">Empieza gratis</a>
      <a class="btn btn-teal" href="WA_URL_PLACEHOLDER" target="_blank" rel="noopener">Hablar por WhatsApp</a>
    </div>
    <small>Sin tarjeta · Cancela cuando quieras</small>
  </div>
</section>

<footer>
  <div class="wrap foot-in">
    <div style="display:flex;align-items:center;gap:8px;font-weight:800;color:var(--navy)"><svg width="22" height="22" viewBox="0 0 64 64" fill="none"><path d="M8 11 H41 L32 21 H8 Z" fill="#1597E5"/><path d="M8 25 H35 L26 35 H8 Z" fill="#1597E5"/><path d="M11 41 L22 53 L49 24" stroke="#0B1F33" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg> Eventia</div>
    <div>© 2026 Eventia. Todos los derechos reservados.</div>
    <div style="display:flex;gap:20px"><a href="#precios">Precios</a><a href="/login">Acceder</a></div>
  </div>
</footer>`;

export default function LandingPage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      dangerouslySetInnerHTML={{
        __html: LANDING_HTML.split("WA_URL_PLACEHOLDER").join(WA_URL),
      }}
    />
  );
}
