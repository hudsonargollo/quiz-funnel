/* ============================================
   QUIZ FUNNEL — MAIN SPA ENGINE
   Screen renderer + state machine + UI logic
   ============================================ */

(function() {
  'use strict';

  // ── State ────────────────────────────────────
  let currentIndex = 0;
  let isAnimating = false;
  // Preview mode (visual builder iframe): render screens on demand, no tracking.
  const PREVIEW = (window.FUNNEL && window.FUNNEL.preview) ||
    new URLSearchParams(location.search).has('preview');
  const QUIZ_SCREENS = window.SCREENS || [];
  const session = PREVIEW ? null : window.CRM.init();

  // ── DOM refs ─────────────────────────────────
  const app       = document.getElementById('app');
  const progWrap  = document.getElementById('progress-wrap');
  const progFill  = document.getElementById('progress-fill');
  const progLabel = document.getElementById('progress-label');
  const progBack  = document.getElementById('progress-back');
  const footer    = document.getElementById('footer');

  // ── Track start ─────────────────────────────
  if (!PREVIEW) {
    CRM.track('quiz_started');
    CRM.setState('quiz_started');
  }

  // ── Quiz question count (for progress) ───────
  const questionScreens = QUIZ_SCREENS.filter(s =>
    ['single','multi','slider','text','grid'].includes(s.type)
  );
  const totalQuestions = questionScreens.length;

  // ── RENDER ───────────────────────────────────
  function render(index, direction = 'forward') {
    if (isAnimating) return;
    const screen = QUIZ_SCREENS[index];
    if (!screen) return;

    isAnimating = true;
    currentIndex = index;

    // Update progress bar
    updateProgress(screen);

    // Build screen HTML
    const html = buildScreen(screen);

    // Animate out / in
    const prev = app.querySelector('.screen');
    if (prev) {
      prev.style.animation = direction === 'forward'
        ? 'screenOut 0.22s ease forwards'
        : 'screenInReverse 0.22s ease forwards';
      prev.addEventListener('animationend', () => {
        prev.remove();
        insertScreen(html, screen, direction);
        isAnimating = false;
      }, { once: true });
    } else {
      insertScreen(html, screen, direction);
      isAnimating = false;
    }
  }

  function insertScreen(html, screen, direction) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const el = div.firstElementChild;
    el.style.animationDirection = direction === 'backward' ? 'reverse' : 'normal';
    app.appendChild(el);
    bindScreen(screen);

    // Special cases
    if (screen.type === 'loading') {
      runLoadingSequence(screen);
    }
    if (screen.type === 'imc') {
      renderIMC();
    }
    if (screen.type === 'profile') {
      renderProfile();
    }
    if (screen.type === 'offer') {
      renderOffer();
      footer.classList.add('hidden');
    }

    // Upgrade emoji-free Lucide icon placeholders to SVGs
    refreshIcons();
  }

  // ── PROGRESS ─────────────────────────────────
  function updateProgress(screen) {
    const noProgress = totalQuestions === 0 ||
      ['landing', 'loading', 'offer', 'success', 'video'].includes(screen.type);

    if (noProgress) {
      progWrap.classList.add('hidden');
      footer.classList.remove('hidden');
      return;
    }

    progWrap.classList.remove('hidden');
    footer.classList.remove('hidden');

    // Count question index
    const qIndex = questionScreens.indexOf(screen);
    if (qIndex >= 0) {
      const pct = Math.round((qIndex / totalQuestions) * 100);
      progFill.style.width = pct + '%';
      progLabel.textContent = (qIndex + 1) + ' / ' + totalQuestions;
    }
  }

  // ── BUILD SCREEN HTML ─────────────────────────
  function buildScreen(screen) {
    switch(screen.type) {
      case 'landing': return buildLanding(screen);
      case 'single':  return buildSingle(screen);
      case 'multi':   return buildMulti(screen);
      case 'slider':  return buildSlider(screen);
      case 'text':    return buildText(screen);
      case 'bridge':  return buildBridge(screen);
      case 'grid':    return buildGrid(screen);
      case 'video':   return buildVideo(screen);
      case 'loading': return buildLoading(screen);
      case 'profile': return buildProfileScreen(screen);
      case 'imc':     return buildIMCScreen(screen);
      case 'offer':   return buildOffer();
      default:        return '<div class="screen"></div>';
    }
  }

  // ── ICONS (Lucide) ───────────────────────────
  // Returns a placeholder that lucide.createIcons() upgrades to an inline SVG.
  function icon(name, cls) {
    return `<i data-lucide="${name || 'circle'}"${cls ? ` class="${cls}"` : ''}></i>`;
  }
  // Upgrade all <i data-lucide> placeholders in the document to SVGs.
  function refreshIcons() {
    if (window.lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }

  // ── FORMAT QUESTION with {accent} wrapping ───
  function fmt(text) {
    return text.replace(/\{([^}]+)\}/g,
      '<span class="accent">$1</span>');
  }
  function fmtRed(text) {
    return text
      .replace(/\{([^}]+)\}/g, (m, p1) =>
        p1 === p1.toUpperCase() && p1 !== p1.toLowerCase()
          ? `<span class="accent-red">${p1}</span>`
          : `<span class="accent">${p1}</span>`
      );
  }

  // Initials avatar for testimonials: these are real customers who submitted
  // before/after photos with faces intentionally cropped out, so we render an
  // initials badge instead of a face — never fabricate a photo for a named
  // real person. Color is deterministic per name (same person, same color).
  const AVATAR_PALETTE = ['av-c1', 'av-c2', 'av-c3', 'av-c4'];
  function avatarInitials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const cls = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
    return `<div class="testimonial-avatar ${cls}">${initials.toUpperCase()}</div>`;
  }

  // ─────────────────────────────────────────────
  // LANDING
  // ─────────────────────────────────────────────
  function buildLanding(s) {
    // Optional blocks — render only when the screen defines them, so templates
    // without an image/alert don't emit literal "undefined".
    const imageBlock = (s.image || s.imagePlaceholder) ? `
      <div class="landing-image-wrap">
        ${s.image ? `<img src="${s.image}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
        <div class="landing-image-placeholder" style="display:${s.image ? 'none' : 'flex'}">${s.imagePlaceholder || ''}</div>
      </div>` : '';
    const alertBlock = (s.alertTitle || s.alertBody) ? `
      <div class="alert-box">
        ${s.alertTitle ? `<p class="alert-title">${icon('alert-triangle')} ${s.alertTitle}</p>` : ''}
        ${s.alertBody ? `<p>${s.alertBody}</p>` : ''}
      </div>` : '';
    return `
    <div class="screen landing">
      ${s.eyebrow !== '' ? `<p class="landing-eyebrow">${s.eyebrow || 'Avaliação gratuita'}</p>` : ''}
      <h1 class="landing-headline">
        ${s.headline || ''}${s.headlineAccent ? `<br><span class="accent">${s.headlineAccent}</span>` : ''}
      </h1>
      ${s.sub ? `<p class="landing-sub">${s.sub}</p>` : ''}
      ${imageBlock}
      ${alertBlock}
      <div class="btn-wrap">
        <button class="btn" data-action="next">${s.cta || 'Continue'}</button>
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // SINGLE SELECT
  // ─────────────────────────────────────────────
  function buildSingle(s) {
    const opts = s.options.map(o => `
      <div class="option-item" data-value="${o.value}" role="button" tabindex="0">
        <div class="option-icon-wrap">
          <span class="opt-ic">${icon(o.icon)}</span>
          ${o.img ? `<img src="${o.img}" alt="" onerror="this.remove()">` : ''}
        </div>
        <span class="option-text">${o.label}</span>
        <div class="option-arrow">›</div>
      </div>`).join('');

    const infoNote = s.infoNote ? `
      <div class="privacy-note" style="margin-top:-8px">
        <span class="privacy-note-icon">${icon('lightbulb')}</span>
        <p>${s.infoNote}</p>
      </div>` : '';

    return `
    <div class="screen question-screen with-progress">
      <h2 class="question-title">${fmt(s.question)}</h2>
      ${s.sub ? `<p class="question-sub">${s.sub}</p>` : ''}
      <div class="options-list" data-type="single" data-key="${s.key}">
        ${opts}
      </div>
      ${infoNote}
    </div>`;
  }

  // ─────────────────────────────────────────────
  // MULTI SELECT
  // ─────────────────────────────────────────────
  function buildMulti(s) {
    const opts = s.options.map(o => `
      <div class="option-item" data-value="${o.value}" role="button" tabindex="0">
        <div class="option-icon-wrap">
          <span class="opt-ic">${icon(o.icon)}</span>
          ${o.img ? `<img src="${o.img}" alt="" onerror="this.remove()">` : ''}
        </div>
        <span class="option-text">${o.label}</span>
        <div class="option-check"></div>
      </div>`).join('');

    return `
    <div class="screen question-screen with-progress">
      <h2 class="question-title">${fmt(s.question)}</h2>
      ${s.sub ? `<p class="question-sub">${s.sub}</p>` : ''}
      <div class="options-list" data-type="multi" data-key="${s.key}">
        ${opts}
      </div>
      <div class="btn-wrap">
        <button class="btn btn-disabled" data-action="next">Continuar</button>
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // SLIDER
  // ─────────────────────────────────────────────
  function buildSlider(s) {
    const defVal = s.default;
    const unit = s.unit;
    const infoBox = (s.infoTitle || s.infoBody) ? `
      <div class="slider-info-box">
        <p class="slider-info-title">${s.infoTitle || ''}</p>
        <p class="slider-info-body">${s.infoBody || ''}</p>
      </div>` : '';

    return `
    <div class="screen question-screen slider-screen with-progress" data-slider-key="${s.key}" data-slider-unit="${unit}" data-slider-unit-alt="${s.unitAlt || ''}">
      <h2 class="question-title">${fmt(s.question)}</h2>
      ${s.sub ? `<p class="question-sub">${s.sub}</p>` : ''}

      <div class="unit-toggle">
        <button class="unit-btn active" data-unit="primary">${unit}</button>
        <button class="unit-btn" data-unit="alt">${s.unitAlt || ''}</button>
      </div>

      <div class="slider-display">
        <span id="slider-val">${defVal}</span><span class="unit" id="slider-unit">${unit}</span>
      </div>

      <div class="slider-track-wrap">
        <div class="slider-ruler" id="slider-ruler" tabindex="0" role="slider"
          aria-valuemin="${s.min}" aria-valuemax="${s.max}" aria-valuenow="${defVal}" aria-valuetext="${defVal} ${unit}"
          data-min="${s.min}" data-max="${s.max}" data-step="${s.step}" data-val="${defVal}"
          data-min-alt="${s.minAlt || s.min}" data-max-alt="${s.maxAlt || s.max}"
          data-default-alt="${s.defaultAlt || defVal}" data-conv="${s.conversionFactor || 1}">
          <div class="ruler-ticks" id="ruler-ticks"></div>
          <div class="ruler-line"></div>
          <div class="ruler-needle"></div>
        </div>
        <p class="slider-hint">Arraste ou use as setas do teclado para ajustar</p>
      </div>

      ${infoBox}

      <div class="btn-wrap">
        <button class="btn" data-action="next">Continuar</button>
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // TEXT INPUT
  // ─────────────────────────────────────────────
  function buildText(s) {
    const fields = s.fields.map(f => `
      <div class="text-field">
        <label>${f.label}</label>
        <input type="${f.type}" name="${f.key}" placeholder="${f.placeholder}"
          autocomplete="${f.type === 'email' ? 'email' : 'given-name'}"
          data-required="${f.required}" />
      </div>`).join('');

    return `
    <div class="screen question-screen input-screen with-progress" data-text-key="${s.key}">
      <h2 class="question-title">${fmt(s.question)}</h2>
      ${s.sub ? `<p class="question-sub">${s.sub}</p>` : ''}
      ${fields}
      <div class="btn-wrap">
        <button class="btn" data-action="submit-text">${s.cta}</button>
      </div>
      ${s.privacyNote ? `
        <div class="privacy-note">
          <span class="privacy-note-icon">${icon('lock')}</span>
          <p>${s.privacyNote}</p>
        </div>` : ''}
    </div>`;
  }

  // ─────────────────────────────────────────────
  // BRIDGE
  // ─────────────────────────────────────────────
  function buildBridge(s) {
    const audio = s.hasAudio ? `
      <div class="audio-player" id="audio-play-btn" role="button" tabindex="0">
        <div class="audio-play-btn" id="play-icon">▶</div>
        <div class="audio-info">
          <p class="audio-name">${s.audioName}</p>
          <p class="audio-time">${s.audioDuration}</p>
        </div>
        <div class="audio-wave">
          ${Array(12).fill(0).map((_,i) =>
            `<div class="audio-bar" style="height:${6+Math.random()*14}px;animation-delay:${i*0.08}s"></div>`
          ).join('')}
        </div>
      </div>` : '';

    const socialImg = s.socialProofImage ? `
      <div class="bridge-image">
        <img src="${s.socialProofImage}" alt="Antes e depois"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="landing-image-placeholder" style="display:none;padding:20px;text-align:center">${s.socialProofImagePlaceholder || ''}</div>
      </div>` : '';

    const mainImg = (!s.hasAudio && s.image) ? `
      <div class="bridge-image">
        <img src="${s.image}" alt=""
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="landing-image-placeholder" style="display:none;padding:20px;text-align:center">${s.imagePlaceholder || ''}</div>
      </div>` : '';

    const testimonial = s.testimonial ? `
      <div class="testimonial-card">
        <div class="testimonial-header">
          ${avatarInitials(s.testimonial.name)}
          <div>
            <div class="stars">${icon('star').repeat(5)}</div>
            <p class="testimonial-name">${s.testimonial.name}</p>
            <p class="testimonial-location">${icon('map-pin')} ${s.testimonial.location}</p>
          </div>
        </div>
        <p class="testimonial-body">${s.testimonial.text}</p>
      </div>` : '';

    return `
    <div class="screen bridge-screen with-progress">
      <h2 class="bridge-headline">${fmtRed(s.headline)}</h2>
      ${s.body ? `<p class="bridge-body">${s.body}</p>` : ''}
      ${audio}
      ${mainImg}
      ${socialImg}
      ${testimonial}
      ${s.bodyExtra ? `<p class="bridge-body">${s.bodyExtra}</p>` : ''}
      <div class="btn-wrap">
        <button class="btn" data-action="next">${s.cta}</button>
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // VIDEO / VSL
  // ─────────────────────────────────────────────
  function buildVideo(s) {
    const url = s.videoUrl || '';
    const isEmbed = /youtube|youtu\.be|vimeo|wistia|loom/.test(url);
    const player = url
      ? (isEmbed
          ? `<div class="vsl-frame"><iframe src="${url}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
          : `<div class="vsl-frame"><video src="${url}" controls playsinline></video></div>`)
      : `<div class="vsl-frame vsl-placeholder">${icon('video')}<span>Vídeo</span></div>`;

    const ctaAction = s.ctaAction === 'checkout' ? 'checkout' : 'next';
    return `
    <div class="screen bridge-screen video-screen">
      ${s.headline ? `<h2 class="bridge-headline">${fmtRed(s.headline)}</h2>` : ''}
      ${s.sub ? `<p class="bridge-body">${s.sub}</p>` : ''}
      ${player}
      ${s.body ? `<p class="bridge-body">${s.body}</p>` : ''}
      <div class="btn-wrap">
        <button class="btn ${ctaAction === 'checkout' ? 'btn-success' : ''}" data-action="${ctaAction}"${s.id ? ` id="${ctaAction === 'checkout' ? 'checkout-btn' : ''}"` : ''}>${s.cta || 'Continuar'}</button>
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // GRID SELECT
  // ─────────────────────────────────────────────
  function buildGrid(s) {
    const cards = s.options.map(o => `
      <div class="option-card" data-value="${o.value}" role="button" tabindex="0">
        <img class="option-card-img" src="${o.img}" alt="${o.label}"
          onerror="this.style.background='var(--bg-surface)'">
        <div class="option-card-label">${o.label} ›</div>
      </div>`).join('');

    return `
    <div class="screen question-screen with-progress">
      <h2 class="question-title">${fmt(s.question)}</h2>
      <div class="options-grid" data-type="grid" data-key="${s.key}">
        ${cards}
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────
  function buildLoading(s) {
    const steps = s.steps.map((step, i) => `
      <div class="loading-step" id="lstep-${i}" style="animation-delay:${i * 0.7 + 0.3}s">
        <div class="loading-step-icon" id="lstep-icon-${i}">○</div>
        <span>${step}</span>
      </div>`).join('');

    return `
    <div class="screen loading-screen">
      <div class="loading-spinner"></div>
      <p class="loading-text">${s.headline}</p>
      <div class="loading-steps">${steps}</div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // PROFILE SUMMARY (dynamic)
  // ─────────────────────────────────────────────
  function buildProfileScreen(s) {
    return `
    <div class="screen profile-summary with-progress" id="profile-screen">
      <h2 class="question-title" style="text-align:center">${s.headline}</h2>
      <div class="profile-avatar">${icon('user-round')}</div>
      <div class="profile-data-card" id="profile-data">
        <!-- filled by renderProfile() -->
      </div>
      <div class="btn-wrap">
        <button class="btn" data-action="next">${s.cta}</button>
      </div>
    </div>`;
  }

  function renderProfile() {
    const data = document.getElementById('profile-data');
    if (!data) return;
    const q = CRM.getSession().quizData;
    const nome = CRM.getSession().nome || '';

    const rows = [
      { label: 'Objetivo principal', value: _labelForValue('objetivo', q.objetivo) },
      { label: 'Zona com maior resistência', value: _labelsForMulti('zonas_problematicas', q.zonas_problematicas) },
      { label: 'Peso atual', value: q.peso_atual ? q.peso_atual + ' kg' : '—' },
      { label: 'Peso objetivo', value: q.peso_objetivo ? q.peso_objetivo + ' kg' : '—' },
    ].filter(r => r.value && r.value !== '—');

    data.innerHTML = rows.map(r => `
      <div class="profile-row">
        <span class="profile-row-label">${r.label}</span>
        <span class="profile-row-value">${r.value}</span>
      </div>`).join('');
  }

  // ─────────────────────────────────────────────
  // IMC RESULT (dynamic)
  // ─────────────────────────────────────────────
  function buildIMCScreen(s) {
    return `
    <div class="screen imc-screen with-progress" id="imc-screen">
      <!-- filled by renderIMC() -->
      <div class="loading-spinner"></div>
    </div>`;
  }

  function renderIMC() {
    const container = document.getElementById('imc-screen');
    if (!container) return;

    const imc = CRM.computeIMC();
    if (!imc) { advance(); return; }

    const info = CRM.imcClass(imc);
    const needlePct = CRM.imcNeedlePercent(imc);
    const nome = CRM.getSession().nome || '';

    const imcRows = [
      ['< 18,5', 'Baixo Peso'],
      ['18,5 – 24,9', 'Peso Normal'],
      ['25,0 – 29,9', 'Pré-obesidade'],
      ['30,0 – 34,9', 'Obesidade Grau I'],
      ['35,0 – 39,9', 'Obesidade Grau II'],
      ['> 40,0', 'Obesidade Grau III'],
    ];

    container.innerHTML = `
      <h2 class="question-title" style="font-size:clamp(20px,5vw,28px);text-align:center">
        ${icon('alert-triangle')} Atenção${nome ? ', ' + nome : ''}.
      </h2>
      <p class="bridge-body" style="text-align:center">
        Com base nas suas respostas e no seu IMC,<br>
        o seu corpo apresenta sinais de <span class="accent">tendência para acumulação de gordura.</span>
      </p>

      <div class="imc-alert">
        <p class="imc-alert-title">O seu IMC é:</p>
        <p class="imc-value">${imc}</p>
      </div>

      <!-- IMC gradient bar -->
      <div class="imc-chart">
        <div class="imc-gradient">
          <div class="imc-needle" style="left:${needlePct}%">
            <div class="imc-needle-label">Seu IMC: ${imc}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;padding:0 8px;font-size:11px;color:var(--text-muted)">
          <span>Abaixo do Peso</span><span>Normal</span><span>Acima do Peso</span>
        </div>
      </div>

      <!-- IMC Table -->
      <div class="imc-table">
        <div class="imc-table-head"><span>IMC</span><span>Classificação</span></div>
        ${imcRows.map((r, i) => `
          <div class="imc-table-row${i === info.rowIndex ? ' highlight' : ''}">
            <span>${r[0]}</span><span>${r[1]}</span>
          </div>`).join('')}
      </div>

      <!-- Impact -->
      <div class="imc-impact-box">
        <p class="imc-impact-title">${icon('alert-circle')} O que isto pode significar para si:</p>
        <div class="imc-impact-item">${icon('x-circle')} <span>Maior dificuldade em perder gordura, mesmo com esforço</span></div>
        <div class="imc-impact-item">${icon('x-circle')} <span>Sensação de inchaço e cansaço frequente</span></div>
        <div class="imc-impact-item">${icon('x-circle')} <span>Tendência para acumulação na zona abdominal</span></div>
      </div>

      <!-- Solution -->
      <div class="imc-solution-box">
        <p class="imc-solution-title">Com o Protocolo de Gelatina Barátrica, o seu corpo pode voltar a responder ao emagrecimento.</p>
        <div class="imc-solution-item">${icon('check-circle')} <span>A combinação estratégica de ingredientes ajuda a regular o apetite</span></div>
        <div class="imc-solution-item">${icon('check-circle')} <span>Pode contribuir para reduzir a retenção de líquidos</span></div>
        <div class="imc-solution-item">${icon('check-circle')} <span>Apoia o equilíbrio metabólico ao longo do dia</span></div>
      </div>

      <div class="btn-wrap">
        <button class="btn" data-action="next">Continuar</button>
      </div>
    `;

    // Re-bind events on dynamic content
    bindScreen({ type: 'imc', cta: 'Continuar' });
  }

  // ─────────────────────────────────────────────
  // OFFER / SALES PAGE
  // ─────────────────────────────────────────────
  function buildOffer() {
    return `
    <div class="screen offer-screen" id="offer-screen">
      <!-- filled by renderOffer() -->
    </div>`;
  }

  function renderOffer() {
    const el = document.getElementById('offer-screen');
    if (!el) return;
    const nome = CRM.getSession().nome || '';
    const cfg = window.QUIZ_CONFIG;

    el.innerHTML = `
      <!-- HERO -->
      <div class="offer-hero">
        <p class="offer-hero-eyebrow">O seu protocolo personalizado está pronto</p>
        <h1 class="offer-hero-headline">
          ${nome ? nome + ',<br>' : ''}<span class="accent">Chegou a sua hora.</span>
        </h1>
        <p class="offer-hero-sub">O método que está a transformar milhares de mulheres — agora adaptado ao seu perfil.</p>
        <div class="before-after">
          <div class="before-after-item">
            <img src="/images/before-offer.jpg" alt="Antes" onerror="this.style.background='#333'">
            <span class="ba-label">Antes</span>
          </div>
          <div class="before-after-item">
            <img src="/images/after-offer.jpg" alt="Depois" onerror="this.style.background='#1a472a'">
            <span class="ba-label">Depois</span>
          </div>
        </div>
      </div>

      <!-- BODY -->
      <div class="offer-body">

        <!-- Product card -->
        <div class="offer-product-card">
          <div class="offer-product-header">
            <div>
              <p class="offer-product-name">${cfg.productName}</p>
              <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">Acesso imediato</p>
            </div>
            <div class="offer-price-wrap">
              <p class="offer-price-original">€49,90</p>
              <p class="offer-price">€${cfg.productPrice.toFixed(2).replace('.',',')}</p>
              <p class="offer-price-note">Pagamento único</p>
            </div>
          </div>
          <div class="offer-includes">
            <div class="offer-include-item">
              <div class="include-icon">${icon('smartphone')}</div>
              <div class="include-info">
                <p class="include-name">App exclusiva do protocolo</p>
                <p class="include-desc">Acesso imediato ao protocolo completo e guia de receitas</p>
              </div>
              <span class="include-value">€29</span>
            </div>
            <div class="offer-include-item">
              <div class="include-icon">${icon('clapperboard')}</div>
              <div class="include-info">
                <p class="include-name">Vídeo-aulas passo a passo</p>
                <p class="include-desc">Como preparar a gelatina barátrica em 20 minutos</p>
              </div>
              <span class="include-value">€14</span>
            </div>
            <div class="offer-include-item">
              <div class="include-icon">${icon('clipboard-list')}</div>
              <div class="include-info">
                <p class="include-name">Plano semanal personalizado</p>
                <p class="include-desc">Adaptado ao seu perfil e objetivos específicos</p>
              </div>
              <span class="include-value">€19</span>
            </div>
            <div class="offer-include-item">
              <div class="include-icon">${icon('message-circle')}</div>
              <div class="include-info">
                <p class="include-name">Grupo privado de apoio</p>
                <p class="include-desc">Comunidade de mulheres + suporte da equipa</p>
              </div>
              <span class="include-value">€7</span>
            </div>
          </div>
        </div>

        <!-- Guarantee -->
        <div class="guarantee-box">
          <div class="guarantee-badge">
            <span>30</span>DIAS<br>GARANTIA
          </div>
          <div class="guarantee-text">
            <h4>Garantia de Devolução 30 Dias</h4>
            <p>Se não ficar satisfeita, devolvemos o seu dinheiro. Sem perguntas, sem complicações.</p>
          </div>
        </div>

        <!-- More testimonials -->
        <div class="testimonial-card">
          <div class="testimonial-header">
            ${avatarInitials('Rosana Alves')}
            <div>
              <div class="stars">${icon('star').repeat(5)}</div>
              <p class="testimonial-name">Rosana Alves</p>
              <p class="testimonial-location">${icon('map-pin')} Braga</p>
            </div>
          </div>
          <p class="testimonial-body">Perdi 15kg ao longo do processo e, mais importante, deixei de sentir aquele inchaço constante. Hoje sinto-me muito mais leve e confiante.</p>
        </div>

        <!-- CTA -->
        <div class="btn-wrap" style="padding-bottom:120px">
          <button class="btn btn-success" id="checkout-btn" data-action="checkout">
            ${icon('check')} QUERO O MEU PROTOCOLO — €${cfg.productPrice.toFixed(2).replace('.',',')}
          </button>
          <p class="btn-note">${icon('lock')} Pagamento 100% seguro via Stripe · Acesso imediato</p>
        </div>

      </div>

      <!-- Sticky footer CTA -->
      <div class="sticky-cta" id="sticky-cta">
        <div class="sticky-cta-inner">
          <div class="sticky-price-info">
            <p class="sticky-price-label">Preço especial</p>
            <p class="sticky-price-value">€${cfg.productPrice.toFixed(2).replace('.',',')}</p>
          </div>
          <button class="btn btn-success sticky-cta-btn" data-action="checkout">
            Comprar agora →
          </button>
        </div>
      </div>
    `;

    CRM.track('offer_viewed');
    CRM.setState('offer_viewed');
    bindScreen({ type: 'offer' });
  }

  // ─────────────────────────────────────────────
  // BIND — attach event listeners after render
  // ─────────────────────────────────────────────
  function bindScreen(screen) {
    const el = app.querySelector('.screen');
    if (!el) return;

    // Generic next/submit buttons
    el.querySelectorAll('[data-action="next"]').forEach(btn => {
      btn.addEventListener('click', () => advance());
    });

    // Single select
    const singleList = el.querySelector('[data-type="single"]');
    if (singleList) {
      singleList.querySelectorAll('.option-item').forEach(item => {
        item.addEventListener('click', () => {
          const key = singleList.dataset.key;
          const val = item.dataset.value;
          CRM.setAnswer(key, val);
          CRM.track('question_answered', { key, value: val });

          // Visual feedback then advance
          singleList.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          setTimeout(() => advance(), 280);
        });
      });
    }

    // Multi select
    const multiList = el.querySelector('[data-type="multi"]');
    if (multiList) {
      const btn = el.querySelector('[data-action="next"]');
      multiList.querySelectorAll('.option-item').forEach(item => {
        item.addEventListener('click', () => {
          item.classList.toggle('selected');
          const selected = [...multiList.querySelectorAll('.option-item.selected')]
            .map(i => i.dataset.value);
          btn?.classList.toggle('btn-disabled', selected.length === 0);
        });
      });
      btn?.addEventListener('click', () => {
        const selected = [...multiList.querySelectorAll('.option-item.selected')]
          .map(i => i.dataset.value);
        if (selected.length === 0) return;
        const key = multiList.dataset.key;
        CRM.setAnswer(key, selected);
        CRM.track('question_answered', { key, value: selected });
        advance();
      });
    }

    // Grid select
    const grid = el.querySelector('[data-type="grid"]');
    if (grid) {
      grid.querySelectorAll('.option-card').forEach(card => {
        card.addEventListener('click', () => {
          const key = grid.dataset.key;
          const val = card.dataset.value;
          CRM.setAnswer(key, val);
          CRM.track('question_answered', { key, value: val });
          card.classList.add('selected');
          setTimeout(() => advance(), 300);
        });
      });
    }

    // Text submit
    el.querySelectorAll('[data-action="submit-text"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inputs = el.querySelectorAll('input[data-required="true"]');
        let valid = true;
        const data = {};

        inputs.forEach(input => {
          const val = input.value.trim();
          if (!val) { valid = false; input.style.borderColor = 'var(--brand-danger)'; return; }
          if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            valid = false; input.style.borderColor = 'var(--brand-danger)'; return;
          }
          input.style.borderColor = '';
          data[input.name] = val;
        });

        if (!valid) return;

        // Save to CRM
        CRM.setContact(data);
        Object.entries(data).forEach(([k, v]) => CRM.setAnswer(k, v));

        const screenData = QUIZ_SCREENS[currentIndex];
        if (screenData?.isLeadCapture) {
          CRM.track('lead_captured', { email: data.email });
          CRM.setState('lead_captured');
        }

        advance();
      });
    });

    // Slider
    const ruler = el.querySelector('#slider-ruler');
    if (ruler) initSlider(ruler, el);

    // Unit toggle
    el.querySelectorAll('.unit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isPrimary = btn.dataset.unit === 'primary';
        toggleSliderUnit(ruler, el, isPrimary);
      });
    });

    // Checkout
    el.querySelectorAll('[data-action="checkout"]').forEach(btn => {
      btn.addEventListener('click', initiateCheckout);
    });

    // Back button
    progBack.onclick = () => {
      if (currentIndex > 0) render(currentIndex - 1, 'backward');
    };
  }

  // ─────────────────────────────────────────────
  // SLIDER LOGIC
  // ─────────────────────────────────────────────
  function initSlider(ruler, el) {
    const valDisplay = el.querySelector('#slider-val');
    const unitDisplay = el.querySelector('#slider-unit');
    const ticksEl = el.querySelector('#ruler-ticks');

    let min = +ruler.dataset.min;
    let max = +ruler.dataset.max;
    let val = +ruler.dataset.val;
    let step = +ruler.dataset.step || 1;
    const unit = ruler.closest('[data-slider-unit]')?.dataset.sliderUnit || 'cm';

    const TICK_SPACING = 16; // px per unit

    function buildTicks() {
      const total = max - min;
      let html = '';
      for (let i = 0; i <= total; i++) {
        const v = min + i;
        const isMajor = v % 10 === 0;
        const h = isMajor ? 20 : (v % 5 === 0 ? 14 : 8);
        html += `<div class="ruler-tick${isMajor ? ' major' : ''}" style="height:${h}px;margin-top:${20-h}px"></div>`;
      }
      ticksEl.style.width = ((total + 1) * TICK_SPACING) + 'px';
      ticksEl.innerHTML = html;
    }

    function updateDisplay(v) {
      val = Math.round(Math.max(min, Math.min(max, v)) / step) * step;
      valDisplay.textContent = val;
      unitDisplay.textContent = ' ' + unit;
      ruler.setAttribute('aria-valuenow', val);
      ruler.setAttribute('aria-valuetext', val + ' ' + unit);

      // Shift ticks so current value is centered
      const center = ruler.offsetWidth / 2;
      const offset = center - (val - min) * TICK_SPACING;
      ticksEl.style.transform = `translateX(${offset}px)`;

      const key = el.closest('[data-slider-key]')?.dataset.sliderKey;
      if (key) CRM.setAnswer(key, val);
    }

    buildTicks();
    updateDisplay(val);

    // Drag/touch
    let dragging = false;
    let startX, startVal;

    function onStart(e) {
      dragging = true;
      ruler.classList.add('dragging');
      startX = (e.touches ? e.touches[0].clientX : e.clientX);
      startVal = val;
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX);
      const delta = (startX - cx) / TICK_SPACING;
      updateDisplay(startVal + delta * step);
    }
    function onEnd() { dragging = false; ruler.classList.remove('dragging'); }

    ruler.addEventListener('mousedown', onStart);
    ruler.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);

    ruler.addEventListener('keydown', (e) => {
      const big = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { updateDisplay(val + step * big); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { updateDisplay(val - step * big); e.preventDefault(); }
      else if (e.key === 'Home') { updateDisplay(min); e.preventDefault(); }
      else if (e.key === 'End') { updateDisplay(max); e.preventDefault(); }
    });
  }

  function toggleSliderUnit(ruler, el, isPrimary) {
    if (!ruler) return;
    const valDisplay = el.querySelector('#slider-val');
    const unitDisplay = el.querySelector('#slider-unit');

    if (isPrimary) {
      ruler.dataset.min = ruler.dataset.min;
      ruler.dataset.max = ruler.dataset.max;
      ruler.dataset.val = ruler.dataset.val;
    } else {
      // Switch to alt units (approximate display only)
      const conv = +ruler.dataset.conv || 1;
      const current = +ruler.dataset.val;
      const converted = Math.round(current * conv);
      valDisplay.textContent = converted;
      unitDisplay.textContent = ' ' + ruler.closest('[data-slider-unit-alt]')?.dataset.sliderUnitAlt;
    }
  }

  // ─────────────────────────────────────────────
  // LOADING SEQUENCE
  // ─────────────────────────────────────────────
  function runLoadingSequence(screen) {
    const steps = screen.steps || [];
    steps.forEach((_, i) => {
      setTimeout(() => {
        const stepEl = document.getElementById(`lstep-${i}`);
        const iconEl = document.getElementById(`lstep-icon-${i}`);
        if (stepEl) stepEl.classList.add('done');
        if (iconEl) { iconEl.innerHTML = icon('check'); refreshIcons(); }
      }, i * 700 + 400);
    });

    setTimeout(() => advance(), screen.duration || 3500);
  }

  // ─────────────────────────────────────────────
  // CHECKOUT
  // ─────────────────────────────────────────────
  async function initiateCheckout() {
    const btn = document.getElementById('checkout-btn') ||
      document.querySelector('[data-action="checkout"]');
    if (btn) { btn.textContent = 'A processar...'; btn.disabled = true; }

    CRM.track('checkout_initiated');
    CRM.setState('checkout_initiated');

    try {
      const sess = CRM.getSession();
      const res = await fetch('/api/public/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: sess.email,
          userId: sess.userId,
          funnelSlug: (window.FUNNEL && window.FUNNEL.slug) || undefined,
          metadata: {
            nome: sess.nome,
            objetivo: sess.quizData.objetivo,
            imc: CRM.computeIMC(),
          }
        })
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Erro ao criar sessão');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      if (btn) {
        btn.textContent = 'Erro. Tente novamente.';
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = 'QUERO O MEU PROTOCOLO';
        }, 3000);
      }
    }
  }

  // ─────────────────────────────────────────────
  // ADVANCE
  // ─────────────────────────────────────────────
  function advance() {
    const next = currentIndex + 1;
    if (next < QUIZ_SCREENS.length) {
      render(next, 'forward');
    }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────
  function _labelForValue(questionId, value) {
    const screen = QUIZ_SCREENS.find(s => s.key === questionId);
    if (!screen?.options) return value;
    return screen.options.find(o => o.value === value)?.label || value;
  }

  function _labelsForMulti(questionId, values) {
    if (!values?.length) return '—';
    const screen = QUIZ_SCREENS.find(s => s.key === questionId);
    if (!screen?.options) return values.join(', ');
    return values
      .map(v => screen.options.find(o => o.value === v)?.label || v)
      .join(', ');
  }

  function escHtml(str) {
    return str.replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // Add reverse animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes screenInReverse {
      from { opacity: 0; transform: translateX(-24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);

  // ── PREVIEW MODE (visual builder) ─────────────
  // Renders a single screen on demand from postMessage'd draft config.
  function renderPreview(screens, index, config) {
    if (config) window.QUIZ_CONFIG = config;
    const screen = (screens || [])[index];
    progWrap.classList.add('hidden');
    footer.classList.add('hidden');
    if (!screen) { app.innerHTML = '<div class="screen"></div>'; return; }
    app.innerHTML = buildScreen(screen);
    // Fill dynamic screens (use the sample session seeded below)
    try {
      if (screen.type === 'imc') renderIMC();
      else if (screen.type === 'profile') renderProfile();
      else if (screen.type === 'offer') renderOffer();
      else if (screen.type === 'loading') { /* static frame is enough */ }
    } catch (e) { /* preview best-effort */ }
    refreshIcons();
  }

  // ── START ─────────────────────────────────────
  if (PREVIEW) {
    // Seed sample answers locally so dynamic screens (imc/profile/offer) render.
    try {
      window.CRM.init();
      CRM.setContact({ nome: 'Maria', email: 'maria@example.com' });
      CRM.setAnswer('objetivo', 'perder_peso');
      CRM.setAnswer('altura', '165');
      CRM.setAnswer('peso_atual', '78');
      CRM.setAnswer('peso_objetivo', '65');
      CRM.setAnswer('zonas_problematicas', ['barriga']);
    } catch (e) { /* ignore */ }
    const pv = { screens: window.SCREENS || [], config: window.QUIZ_CONFIG || {}, index: 0 };
    window.addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.type !== 'qf-preview') return;
      if (d.screens) pv.screens = d.screens;
      if (d.config) pv.config = d.config;
      if (typeof d.index === 'number') pv.index = d.index;
      renderPreview(pv.screens, pv.index, pv.config);
    });
    renderPreview(pv.screens, pv.index, pv.config);
    try { parent.postMessage({ type: 'qf-preview-ready' }, '*'); } catch (e) { /* ignore */ }
  } else {
    render(0);

    // ── Handle success redirect ───────────────────
    if (new URLSearchParams(location.search).get('success') === 'true') {
      CRM.track('purchase_completed');
      CRM.setState('purchase_completed');
      app.innerHTML = `
        <div class="screen success-screen">
          <div class="success-icon">${icon('check')}</div>
          <h1 class="success-headline">Compra confirmada!</h1>
          <p class="success-body">Receberá o acesso ao seu protocolo no email em instantes. Bem-vinda à sua transformação.</p>
          <div class="btn-wrap">
            <a href="${(window.FUNNEL && window.FUNNEL.postPurchaseUrl) || '#'}" class="btn">Aceder ao protocolo →</a>
          </div>
        </div>`;
      progWrap.classList.add('hidden');
      refreshIcons();
    }
  }

})();
