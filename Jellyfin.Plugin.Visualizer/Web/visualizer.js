/* ============================================================
   Jellyfin Music Visualizer - Feishin-inspired Audio Visualization
   ============================================================ */
(function () {
    'use strict';

    // Prevent double-init
    if (window.__jellyfinVisualizer) return;
    window.__jellyfinVisualizer = true;

    // ── Constants ──────────────────────────────────────────────
    const MODES = ['bars', 'waveform', 'circular', 'particles'];
    const MODE_LABELS = {
        bars: 'Spectrum',
        waveform: 'Waveform',
        circular: 'Circular',
        particles: 'Particles'
    };

    const COLOR_SCHEMES = {
        Neon:    { primary: '#a855f7', secondary: '#06b6d4', accent: '#ec4899', bg: 'rgba(15, 10, 30, 0.85)' },
        Warm:    { primary: '#f97316', secondary: '#ef4444', accent: '#fbbf24', bg: 'rgba(30, 15, 10, 0.85)' },
        Cool:    { primary: '#3b82f6', secondary: '#10b981', accent: '#06b6d4', bg: 'rgba(10, 15, 30, 0.85)' },
        Rainbow: { primary: '#f43f5e', secondary: '#8b5cf6', accent: '#06b6d4', bg: 'rgba(15, 10, 25, 0.85)' },
        Mono:    { primary: '#e2e8f0', secondary: '#94a3b8', accent: '#f8fafc', bg: 'rgba(10, 10, 10, 0.85)' }
    };

    const FFT_SIZE = 512;
    const PARTICLE_COUNT = 120;

    // ── State ──────────────────────────────────────────────────
    let state = {
        mode: 'bars',
        colorScheme: 'Neon',
        sensitivity: 5,
        enabled: true,
        visible: false,
        audioCtx: null,
        analyser: null,
        sourceNode: null,
        canvas: null,
        ctx: null,
        animId: null,
        particles: [],
        connectedAudio: null,
        ui: null
    };

    // ── Load Config from Server ────────────────────────────────
    async function loadConfig() {
        try {
            const resp = await fetch('/Visualizer/config');
            if (resp.ok) {
                const cfg = await resp.json();
                state.enabled = cfg.enabled !== false;
                state.mode = (cfg.mode || 'Bars').toLowerCase();
                state.colorScheme = cfg.colorScheme || 'Neon';
                state.sensitivity = cfg.sensitivity || 5;
            }
        } catch (e) {
            console.log('[Visualizer] Could not load config, using defaults');
        }
    }

    // ── Color Helpers ──────────────────────────────────────────
    function getColors() {
        return COLOR_SCHEMES[state.colorScheme] || COLOR_SCHEMES.Neon;
    }

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }

    function lerpColor(hex1, hex2, t) {
        const c1 = hexToRgb(hex1);
        const c2 = hexToRgb(hex2);
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);
        return `rgb(${r},${g},${b})`;
    }

    function hslColor(h, s, l) {
        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    // ── Audio Context Setup ────────────────────────────────────
    function setupAudio(audioEl) {
        if (state.connectedAudio === audioEl && state.analyser) return;

        try {
            if (!state.audioCtx) {
                state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (state.audioCtx.state === 'suspended') {
                state.audioCtx.resume();
            }

            // Disconnect previous source if any
            if (state.sourceNode) {
                try { state.sourceNode.disconnect(); } catch (e) { /* ignore */ }
            }

            state.analyser = state.audioCtx.createAnalyser();
            state.analyser.fftSize = FFT_SIZE;
            state.analyser.smoothingTimeConstant = 0.82;
            state.analyser.minDecibels = -90;
            state.analyser.maxDecibels = -10;

            state.sourceNode = state.audioCtx.createMediaElementSource(audioEl);
            state.sourceNode.connect(state.analyser);
            state.analyser.connect(state.audioCtx.destination);

            state.connectedAudio = audioEl;

            console.log('[Visualizer] Audio context connected');
        } catch (e) {
            console.warn('[Visualizer] Audio setup failed:', e.message);
        }
    }

    // ── Particle System ────────────────────────────────────────
    function initParticles(w, h) {
        state.particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            state.particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                size: Math.random() * 3 + 1,
                life: Math.random(),
                hueOffset: Math.random() * 60
            });
        }
    }

    // ── Rendering Functions ────────────────────────────────────

    function getFrequencyData() {
        if (!state.analyser) return new Uint8Array(FFT_SIZE / 2);
        const data = new Uint8Array(state.analyser.frequencyBinCount);
        state.analyser.getByteFrequencyData(data);
        return data;
    }

    function getTimeDomainData() {
        if (!state.analyser) return new Uint8Array(FFT_SIZE);
        const data = new Uint8Array(state.analyser.fftSize);
        state.analyser.getByteTimeDomainData(data);
        return data;
    }

    function sensitivityMultiplier() {
        return 0.5 + (state.sensitivity / 10) * 1.5;
    }

    // ─── Mode: Spectrum Bars ───
    function renderBars(ctx, w, h, freqData) {
        const colors = getColors();
        const mult = sensitivityMultiplier();
        const barCount = 64;
        const gap = 3;
        const barWidth = (w - gap * (barCount - 1)) / barCount;
        const step = Math.floor(freqData.length / barCount);

        for (let i = 0; i < barCount; i++) {
            // Average a range of frequencies for smoother look
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += freqData[i * step + j];
            }
            const value = (sum / step / 255) * mult;
            const barH = Math.max(2, value * h * 0.85);
            const x = i * (barWidth + gap);
            const y = h - barH;

            // Gradient per bar
            const t = i / barCount;
            const grad = ctx.createLinearGradient(x, h, x, y);
            grad.addColorStop(0, lerpColor(colors.primary, colors.secondary, t));
            grad.addColorStop(0.6, lerpColor(colors.secondary, colors.accent, t));
            grad.addColorStop(1, colors.accent + '40');

            // Glow effect
            ctx.shadowColor = lerpColor(colors.primary, colors.secondary, t);
            ctx.shadowBlur = 12 + value * 20;

            // Rounded bars
            const radius = Math.min(barWidth / 2, 4);
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + barWidth - radius, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
            ctx.lineTo(x + barWidth, h);
            ctx.lineTo(x, h);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // Reflection
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.15;
            const reflH = barH * 0.3;
            const reflGrad = ctx.createLinearGradient(x, h, x, h + reflH);
            reflGrad.addColorStop(0, lerpColor(colors.primary, colors.secondary, t));
            reflGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = reflGrad;
            ctx.fillRect(x, h, barWidth, reflH);
            ctx.globalAlpha = 1;
        }

        ctx.shadowBlur = 0;
    }

    // ─── Mode: Waveform ───
    function renderWaveform(ctx, w, h, timeData) {
        const colors = getColors();
        const mult = sensitivityMultiplier();
        const sliceWidth = w / timeData.length;

        // Background waveform (thicker, dimmer)
        ctx.beginPath();
        ctx.lineWidth = 6;
        ctx.strokeStyle = colors.primary + '30';
        ctx.shadowColor = colors.primary;
        ctx.shadowBlur = 20;

        for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] / 128.0 - 1.0) * mult;
            const x = i * sliceWidth;
            const y = h / 2 + v * h * 0.35;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Main waveform
        ctx.beginPath();
        ctx.lineWidth = 2.5;

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, colors.primary);
        grad.addColorStop(0.5, colors.secondary);
        grad.addColorStop(1, colors.accent);
        ctx.strokeStyle = grad;
        ctx.shadowColor = colors.secondary;
        ctx.shadowBlur = 15;

        for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] / 128.0 - 1.0) * mult;
            const x = i * sliceWidth;
            const y = h / 2 + v * h * 0.35;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Center line
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.strokeStyle = colors.primary + '20';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 10]);
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Fill under waveform
        ctx.beginPath();
        for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] / 128.0 - 1.0) * mult;
            const x = i * sliceWidth;
            const y = h / 2 + v * h * 0.35;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h / 2);
        ctx.lineTo(0, h / 2);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, 0, w, 0);
        fillGrad.addColorStop(0, colors.primary + '15');
        fillGrad.addColorStop(0.5, colors.secondary + '10');
        fillGrad.addColorStop(1, colors.accent + '08');
        ctx.fillStyle = fillGrad;
        ctx.fill();
    }

    // ─── Mode: Circular ───
    function renderCircular(ctx, w, h, freqData) {
        const colors = getColors();
        const mult = sensitivityMultiplier();
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) * 0.25;
        const barCount = 128;
        const step = Math.floor(freqData.length / barCount);

        // Inner glow circle
        const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        innerGrad.addColorStop(0, colors.primary + '15');
        innerGrad.addColorStop(0.7, colors.secondary + '08');
        innerGrad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = innerGrad;
        ctx.fill();

        // Circle border
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = colors.primary + '40';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Spectrum bars radiating outward
        for (let i = 0; i < barCount; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += freqData[i * step + j];
            }
            const value = (sum / step / 255) * mult;
            const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
            const barLen = value * radius * 1.2;

            const x1 = cx + Math.cos(angle) * (radius + 4);
            const y1 = cy + Math.sin(angle) * (radius + 4);
            const x2 = cx + Math.cos(angle) * (radius + 4 + barLen);
            const y2 = cy + Math.sin(angle) * (radius + 4 + barLen);

            const t = i / barCount;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = Math.max(1.5, (w / barCount) * 0.5);

            if (state.colorScheme === 'Rainbow') {
                ctx.strokeStyle = hslColor(t * 360, 80, 55 + value * 20);
            } else {
                ctx.strokeStyle = lerpColor(colors.primary, colors.secondary, t);
            }

            ctx.shadowColor = lerpColor(colors.primary, colors.accent, t);
            ctx.shadowBlur = 6 + value * 15;
            ctx.stroke();
        }

        // Inner mirrored (shorter, dimmer)
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < barCount; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += freqData[i * step + j];
            }
            const value = (sum / step / 255) * mult;
            const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
            const barLen = value * radius * 0.4;

            const x1 = cx + Math.cos(angle) * (radius - 3);
            const y1 = cy + Math.sin(angle) * (radius - 3);
            const x2 = cx + Math.cos(angle) * (radius - 3 - barLen);
            const y2 = cy + Math.sin(angle) * (radius - 3 - barLen);

            const t = i / barCount;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = lerpColor(colors.secondary, colors.accent, t);
            ctx.shadowBlur = 4;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    // ─── Mode: Particles ───
    function renderParticles(ctx, w, h, freqData) {
        const colors = getColors();
        const mult = sensitivityMultiplier();

        // Get bass, mid, treble energy
        const bass = freqData.slice(0, 10).reduce((a, b) => a + b, 0) / 2550 * mult;
        const mid = freqData.slice(10, 80).reduce((a, b) => a + b, 0) / (70 * 255) * mult;
        const treble = freqData.slice(80, 180).reduce((a, b) => a + b, 0) / (100 * 255) * mult;
        const energy = (bass + mid + treble) / 3;

        if (state.particles.length === 0) initParticles(w, h);

        // Update & draw particles
        for (const p of state.particles) {
            // Movement affected by audio
            p.vx += (Math.random() - 0.5) * bass * 3;
            p.vy += (Math.random() - 0.5) * bass * 3;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.x += p.vx;
            p.y += p.vy;
            p.life += 0.003;

            // Wrap around
            if (p.x < 0) p.x = w;
            if (p.x > w) p.x = 0;
            if (p.y < 0) p.y = h;
            if (p.y > h) p.y = 0;

            const size = p.size * (1 + energy * 4);
            const alpha = 0.3 + energy * 0.7;

            // Color based on position and audio
            let color;
            if (state.colorScheme === 'Rainbow') {
                const hue = (p.hueOffset + p.life * 100) % 360;
                color = hslColor(hue, 80, 50 + energy * 30);
            } else {
                color = lerpColor(colors.primary, colors.secondary, (Math.sin(p.life * 2) + 1) / 2);
            }

            // Glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 10 + energy * 25;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        }

        // Draw connections between nearby particles
        ctx.shadowBlur = 0;
        const maxDist = 80 + energy * 60;
        for (let i = 0; i < state.particles.length; i++) {
            for (let j = i + 1; j < state.particles.length; j++) {
                const dx = state.particles[i].x - state.particles[j].x;
                const dy = state.particles[i].y - state.particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxDist) {
                    const alpha = (1 - dist / maxDist) * 0.25 * (0.3 + energy);
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    ctx.moveTo(state.particles[i].x, state.particles[i].y);
                    ctx.lineTo(state.particles[j].x, state.particles[j].y);
                    ctx.strokeStyle = colors.primary;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }

        ctx.globalAlpha = 1;
    }

    // ── Main Render Loop ───────────────────────────────────────
    function render() {
        state.animId = requestAnimationFrame(render);

        if (!state.visible || !state.ctx || !state.canvas) return;

        const ctx = state.ctx;
        const w = state.canvas.width;
        const h = state.canvas.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        const freqData = getFrequencyData();
        const timeData = getTimeDomainData();

        switch (state.mode) {
            case 'bars':
                renderBars(ctx, w, h, freqData);
                break;
            case 'waveform':
                renderWaveform(ctx, w, h, timeData);
                break;
            case 'circular':
                renderCircular(ctx, w, h, freqData);
                break;
            case 'particles':
                renderParticles(ctx, w, h, freqData);
                break;
        }
    }

    // ── UI Creation ────────────────────────────────────────────
    function loadCSS() {
        if (document.getElementById('visualizer-css')) return;
        const link = document.createElement('link');
        link.id = 'visualizer-css';
        link.rel = 'stylesheet';
        link.href = '/Visualizer/visualizer.css';
        document.head.appendChild(link);
    }

    function createUI() {
        if (state.ui) return;

        // Container
        const container = document.createElement('div');
        container.id = 'jf-visualizer-container';
        container.className = 'jf-viz-container';

        // Canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'jf-visualizer-canvas';
        canvas.className = 'jf-viz-canvas';
        container.appendChild(canvas);
        state.canvas = canvas;
        state.ctx = canvas.getContext('2d');

        // Controls overlay
        const controls = document.createElement('div');
        controls.className = 'jf-viz-controls';

        // Mode buttons
        const modeGroup = document.createElement('div');
        modeGroup.className = 'jf-viz-mode-group';

        MODES.forEach(mode => {
            const btn = document.createElement('button');
            btn.className = 'jf-viz-mode-btn' + (mode === state.mode ? ' active' : '');
            btn.dataset.mode = mode;
            btn.textContent = MODE_LABELS[mode];
            btn.addEventListener('click', () => {
                state.mode = mode;
                if (mode === 'particles') initParticles(state.canvas.width, state.canvas.height);
                modeGroup.querySelectorAll('.jf-viz-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            modeGroup.appendChild(btn);
        });

        controls.appendChild(modeGroup);

        // Color scheme selector
        const colorGroup = document.createElement('div');
        colorGroup.className = 'jf-viz-color-group';

        Object.keys(COLOR_SCHEMES).forEach(scheme => {
            const dot = document.createElement('button');
            dot.className = 'jf-viz-color-dot' + (scheme === state.colorScheme ? ' active' : '');
            dot.dataset.scheme = scheme;
            dot.title = scheme;
            const c = COLOR_SCHEMES[scheme];
            dot.style.background = `linear-gradient(135deg, ${c.primary}, ${c.secondary})`;
            dot.addEventListener('click', () => {
                state.colorScheme = scheme;
                colorGroup.querySelectorAll('.jf-viz-color-dot').forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
            });
            colorGroup.appendChild(dot);
        });

        controls.appendChild(colorGroup);

        container.appendChild(controls);

        // Toggle button (always visible near player)
        const toggle = document.createElement('button');
        toggle.id = 'jf-visualizer-toggle';
        toggle.className = 'jf-viz-toggle';
        toggle.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3v18M8 7v10M4 10v4M16 7v10M20 10v4"/></svg>`;
        toggle.title = 'Toggle Visualizer';
        toggle.addEventListener('click', () => {
            state.visible = !state.visible;
            container.classList.toggle('visible', state.visible);
            toggle.classList.toggle('active', state.visible);
            if (state.visible) {
                resizeCanvas();
                tryConnectAudio();
            }
        });

        document.body.appendChild(container);
        document.body.appendChild(toggle);

        state.ui = { container, toggle };
    }

    function resizeCanvas() {
        if (!state.canvas || !state.ui) return;
        const container = state.ui.container;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        state.canvas.width = rect.width * dpr;
        state.canvas.height = rect.height * dpr;
        state.ctx.scale(dpr, dpr);
        // Reset canvas CSS size
        state.canvas.style.width = rect.width + 'px';
        state.canvas.style.height = rect.height + 'px';
    }

    // ── Audio Element Discovery ────────────────────────────────
    function findAudioElement() {
        // Jellyfin uses an <audio> or <video> element for playback
        const audio = document.querySelector('audio');
        if (audio) return audio;

        // Some versions use a video element for audio too
        const video = document.querySelector('video');
        if (video) return video;

        return null;
    }

    function tryConnectAudio() {
        const audioEl = findAudioElement();
        if (audioEl && audioEl !== state.connectedAudio) {
            setupAudio(audioEl);
        }
    }

    // ── Player Detection ───────────────────────────────────────
    function isPlayerActive() {
        // Check if the now-playing bar is visible
        const nowPlaying = document.querySelector('.nowPlayingBar');
        if (nowPlaying && nowPlaying.offsetHeight > 0) return true;

        // Alternative: check for audio/video element with src
        const media = findAudioElement();
        if (media && media.src && !media.paused) return true;

        return false;
    }

    function updateToggleVisibility() {
        if (!state.ui) return;
        const active = isPlayerActive();
        state.ui.toggle.classList.toggle('player-active', active);

        if (!active && state.visible) {
            state.visible = false;
            state.ui.container.classList.remove('visible');
            state.ui.toggle.classList.remove('active');
        }
    }

    // ── Initialize ─────────────────────────────────────────────
    async function init() {
        console.log('[Visualizer] Initializing...');

        await loadConfig();

        if (!state.enabled) {
            console.log('[Visualizer] Disabled by config');
            return;
        }

        loadCSS();
        createUI();

        // Start render loop
        render();

        // Handle resize
        window.addEventListener('resize', () => {
            if (state.visible) resizeCanvas();
            if (state.particles.length > 0 && state.canvas) {
                initParticles(state.canvas.width, state.canvas.height);
            }
        });

        // Watch for player state changes
        setInterval(() => {
            updateToggleVisibility();
            if (state.visible) tryConnectAudio();
        }, 1000);

        // Also watch for DOM changes to detect new audio elements
        const observer = new MutationObserver(() => {
            updateToggleVisibility();
            if (state.visible) tryConnectAudio();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        console.log('[Visualizer] Ready');
    }

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Small delay to let Jellyfin's own scripts load first
        setTimeout(init, 1500);
    }
})();
