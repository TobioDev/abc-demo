// Caricamento condizionale del polyfill Popover solo dove il supporto nativo manca
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(() => {});
}

const header = document.querySelector('.site-header');
const headerInner = document.querySelector('.header-inner');
const menuButton = document.querySelector('.menu-button');
const siteMenu = document.querySelector('#site-menu');
const navLinks = Array.from(document.querySelectorAll('#site-menu a'));

// --- 1. Adaptive Navbar (misura reale dello spazio disponibile) ---
let lastHeaderWidth = 0;

function syncMenuLayout() {
  if (!header || !headerInner || !siteMenu) return;

  const wasWide = header.classList.contains('is-wide');
  const currentWidth = headerInner.clientWidth;

  // Evita thrashing se collassato e la larghezza non è cresciuta
  if (!wasWide && currentWidth <= lastHeaderWidth && lastHeaderWidth !== 0) {
    return;
  }
  lastHeaderWidth = currentWidth;

  const wasOpen = siteMenu.matches(':popover-open') || siteMenu.classList.contains(':popover-open');

  header.classList.add('is-measuring', 'is-wide');
  siteMenu.removeAttribute('popover');

  const fitsInline = headerInner.scrollWidth <= headerInner.clientWidth;

  if (!fitsInline) {
    header.classList.remove('is-wide');
    siteMenu.setAttribute('popover', 'auto');
    if (wasOpen && typeof siteMenu.showPopover === 'function') {
      try {
        siteMenu.showPopover();
      } catch {
        // Ignora se già aperto o non supportato
      }
    }
  }

  requestAnimationFrame(() => {
    header.classList.remove('is-measuring');
  });
}

if (header && headerInner && siteMenu) {
  syncMenuLayout();
  const navObserver = new ResizeObserver(() => syncMenuLayout());
  navObserver.observe(headerInner);
  navObserver.observe(siteMenu);

  // Chiude il popover mobile al click su un link ancora
  siteMenu.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    if (!header.classList.contains('is-wide') && typeof siteMenu.hidePopover === 'function') {
      try {
        siteMenu.hidePopover();
      } catch {
        // Ignora se chiuso
      }
    }
    const targetId = link.getAttribute('href');
    if (targetId && targetId.startsWith('#')) {
      const target = document.querySelector(targetId);
      if (target) {
        target.focus({ preventScroll: true });
      }
    }
  });

  if (menuButton) {
    siteMenu.addEventListener('toggle', (event) => {
      menuButton.setAttribute('aria-expanded', String(event.newState === 'open'));
    });
  }
}

// --- 2. Header background, barra progresso lettura e rotazione pentagono su scroll (fallback) ---
const supportsScrollProgress = CSS.supports('(animation-timeline: scroll()) and (animation-range: 0% 100%)');
const prefersNoReducedMotion = window.matchMedia('(prefers-reduced-motion: no-preference)');
const progressBar = document.querySelector('.scroll-progress');
const heroEmblem = document.querySelector('.hero-emblem');
const heroEmblemSvg = document.querySelector('.hero-emblem svg');

function updateScrollUI() {
  const y = window.scrollY;
  if (header) {
    header.classList.toggle('is-scrolled', y > 36);
  }
  if (!supportsScrollProgress && progressBar) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, y / maxScroll)) : 0;
    progressBar.style.setProperty('--scroll-progress', String(ratio));
  }
  if (!supportsScrollProgress && prefersNoReducedMotion.matches && heroEmblemSvg) {
    const spinRatio = Math.min(1, Math.max(0, y / 900));
    heroEmblemSvg.style.setProperty('--emblem-rot', `${(spinRatio * 54).toFixed(2)}deg`);
    heroEmblemSvg.style.setProperty('--emblem-scale', (1 + spinRatio * 0.04).toFixed(4));
  }
}

const heroEmblemDetails = heroEmblem?.querySelector('.hero-emblem-details');
if (heroEmblemDetails && prefersNoReducedMotion.matches) {
  const finishDrawing = () => {
    heroEmblem.classList.remove('is-drawing');
    updateScrollUI();
  };

  heroEmblem.classList.add('is-drawing');
  // Riattiva il movimento anche se la preferenza cambia durante il disegno.
  const [drawing] = heroEmblemDetails.getAnimations?.() ?? [];
  if (drawing) {
    drawing.finished.then(finishDrawing, finishDrawing);
  } else {
    finishDrawing();
  }
}

updateScrollUI();
window.addEventListener('scroll', updateScrollUI, { passive: true });

// --- 2b. Parallasse fluida del pentagono in senso opposto al cursore ---
const heroSection = document.querySelector('.hero');
const supportsFineHover = window.matchMedia('(hover: hover) and (pointer: fine)');

if (heroSection && heroEmblem && prefersNoReducedMotion.matches && supportsFineHover.matches) {
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let rafId = 0;

  const tickParallax = () => {
    currentX += (targetX - currentX) * 0.085;
    currentY += (targetY - currentY) * 0.085;
    heroEmblem.style.setProperty('--px', `${currentX.toFixed(2)}px`);
    heroEmblem.style.setProperty('--py', `${currentY.toFixed(2)}px`);

    if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
      rafId = requestAnimationFrame(tickParallax);
    } else {
      rafId = 0;
    }
  };

  const scheduleParallax = () => {
    if (!rafId) {
      rafId = requestAnimationFrame(tickParallax);
    }
  };

  heroSection.addEventListener('pointermove', (event) => {
    if (heroEmblem.classList.contains('is-drawing') || !prefersNoReducedMotion.matches || event.pointerType === 'touch') return;
    const rect = heroSection.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    targetX = -nx * 26;
    targetY = -ny * 18;
    scheduleParallax();
  });

  heroSection.addEventListener('pointerleave', () => {
    targetX = 0;
    targetY = 0;
    scheduleParallax();
  });
}

// --- 3. Scrollspy (nativo :target-current + fallback IntersectionObserver) ---
if (CSS.supports('scroll-target-group: auto')) {
  const syncAriaCurrent = () => {
    const current = document.querySelector('#site-menu a:target-current');
    navLinks.forEach((link) => {
      link.setAttribute('aria-current', link === current ? 'true' : 'false');
    });
  };
  syncAriaCurrent();
  document.addEventListener('scrollend', syncAriaCurrent);
} else {
  const sections = navLinks
    .map((link) => {
      const href = link.getAttribute('href');
      return href && href.startsWith('#') ? document.querySelector(href) : null;
    })
    .filter(Boolean);

  if (sections.length > 0) {
    const spyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const activeHref = `#${entry.target.id}`;
          navLinks.forEach((link) => {
            const isActive = link.getAttribute('href') === activeHref;
            link.classList.toggle('target-current', isActive);
            link.setAttribute('aria-current', String(isActive));
          });
        });
      },
      { rootMargin: '-42% 0px -48% 0px', threshold: 0 }
    );

    sections.forEach((section) => spyObserver.observe(section));
  }
}

// --- 4. Scroll-entry reveal fallback per browser senza animation-timeline: view() ---
const supportsViewTimeline = CSS.supports('(animation-timeline: view()) and (animation-range: entry)');
if (!supportsViewTimeline && prefersNoReducedMotion.matches) {
  const revealItems = document.querySelectorAll('.reveal');
  if (revealItems.length > 0) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    revealItems.forEach((el) => {
      el.classList.add('js-reveal-ready');
      revealObserver.observe(el);
    });
  }
}

// --- 4b. Ingresso sequenziale da sinistra delle chips benessere (nella fascia medio-alta) ---
const staggerChipsGroup = document.querySelector('.pillar-tags--stagger');
if (staggerChipsGroup && prefersNoReducedMotion.matches) {
  staggerChipsGroup.classList.add('js-reveal-ready');
  const chipsObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -38% 0px', threshold: 0.1 }
  );
  chipsObserver.observe(staggerChipsGroup);
}

// --- 4c. Ingresso delle foto e della didascalia ---
const placesGrid = document.querySelector('.places-grid');
const placesItems = document.querySelectorAll('.places-showcase :is(.place-frame, .places-caption)');
const placesDesktop = window.matchMedia('(min-width: 721px)');

if (placesGrid && placesItems.length && prefersNoReducedMotion.matches && 'IntersectionObserver' in window) {
  const placesObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.12) continue;

      if (entry.target === placesGrid) {
        placesItems.forEach((item) => item.classList.add('is-visible'));
        observer.disconnect();
      } else {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });

  placesItems.forEach((item) => item.classList.add('js-places-ready'));

  const observePlaces = () => {
    placesObserver.disconnect();
    const pending = Array.from(placesItems).filter((item) => !item.classList.contains('is-visible'));
    if (placesDesktop.matches && pending.length === placesItems.length) {
      placesObserver.observe(placesGrid);
    } else {
      pending.forEach((item) => placesObserver.observe(item));
    }
  };

  placesDesktop.addEventListener('change', observePlaces);
  observePlaces();
}

// --- 5. Slider criteri partner con frecce e snap fluido ---
const partnerTrack = document.querySelector('#partner-track');
const partnerCounter = document.querySelector('#partner-counter');
const partnerArrows = Array.from(document.querySelectorAll('.partner-controls .slider-arrow'));

if (partnerTrack && partnerArrows.length > 0) {
  const slides = Array.from(partnerTrack.querySelectorAll('.criterion'));
  let activeIndex = 0;

  const updateCounter = (index) => {
    activeIndex = index;
    if (partnerCounter) {
      partnerCounter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    }
  };

  const goToSlide = (targetIndex) => {
    const wrapped = (targetIndex + slides.length) % slides.length;
    const slideWidth = partnerTrack.clientWidth;
    partnerTrack.scrollTo({
      left: wrapped * slideWidth,
      behavior: prefersNoReducedMotion.matches ? 'smooth' : 'auto',
    });
    updateCounter(wrapped);
  };

  partnerArrows.forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = Number(btn.dataset.dir || 1);
      goToSlide(activeIndex + dir);
    });
  });

  partnerTrack.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToSlide(activeIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToSlide(activeIndex - 1);
    }
  });

  let scrollSyncTimer = 0;
  partnerTrack.addEventListener('scroll', () => {
    window.clearTimeout(scrollSyncTimer);
    scrollSyncTimer = window.setTimeout(() => {
      const slideWidth = partnerTrack.clientWidth;
      if (slideWidth > 0) {
        const index = Math.round(partnerTrack.scrollLeft / slideWidth);
        updateCounter(Math.min(slides.length - 1, Math.max(0, index)));
      }
    }, 60);
  }, { passive: true });
}

// --- 6. Modulo contatti minimalista (compila client email verso mail.abcsrl@gmail.com) ---
const contactForm = document.querySelector('#contact-form');
const formFeedback = document.querySelector('#form-feedback');

if (contactForm && formFeedback) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(contactForm);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const org = String(formData.get('org') || '').trim();
    const message = String(formData.get('message') || '').trim();

    if (!name || !email || !message) {
      formFeedback.textContent = 'Compila nome, email e messaggio prima di inviare.';
      return;
    }

    const emailInput = contactForm.querySelector('#contact-email');
    if (emailInput && !emailInput.checkValidity()) {
      formFeedback.textContent = 'Inserisci un indirizzo email valido.';
      emailInput.focus();
      return;
    }

    const subject = encodeURIComponent(`Contatto da ${name} — Ankon Benefit Company`);
    const orgLine = org ? `Realtà / Associazione: ${org}\n` : '';
    const body = encodeURIComponent(`Nome: ${name}\nEmail: ${email}\n${orgLine}\nMessaggio:\n${message}`);
    window.location.href = `mailto:mail.abcsrl@gmail.com?subject=${subject}&body=${body}`;
    formFeedback.textContent = 'Si sta aprendo il tuo client di posta verso mail.abcsrl@gmail.com.';
  });
}
