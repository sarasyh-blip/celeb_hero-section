(function () {
  'use strict';

  /* ─── 설정 ────────────────────────────────────────────────
     scrollSpeed   : 낮출수록 천천히 넘어감
     lerpFactor    : 낮출수록 부드럽게 따라옴 (smooth scroll)
     parallaxMin/Max: 타일 크기별 퍼짐 배율 (큰 타일 = 더 넓게 퍼짐)
     marqueeSpeed  : 마키 흐르는 속도 (px/s)
     marqueeSlideOver: 마키 슬라이드 아웃 완료 progress 구간
  ─────────────────────────────────────────────────────────── */
  const CONFIG = {
    imagePathPattern:    './images/idols/{n}.jpg',
    imageCountPerGroup:  [17, 17, 16],

    tileSizeMin:  80,
    tileSizeMax:  280,

    stageBoundsW:        0.86,
    stageBoundsH:        0.88,
    centerExclusionW:    720,
    centerExclusionH:    240,
    overlapPaddingFactor: 1.30,
    maxSamplingAttempts: 14000,

    parallaxMin: 1.0,
    parallaxMax: 1.28,

    scrollSpeed:       0.0004,
    lerpFactor:        0.062,
    marqueeSpeed:      80,    // px/s
    marqueeSlideOver:  0.06,  // 이 progress까지 행이 슬라이드 아웃 완료
  };

  /* ─── 엘리먼트 ────────────────────────────────────────── */
  const root           = document.querySelector('.cpm-hero');
  if (!root) return;

  const stage          = document.getElementById('cpm-stage');
  const gridEl         = root.querySelector('.cpm-hero__grid');
  const progressWrapEl = document.getElementById('cpm-progress');
  const finalEl        = document.getElementById('cpm-final');
  const line1El        = document.getElementById('cpm-line1');
  const line2El        = document.getElementById('cpm-line2');
  const scrollIndEl    = document.getElementById('cpm-scroll-indicator');
  const marqueeEl      = document.getElementById('cpm-marquee');
  const progressFills  = root.querySelectorAll('.cpm-hero__progress-fill');
  const questions      = root.querySelectorAll('.cpm-hero__question');

  /* ─── 유틸 ────────────────────────────────────────────── */
  const clamp    = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut  = t => 1 - Math.pow(1 - t, 3);
  const easeIn   = t => t * t * t;
  const easeInOut = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;

  /* ─── 마키 (JS 구동) ─────────────────────────────────────
     행 컨테이너가 마키 방향으로 슬라이드 아웃 → 검은 공간이 열리는 효과
     내부 트랙은 계속 무한 루핑 → 무한 루프처럼 보임
  ─────────────────────────────────────────────────────────── */
  const marqueeState = [];  // { track, rowEl, offset, dir, singleW }
  let _lastTs = 0;

  function buildMarquee() {
    if (!marqueeEl) return;
    marqueeEl.innerHTML = '';
    marqueeState.length = 0;

    const ROW_GAP  = 20;   // 열과 열 사이 (CSS gap과 동일)
    const ITEM_GAP = 5;    // 이미지와 이미지 사이 (CSS gap과 동일)
    const rowH = (window.innerHeight - ROW_GAP * 2) / 3;
    const groups = [
      { start: 1,  count: 17, reverse: false },
      { start: 18, count: 17, reverse: true  },
      { start: 35, count: 16, reverse: false },
    ];

    groups.forEach(({ start, count, reverse }) => {
      const row   = document.createElement('div');
      row.className = 'cpm-hero__marquee-row';

      const track = document.createElement('div');
      track.className = 'cpm-hero__marquee-track';

      // 이미지 2벌 복제 → 끊김 없는 루프
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < count; i++) {
          const n    = start + i;
          const item = document.createElement('div');
          item.className    = 'cpm-hero__marquee-item';
          item.style.width  = rowH + 'px';
          item.style.height = rowH + 'px';
          const img    = document.createElement('img');
          img.src      = CONFIG.imagePathPattern.replace('{n}', String(n).padStart(2, '0'));
          img.alt      = '';
          img.loading  = 'eager';
          img.decoding = 'async';
          item.appendChild(img);
          track.appendChild(item);
        }
      }

      // gap이 있으면 한 아이템이 차지하는 '주기' = rowH + ITEM_GAP
      const singleW = count * (rowH + ITEM_GAP);
      const dir     = reverse ? 1 : -1;  // -1 = 왼쪽, +1 = 오른쪽
      const offset  = reverse ? -singleW : 0;
      track.style.transform = `translateX(${offset}px)`;

      row.appendChild(track);
      marqueeEl.appendChild(row);
      marqueeState.push({ track, rowEl: row, offset, dir, singleW });
    });
  }

  function updateMarquee(dt, progress) {
    if (!marqueeEl || marqueeState.length === 0) return;

    const slideT = easeIn(clamp(progress / CONFIG.marqueeSlideOver, 0, 1));
    const vw     = window.innerWidth;

    marqueeState.forEach(row => {
      // 내부 트랙: 일정 속도로 루핑 (무한 루프)
      row.offset += row.dir * CONFIG.marqueeSpeed * dt;
      if (row.dir < 0 && row.offset < -row.singleW) row.offset += row.singleW;
      if (row.dir > 0 && row.offset >  0)           row.offset -= row.singleW;
      row.track.style.transform = `translateX(${row.offset}px)`;

      // 행 컨테이너: 마키 방향으로 슬라이드 아웃 → 뒤 검은 공간이 열림
      const slideX = row.dir * slideT * (vw * 1.15);
      row.rowEl.style.transform = `translateX(${slideX}px)`;
    });
  }

  /* ─── 타일 위치 생성 ────────────────────────────────────── */
  function generateTilePositions(count, vw, vh) {
    const boundsW  = vw * CONFIG.stageBoundsW;
    const boundsH  = vh * CONFIG.stageBoundsH;
    const cW = CONFIG.centerExclusionW, cH = CONFIG.centerExclusionH;
    const MARGIN_X = 44;
    const positions = [];
    let attempts    = 0;

    const toEffective = (x, y, size) => {
      const r  = (size - CONFIG.tileSizeMin) / (CONFIG.tileSizeMax - CONFIG.tileSizeMin);
      const pf = CONFIG.parallaxMin + r * (CONFIG.parallaxMax - CONFIG.parallaxMin);
      const h  = size / 2;
      return {
        ex: clamp(x * pf, -(vw/2 - h - MARGIN_X), vw/2 - h - MARGIN_X),
        ey: clamp(y * pf, -(vh/2 - h),             vh/2 - h),
      };
    };

    const tryPlace = (pad) => {
      while (positions.length < count && attempts < CONFIG.maxSamplingAttempts) {
        attempts++;
        const sizeT = Math.pow(Math.random(), 1.5);
        const size  = CONFIG.tileSizeMin + sizeT * (CONFIG.tileSizeMax - CONFIG.tileSizeMin);
        const half  = size / 2;
        const x     = (Math.random() - 0.5) * (boundsW - size);
        const y     = (Math.random() - 0.5) * (boundsH - size);

        if (Math.abs(x) < cW/2 + half && Math.abs(y) < cH/2 + half) continue;

        const { ex, ey } = toEffective(x, y, size);

        let overlap = false;
        for (const p of positions) {
          const adx = Math.abs(ex - p.ex), ady = Math.abs(ey - p.ey);
          const minD = (half + p.size / 2) * pad;
          if (adx < minD && ady < minD) { overlap = true; break; }
        }
        if (!overlap) positions.push({ x, y, size, ex, ey });
      }
    };

    tryPlace(CONFIG.overlapPaddingFactor);
    if (positions.length < count) tryPlace(1.02);
    return positions;
  }

  /* ─── 타일 생성 ────────────────────────────────────────── */
  const tiles = [];

  function buildTiles() {
    stage.innerHTML = '';
    tiles.length    = 0;
    let imgIdx      = 0;
    const vw        = window.innerWidth;
    const vh        = window.innerHeight;

    CONFIG.imageCountPerGroup.forEach((count, groupIdx) => {
      const positions = generateTilePositions(count, vw, vh);

      const order = Array.from({ length: count }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }

      positions.slice(0, count).forEach((pos, i) => {
        imgIdx++;
        const SIZE_CAP = { 37: 130 };
        const tileSize = SIZE_CAP[imgIdx] ? Math.min(pos.size, SIZE_CAP[imgIdx]) : pos.size;

        const tile = document.createElement('div');
        tile.className    = 'cpm-hero__tile';
        tile.style.width  = tileSize + 'px';
        tile.style.height = tileSize + 'px';

        const img     = document.createElement('img');
        img.src       = CONFIG.imagePathPattern.replace('{n}', String(imgIdx).padStart(2, '0'));
        img.alt       = '';
        img.loading   = 'eager';
        img.decoding  = 'async';
        tile.appendChild(img);
        stage.appendChild(tile);

        const sizeRatio       = (tileSize - CONFIG.tileSizeMin) / (CONFIG.tileSizeMax - CONFIG.tileSizeMin);
        const parallaxFactor  = CONFIG.parallaxMin + sizeRatio * (CONFIG.parallaxMax - CONFIG.parallaxMin);
        const halfTile        = tileSize / 2;
        const marginX         = 44;
        const effectiveFinalX = clamp(pos.x * parallaxFactor, -(vw/2 - halfTile - marginX), vw/2 - halfTile - marginX);
        const effectiveFinalY = clamp(pos.y * parallaxFactor, -(vh/2 - halfTile), vh/2 - halfTile);

        tiles.push({
          el: tile,
          group: groupIdx,
          size: tileSize,
          launchOrder: order.indexOf(i) / Math.max(1, count - 1),
          effectiveFinalX,
          effectiveFinalY,
        });
      });
    });
  }

  /* ─── 파이널 타이포 ─────────────────────────────────────── */
  const LINE1_TEXT = '셀럽의 모든 데이터를 지금 바로 확인해보세요';
  const LINE2_TEXT = 'Celeb power metric';

  function buildSlideUpLine(el, text, weightBreaks) {
    el.innerHTML = '';
    const chars = [];
    [...text].forEach((ch, idx) => {
      const mask  = document.createElement('span');
      mask.className = 'cpm-hero__char-mask';
      if (weightBreaks) {
        for (const [from, w] of weightBreaks) {
          if (idx >= from) mask.style.fontWeight = w;
        }
      }
      const inner = document.createElement('span');
      inner.textContent = ch === ' ' ? ' ' : ch;
      mask.appendChild(inner);
      el.appendChild(mask);
      chars.push({ inner, startOrder: Math.random() });
    });
    return chars;
  }

  function updateSlideUpLine(chars, p) {
    chars.forEach(c => {
      const localT = clamp((p - c.startOrder * 0.55) / 0.45, 0, 1);
      c.inner.style.transform = `translateY(${(1 - easeInOut(localT)) * 100}%)`;
    });
  }

  /* ─── 타일 변환 계산 ─────────────────────────────────────── */
  function computeTileTransform(t, local) {
    const fx = t.effectiveFinalX;
    const fy = t.effectiveFinalY;

    if (local <= 0 || local >= 1) return { x: 0, y: 0, scale: 0.1, opacity: 0 };

    if (local < 0.40) {
      const tileT = clamp((local - t.launchOrder * 0.20) / 0.20, 0, 1);
      const e     = easeOut(tileT);
      return { x: fx * e, y: fy * e, scale: 0.1 + e * 0.9, opacity: clamp(tileT * 2, 0, 1) };
    }

    if (local < 0.62) {
      return { x: fx, y: fy, scale: 1, opacity: 1 };
    }

    const tileStart = 0.62 + (1 - t.launchOrder) * 0.12;
    const tileT     = clamp((local - tileStart) / 0.10, 0, 1);
    const e         = easeIn(tileT);
    return { x: fx * (1-e), y: fy * (1-e), scale: 1 - e * 0.9, opacity: 1 - e };
  }

  function computeQuestionOpacity(local) {
    if (local < 0.35 || local > 0.78) return 0;
    if (local < 0.50) return easeOut((local - 0.35) / 0.15);
    if (local < 0.62) return 1;
    return 1 - easeIn((local - 0.62) / 0.16);
  }

  /* ─── 씬 업데이트 ────────────────────────────────────────── */
  function updateScene(progress) {
    gridEl.style.opacity         = (Math.min(0.15, easeOut(clamp(progress * 6, 0, 1)) * 0.15)).toFixed(3);
    progressWrapEl.style.opacity = progress > 0.02 ? '1' : '0';

    progressFills.forEach((fill, i) => {
      const s = i * 0.25, e = (i + 1) * 0.25;
      fill.style.transform = `scaleX(${clamp((progress - s) / (e - s), 0, 1)})`;
    });

    for (let g = 0; g < 3; g++) {
      const segStart = g * 0.25;
      const segEnd   = (g + 1) * 0.25;
      const local    = (progress - segStart) / (segEnd - segStart);

      const qOp = computeQuestionOpacity(local);
      questions[g].style.opacity = qOp;
      questions[g].querySelector('.cpm-hero__q-inner').style.transform =
        `translateY(${(1 - qOp) * 16}px)`;

      tiles.forEach(t => {
        if (t.group !== g) return;
        const s = computeTileTransform(t, local);
        t.el.style.opacity   = s.opacity;
        t.el.style.transform =
          `translate(calc(-50% + ${s.x}px), calc(-50% + ${s.y}px)) scale(${s.scale})`;
      });
    }

    if (progress >= 0.73) {
      const f4 = clamp((progress - 0.75) / 0.25, 0, 1);
      finalEl.style.opacity = clamp((progress - 0.73) / 0.04, 0, 1);
      updateSlideUpLine(line1Chars, clamp(f4 / 0.55, 0, 1));
      updateSlideUpLine(line2Chars, clamp((f4 - 0.25) / 0.60, 0, 1));

      if (f4 > 0.82) {
        scrollIndEl.style.opacity   = '1';
        scrollIndEl.style.transform = 'translateX(-50%) translateY(0)';
        finalEl.classList.add('is-visible');
      } else {
        scrollIndEl.style.opacity   = '0';
        scrollIndEl.style.transform = 'translateX(-50%) translateY(20px)';
        finalEl.classList.remove('is-visible');
      }
    } else {
      finalEl.style.opacity = '0';
      updateSlideUpLine(line1Chars, 0);
      updateSlideUpLine(line2Chars, 0);
      scrollIndEl.style.opacity   = '0';
      finalEl.classList.remove('is-visible');
    }
  }

  /* ─── 스크롤 하이재킹 ────────────────────────────────────── */
  let targetProgress  = 0;
  let currentProgress = 0;

  window.addEventListener('wheel', e => {
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 30;
    if (e.deltaMode === 2) delta *= 400;
    delta = Math.sign(delta) * Math.min(Math.abs(delta), 80);
    targetProgress = clamp(targetProgress + delta * CONFIG.scrollSpeed, 0, 1);
  }, { passive: false });

  let touchY = 0;
  window.addEventListener('touchstart', e => {
    touchY = e.touches[0].clientY;
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    e.preventDefault();
    const dy = touchY - e.touches[0].clientY;
    touchY   = e.touches[0].clientY;
    targetProgress = clamp(targetProgress + dy * CONFIG.scrollSpeed * 2.5, 0, 1);
  }, { passive: false });

  window.addEventListener('keydown', e => {
    const step = 0.06;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      targetProgress = clamp(targetProgress + step, 0, 1);
    } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      targetProgress = clamp(targetProgress - step, 0, 1);
    }
  });

  /* ─── 애니메이션 루프 ──────────────────────────────────── */
  function tick(ts) {
    const dt = _lastTs > 0 ? Math.min((ts - _lastTs) / 1000, 0.05) : 0;
    _lastTs = ts;

    updateMarquee(dt, currentProgress);

    const diff = targetProgress - currentProgress;
    if (Math.abs(diff) > 0.00005) {
      currentProgress += diff * CONFIG.lerpFactor;
    }
    updateScene(currentProgress);
    requestAnimationFrame(tick);
  }

  /* ─── 1·2·3컷 랜덤 카피 로드 ───────────────────────────── */
  async function loadRandomCopy() {
    try {
      const res  = await fetch('./copy/copy.txt');
      const text = await res.text();

      // "1. 텍스트" 형식에서 번호 제거 후 배열로
      const lines = text.split('\n')
        .map(l => l.replace(/^\d+\.\s*/, '').trim())
        .filter(l => l.length > 0);

      if (lines.length < 3) return;

      // 겹치지 않는 3개 랜덤 선택 (Fisher-Yates shuffle 앞 3개)
      const idx = Array.from({ length: lines.length }, (_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      const [i1, i2, i3] = idx;

      // 2줄 고정: 각 줄을 nowrap으로 감싸 추가 줄바꿈 방지
      const wrapTwo = (l1, l2) =>
        `<span style="white-space:nowrap">${l1}</span><br>` +
        `<span style="white-space:nowrap">${l2}</span>`;

      const fmt = s => {
        if (s.includes(',')) {
          const cut = s.indexOf(',') + 1;
          return wrapTwo(s.slice(0, cut), s.slice(cut).trim());
        }
        const mid   = Math.ceil(s.length / 2);
        const left  = s.lastIndexOf(' ', mid);
        const right  = s.indexOf(' ', mid);
        if (left === -1 && right === -1) return s;
        let cut;
        if (left === -1)                       cut = right;
        else if (right === -1)                 cut = left;
        else cut = (mid - left < right - mid) ? left : right;
        return wrapTwo(s.slice(0, cut), s.slice(cut + 1));
      };

      questions[0].querySelector('.cpm-hero__q-text').innerHTML = fmt(lines[i1]);
      questions[1].querySelector('.cpm-hero__q-text').innerHTML = fmt(lines[i2]);
      questions[2].querySelector('.cpm-hero__q-text').innerHTML = fmt(lines[i3]);
    } catch (e) {
      // 로드 실패 시 HTML 기본값 유지
    }
  }

  /* ─── 초기화 ──────────────────────────────────────────── */
  let line1Chars, line2Chars;

  async function init() {
    await loadRandomCopy();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (marqueeEl) marqueeEl.style.display = 'none';
      updateScene(1);
      return;
    }
    buildMarquee();
    buildTiles();
    line1Chars = buildSlideUpLine(line1El, LINE1_TEXT);
    line2Chars = buildSlideUpLine(line2El, LINE2_TEXT, [[0, '700'], [12, '300']]);
    updateScene(0);
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => {
    clearTimeout(window._cpmResizeTimer);
    window._cpmResizeTimer = setTimeout(() => { buildMarquee(); buildTiles(); }, 200);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
