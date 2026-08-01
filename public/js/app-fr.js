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
  const QUIZ_SCREENS = (window.SCREENS || []).map(s =>
    (!s.type && s.id === 'offer') ? { ...s, type: 'offer' } : s
  );
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
    if (screen.type === 'loading_social') {
      runLoadingSocialSequence(screen);
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
      ['landing', 'loading', 'loading_social', 'offer', 'success', 'video'].includes(screen.type);

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
      case 'loading_social': return buildLoadingSocial(screen);
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
      ${s.eyebrow !== '' ? `<p class="landing-eyebrow">${s.eyebrow || 'Évaluation gratuite'}</p>` : ''}
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
        <button class="btn btn-disabled" data-action="next">Continuer</button>
      </div>
    </div>`;
  }

  // ─────────────────────────────────────────────
  // CURSEUR
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
        <p class="slider-hint">Faites glisser ou utilisez les flèches du clavier pour ajuster</p>
      </div>

      ${infoBox}

      <div class="btn-wrap">
        <button class="btn" data-action="next">Continuer</button>
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
        ${s.audioUrl ? `<audio id="bridge-audio" src="${s.audioUrl}" preload="metadata"></audio>` : ''}
        <div class="audio-play-btn" id="play-icon">▶</div>
        <div class="audio-info">
          <p class="audio-name">${s.audioName}</p>
          <p class="audio-time" id="audio-time">${s.audioDuration}</p>
        </div>
        <div class="audio-wave" id="audio-wave">
          ${Array(12).fill(0).map((_,i) =>
            `<div class="audio-bar" style="height:${6+Math.random()*14}px;animation-delay:${i*0.08}s"></div>`
          ).join('')}
        </div>
      </div>` : '';

    const socialImg = s.socialProofImage ? `
      <div class="bridge-image">
        <img src="${s.socialProofImage}" alt="Avant et après"
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
    <div class="screen bridge-screen with-progress" id="${s.id}">
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
      : `<div class="vsl-frame vsl-placeholder">${icon('video')}<span>Vidéo</span></div>`;

    const ctaAction = s.ctaAction === 'checkout' ? 'checkout' : 'next';
    return `
    <div class="screen bridge-screen video-screen">
      ${s.headline ? `<h2 class="bridge-headline">${fmtRed(s.headline)}</h2>` : ''}
      ${s.sub ? `<p class="bridge-body">${s.sub}</p>` : ''}
      ${player}
      ${s.body ? `<p class="bridge-body">${s.body}</p>` : ''}
      <div class="btn-wrap">
        <button class="btn ${ctaAction === 'checkout' ? 'btn-success' : ''}" data-action="${ctaAction}"${s.id ? ` id="${ctaAction === 'checkout' ? 'checkout-btn' : ''}"` : ''}>${s.cta || 'Continuer'}</button>
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
  // LOADING WITH SOCIAL PROOF (progress % + rotating testimonial carousel)
  // ─────────────────────────────────────────────
  function buildLoadingSocial(s) {
    const testimonials = s.testimonials || [];
    const slides = testimonials.map((t, i) => `
      <div class="loading-social-slide${i === 0 ? ' active' : ''}" data-slide="${i}">
        <img src="${t.image}" alt="" onerror="this.closest('.loading-social-slide').style.display='none'">
        <p class="loading-social-caption">${t.name}${t.detail ? `, ${t.detail}` : ''}</p>
      </div>`).join('');
    const dots = testimonials.map((_, i) =>
      `<span class="loading-social-dot${i === 0 ? ' active' : ''}" data-dot="${i}"></span>`).join('');

    return `
    <div class="screen loading-social-screen">
      <div class="loading-social-header">
        <span class="loading-social-label">${s.headline || 'Presque prêt...'}</span>
        <span class="loading-social-pct" id="loading-social-pct">0%</span>
      </div>
      <div class="loading-social-bar"><div class="loading-social-bar-fill" id="loading-social-fill"></div></div>
      ${s.body ? `<p class="loading-social-body">${s.body}</p>` : ''}
      ${testimonials.length ? `
        <div class="loading-social-carousel" id="loading-social-carousel">${slides}</div>
        <div class="loading-social-dots">${dots}</div>` : ''}
    </div>`;
  }

  // ─────────────────────────────────────────────
  // PROFILE SUMMARY (dynamic)
  // ─────────────────────────────────────────────
  function buildProfileScreen(s) {
    return `
    <div class="screen profile-summary with-progress" id="profile-screen">
      <h2 class="question-title" style="text-align:center">${s.headline}</h2>
      <div class="profile-avatar">
        <img src="/images/profile-avatar.jpg" alt=""
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
        <div class="profile-avatar-fallback" style="display:none">${icon('user-round')}</div>
      </div>
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
      { label: 'Objectif principal', value: _labelForValue('objetivo', q.objetivo) },
      { label: 'Zone la plus résistante', value: _labelsForMulti('zonas_problematicas', q.zonas_problematicas) },
      { label: 'Poids actuel', value: q.peso_atual ? q.peso_atual + ' kg' : '—' },
      { label: 'Poids objectif', value: q.peso_objetivo ? q.peso_objetivo + ' kg' : '—' },
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
      ['< 18,5', 'Insuffisance pondérale'],
      ['18,5 – 24,9', 'Poids normal'],
      ['25,0 – 29,9', 'Surpoids'],
      ['30,0 – 34,9', 'Obésité modérée'],
      ['35,0 – 39,9', 'Obésité sévère'],
      ['> 40,0', 'Obésité morbide'],
    ];

    container.innerHTML = `
      <h2 class="question-title" style="font-size:clamp(20px,5vw,28px);text-align:center">
        ${icon('alert-triangle')} Attention${nome ? ', ' + nome : ''}.
      </h2>
      <p class="bridge-body" style="text-align:center">
        D'après vos réponses et votre IMC,<br>
        votre corps présente des signes de <span class="accent">tendance à l'accumulation de graisse.</span>
      </p>

      <div class="imc-alert">
        <p class="imc-alert-title">Votre IMC est :</p>
        <p class="imc-value">${imc}</p>
      </div>

      <!-- IMC gradient bar -->
      <div class="imc-chart">
        <div class="imc-gradient">
          <div class="imc-needle" style="left:${needlePct}%">
            <div class="imc-needle-label">Votre IMC : ${imc}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;padding:0 8px;font-size:11px;color:var(--text-muted)">
          <span>Insuffisance pondérale</span><span>Normal</span><span>Surpoids</span>
        </div>
      </div>

      <!-- IMC Table -->
      <div class="imc-table">
        <div class="imc-table-head"><span>IMC</span><span>Classification</span></div>
        ${imcRows.map((r, i) => `
          <div class="imc-table-row${i === info.rowIndex ? ' highlight' : ''}">
            <span>${r[0]}</span><span>${r[1]}</span>
          </div>`).join('')}
      </div>

      <!-- Impact -->
      <div class="imc-impact-box">
        <p class="imc-impact-title">${icon('alert-circle')} Ce que cela peut signifier pour vous :</p>
        <div class="imc-impact-item">${icon('x-circle')} <span>Plus de difficulté à perdre de la graisse, même avec des efforts</span></div>
        <div class="imc-impact-item">${icon('x-circle')} <span>Sensation fréquente de ballonnements et de fatigue</span></div>
        <div class="imc-impact-item">${icon('x-circle')} <span>Tendance à l'accumulation dans la zone abdominale</span></div>
      </div>

      <!-- Solution -->
      <div class="imc-solution-box">
        <p class="imc-solution-title">Avec le Protocole de Gélatine Bariatrique, votre corps peut recommencer à répondre à l'amaigrissement.</p>
        <div class="imc-solution-item">${icon('check-circle')} <span>La combinaison stratégique d'ingrédients aide à réguler l'appétit</span></div>
        <div class="imc-solution-item">${icon('check-circle')} <span>Peut contribuer à réduire la rétention d'eau</span></div>
        <div class="imc-solution-item">${icon('check-circle')} <span>Soutient l'équilibre métabolique tout au long de la journée</span></div>
      </div>

      <div class="btn-wrap">
        <button class="btn" data-action="next">Continuer</button>
      </div>
    `;

    // Re-bind events on dynamic content
    bindScreen({ type: 'imc', cta: 'Continuer' });
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
        <p class="offer-hero-eyebrow">Votre protocole personnalisé est prêt</p>
        <h1 class="offer-hero-headline">
          ${nome ? nome + ',<br>' : ''}<span class="accent">Votre heure est arrivée.</span>
        </h1>
        <p class="offer-hero-sub">La méthode qui transforme des milliers de femmes — désormais adaptée à votre profil.</p>
        <div class="before-after">
          <div class="before-after-item">
            <img src="/images/before-offer.jpg" alt="Avant" onerror="this.style.background='#333'">
            <span class="ba-label">Avant</span>
          </div>
          <div class="before-after-item">
            <img src="/images/after-offer.jpg" alt="Après" onerror="this.style.background='#1a472a'">
            <span class="ba-label">Après</span>
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
              <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">Accès immédiat</p>
            </div>
            <div class="offer-price-wrap">
              <p class="offer-price-original">R$ 49,90</p>
              <p class="offer-price">R$ ${cfg.productPrice.toFixed(2).replace('.',',')}</p>
              <p class="offer-price-note">Paiement unique</p>
            </div>
          </div>
          <div class="offer-includes">
            <div class="offer-include-item">
              <div class="include-icon">${icon('smartphone')}</div>
              <div class="include-info">
                <p class="include-name">Application exclusive du protocole</p>
                <p class="include-desc">Accès immédiat au protocole complet et au guide de recettes</p>
              </div>
              <span class="include-value">R$ 27,90</span>
            </div>
            <div class="offer-include-item">
              <div class="include-icon">${icon('clipboard-list')}</div>
              <div class="include-info">
                <p class="include-name">Plan hebdomadaire personnalisé</p>
                <p class="include-desc">Adapté à votre profil et à vos objectifs spécifiques</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Guarantee -->
        <div class="guarantee-box">
          <div class="guarantee-badge">
            <span>7</span>JOURS<br>GARANTIE
          </div>
          <div class="guarantee-text">
            <h4>Garantie de Remboursement 7 Jours</h4>
            <p>Si vous n'êtes pas satisfaite, nous vous remboursons. Sans questions, sans complications.</p>
          </div>
        </div>

        <!-- More testimonials -->
        <div class="testimonial-card">
          <div class="testimonial-header">
            ${avatarInitials('Rosana Alves')}
            <div>
              <div class="stars">${icon('star').repeat(5)}</div>
              <p class="testimonial-name">Rosana Alves</p>
              <p class="testimonial-location">${icon('map-pin')} Rio de Janeiro</p>
            </div>
          </div>
          <p class="testimonial-body">J'ai perdu 15 kg au fil du processus et, surtout, je ne ressentais plus ce ballonnement constant. Aujourd'hui, je me sens beaucoup plus légère et confiante.</p>
        </div>

        <!-- CTA -->
        <div class="btn-wrap" style="padding-bottom:120px">
          <button class="btn btn-success" id="checkout-btn" data-action="checkout">
            ${icon('check')} JE VEUX MON PROTOCOLE — R$ ${cfg.productPrice.toFixed(2).replace('.',',')}
          </button>
          <p class="btn-note">${icon('lock')} Paiement 100% sécurisé · Accès immédiat</p>
        </div>

      </div>

      <!-- Sticky footer CTA -->
      <div class="sticky-cta" id="sticky-cta">
        <div class="sticky-cta-inner">
          <div class="sticky-price-info">
            <p class="sticky-price-label">Prix spécial</p>
            <p class="sticky-price-value">R$ ${cfg.productPrice.toFixed(2).replace('.',',')}</p>
          </div>
          <button class="btn btn-success sticky-cta-btn" data-action="checkout">
            Acheter maintenant →
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

    // Bridge audio player
    const audioEl = el.querySelector('#bridge-audio');
    const audioBtn = el.querySelector('#audio-play-btn');
    if (audioEl && audioBtn) {
      const playIcon = el.querySelector('#play-icon');
      const timeLabel = el.querySelector('#audio-time');
      const wave = el.querySelector('#audio-wave');
      const fmtTime = (sec) => {
        if (!isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
      };
      const totalLabel = () => isFinite(audioEl.duration) ? fmtTime(audioEl.duration) : (screen.audioDuration || '');

      audioBtn.addEventListener('click', () => {
        if (audioEl.paused) audioEl.play(); else audioEl.pause();
      });
      audioEl.addEventListener('play', () => {
        playIcon.textContent = '❚❚';
        wave?.classList.add('playing');
      });
      audioEl.addEventListener('pause', () => {
        playIcon.textContent = '▶';
        wave?.classList.remove('playing');
      });
      audioEl.addEventListener('ended', () => {
        playIcon.textContent = '▶';
        wave?.classList.remove('playing');
        timeLabel.textContent = totalLabel();
      });
      audioEl.addEventListener('timeupdate', () => {
        timeLabel.textContent = `${fmtTime(audioEl.currentTime)} / ${totalLabel()}`;
      });
      audioEl.addEventListener('loadedmetadata', () => {
        timeLabel.textContent = totalLabel();
      });
    }

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

  function runLoadingSocialSequence(screen) {
    const duration = screen.duration || 5000;
    const pctEl = document.getElementById('loading-social-pct');
    const fillEl = document.getElementById('loading-social-fill');
    const start = Date.now();
    const pctTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(99, Math.round((elapsed / duration) * 100));
      if (pctEl) pctEl.textContent = pct + '%';
      if (fillEl) fillEl.style.width = pct + '%';
      if (elapsed >= duration) clearInterval(pctTimer);
    }, 100);

    const slides = screen.testimonials || [];
    if (slides.length > 1) {
      let idx = 0;
      const rotateMs = Math.max(1200, Math.floor(duration / slides.length));
      const rotateTimer = setInterval(() => {
        idx = (idx + 1) % slides.length;
        document.querySelectorAll('.loading-social-slide').forEach((el, i) => el.classList.toggle('active', i === idx));
        document.querySelectorAll('.loading-social-dot').forEach((el, i) => el.classList.toggle('active', i === idx));
      }, rotateMs);
      setTimeout(() => clearInterval(rotateTimer), duration);
    }

    setTimeout(() => advance(), duration);
  }

  // ─────────────────────────────────────────────
  // CHECKOUT
  // ─────────────────────────────────────────────
  async function initiateCheckout() {
    const btn = document.getElementById('checkout-btn') ||
      document.querySelector('[data-action="checkout"]');
    if (btn) { btn.textContent = 'Traitement en cours...'; btn.disabled = true; }

    CRM.track('checkout_initiated');
    CRM.setState('checkout_initiated');

    // Funnels with an external checkout link (e.g. Cakto) skip the Stripe
    // session flow entirely and go straight to the provider's own page.
    const cfg = window.QUIZ_CONFIG || {};
    if (cfg.checkoutUrl) {
      window.location.href = cfg.checkoutUrl;
      return;
    }

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
        throw new Error(data.error || 'Erreur lors de la création de la session');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      if (btn) {
        btn.textContent = 'Erreur. Réessayez.';
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = 'JE VEUX MON PROTOCOLE';
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
          <h1 class="success-headline">Achat confirmé !</h1>
          <p class="success-body">Vous recevrez l'accès à votre protocole par email dans quelques instants. Bienvenue dans votre transformation.</p>
          <div class="btn-wrap">
            <a href="${(window.FUNNEL && window.FUNNEL.postPurchaseUrl) || '#'}" class="btn">Accéder au protocole →</a>
          </div>
        </div>`;
      progWrap.classList.add('hidden');
      refreshIcons();
    }
  }

})();
