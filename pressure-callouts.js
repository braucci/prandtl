const NS = 'http://www.w3.org/2000/svg';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const box = (x, y, w, h, gap = 0) => ({ left: x - w / 2 - gap, right: x + w / 2 + gap, top: y - h / 2 - gap, bottom: y + h / 2 + gap });

// Anatomical labels belong to two faces of one section, never to two semiwings.
export class PressureCallouts {
  constructor(container) {
    this.container = container; this.items = new Map();
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.id = 'pressure-leaders'; this.svg.setAttribute('aria-hidden', 'true');
    container.prepend(this.svg);
  }
  _item(id) {
    if (this.items.has(id)) return this.items.get(id);
    const element = document.createElement('div');
    element.className = 'scene-label pressure-label';
    const badge = document.createElement('span'); badge.className = 'pressure-label-badge';
    const copy = document.createElement('span'); copy.className = 'pressure-label-copy';
    const title = document.createElement('strong'), detail = document.createElement('small');
    const hidden = document.createElement('span'); hidden.className = 'pressure-label-hidden';
    copy.append(title, detail, hidden); element.append(badge, copy);
    const group = document.createElementNS(NS, 'g');
    const path = document.createElementNS(NS, 'path');
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', '3.5');
    group.append(path, dot); this.svg.append(group); this.container.append(element);
    const item = { element, badge, title, detail, hidden, group, path, dot, previous: null };
    this.items.set(id, item); return item;
  }
  update(labels, { width, height, exclusions = [] }) {
    this.svg.setAttribute('viewBox', `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`);
    const visible = [];
    for (const item of this.items.values()) { item.element.hidden = true; item.group.style.display = 'none'; }
    for (const label of labels) {
      if (!label.visible || !Number.isFinite(label.anchorX) || !Number.isFinite(label.anchorY)) continue;
      const item = this._item(label.id), role = label.surface === 'upper' ? 'pressure-low' : 'pressure-high';
      item.element.className = `scene-label pressure-label kind-${role}`;
      item.element.classList.toggle('has-occlusion', label.hiddenSurface);
      item.badge.textContent = label.badge; item.title.textContent = label.text; item.detail.textContent = label.detail;
      item.hidden.textContent = 'Superficie nascosta in questa vista';
      item.hidden.hidden = !label.hiddenSurface;
      item.element.hidden = false; item.group.style.display = '';
      item.path.setAttribute('class', `pressure-leader ${role}${label.hiddenSurface ? ' has-occlusion' : ''}`);
      item.dot.setAttribute('class', `pressure-anchor ${role}${label.hiddenSurface ? ' has-occlusion' : ''}`);
      item.dot.setAttribute('cx', label.anchorX); item.dot.setAttribute('cy', label.anchorY);
      const w = item.element.offsetWidth, h = item.element.offsetHeight;
      const dx = label.x - label.anchorX, dy = label.y - label.anchorY, len = Math.hypot(dx, dy);
      const preferred = len > 1 ? [dx / len, dy / len] : [0, label.surface === 'upper' ? -1 : 1];
      const directions = [preferred, [0, -1], [0, 1], [1, 0], [-1, 0], [.8, -.6], [-.8, -.6], [.8, .6], [-.8, .6]];
      const candidates = [];
      for (const [nx, ny] of directions) for (const distance of [44, 88, 140]) {
        const radius = distance + Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2;
        const x = clamp(label.anchorX + nx * radius, w / 2 + 12, width - w / 2 - 12);
        const y = clamp(label.anchorY + ny * radius, h / 2 + 12, height - h / 2 - 12);
        const rect = box(x, y, w, h, 7);
        const blocked = exclusions.reduce((sum, exclusion) => sum + overlap(rect, exclusion), 0);
        const distanceCost = Math.hypot(x - label.anchorX, y - label.anchorY);
        const alignmentCost = (1 - nx * preferred[0] - ny * preferred[1]) * 42;
        const continuity = item.previous ? Math.hypot(x - item.previous.x, y - item.previous.y) * .08 : 0;
        const onAnchor = label.anchorX > rect.left && label.anchorX < rect.right && label.anchorY > rect.top && label.anchorY < rect.bottom;
        candidates.push({ x, y, w, h, rect, score: blocked * 6 + distanceCost + alignmentCost + continuity + (onAnchor ? 100000 : 0) });
      }
      candidates.sort((a, b) => a.score - b.score);
      visible.push({ label, item, candidates });
    }
    if (!visible.length) return [];
    let chosen = visible.map(v => v.candidates[0]);
    if (visible.length === 2) {
      let best = Infinity;
      for (const a of visible[0].candidates) for (const b of visible[1].candidates) {
        const score = a.score + b.score + overlap(a.rect, b.rect) * 20;
        if (score < best) { best = score; chosen = [a, b]; }
      }
    }
    return visible.map(({ label, item }, i) => {
      const p = chosen[i]; item.previous = p;
      item.element.style.left = `${p.x}px`; item.element.style.top = `${p.y}px`;
      const dx = label.anchorX - p.x, dy = label.anchorY - p.y;
      const factor = Math.min(1, p.w / (2 * Math.max(.001, Math.abs(dx))), p.h / (2 * Math.max(.001, Math.abs(dy))));
      const ex = p.x + dx * factor, ey = p.y + dy * factor;
      const bendX = Math.abs(dx) > Math.abs(dy) ? (label.anchorX + ex) / 2 : ex;
      const bendY = Math.abs(dx) > Math.abs(dy) ? ey : (label.anchorY + ey) / 2;
      item.path.setAttribute('d', `M ${label.anchorX} ${label.anchorY} L ${bendX} ${bendY} L ${ex} ${ey}`);
      return p.rect;
    });
  }
}
