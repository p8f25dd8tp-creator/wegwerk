// Oberfläche als DOM über dem Canvas.
import type { Card, Game, Tower, TowerType } from '../sim/game';
import { TOWERS } from '../sim/game';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

const TURN_NAMES: Record<number, string> = { 0: 'Gerade', 1: 'Kurve', [-1]: 'Kurve', 2: 'Kehre', [-2]: 'Kehre' };
const PERKS: Record<Card['feature'], string> = {
  none: 'Nur Weg',
  forest: 'Wald: Türme daneben schießen schneller',
  mountain: 'Berg: Türme daneben reichen weiter',
  gold: 'Vorräte: +30 Gold',
};

const TOWER_INFO: Record<TowerType, { name: string; desc: string }> = {
  archer: { name: 'Bogenturm', desc: 'Schnelle Pfeile auf ein Ziel' },
  catapult: { name: 'Katapult', desc: 'Langsam, trifft ganze Gruppen' },
};

export class Hud {
  onMute: () => void = () => {};
  private bottom = $('#bottom');
  private shown = { lives: -1, gold: -1, wave: -1 };
  private displayedGold = 0;
  private pendingGold = 0;
  private floats = 0;
  /** Erhöht sich bei jedem Neustart, damit alte Münzflüge nichts mehr verbuchen */
  private generation = 0;

  constructor() {
    $('#mute').addEventListener('click', () => this.onMute());
  }

  reset(): void {
    this.shown = { lives: -1, gold: -1, wave: -1 };
    this.pendingGold = 0;
    this.displayedGold = 0;
    this.generation++;
    document.querySelectorAll('.fly-coin').forEach((c) => c.remove());
    document.querySelectorAll('.overlay').forEach((o) => o.remove());
  }

  setMuted(m: boolean): void {
    $('#mute').textContent = m ? '🔇' : '🔊';
  }

  stats(g: Game): void {
    // Gold aus fliegenden Münzen erst bei Ankunft zählen
    const gold = g.gold - this.pendingGold;
    if (gold !== this.shown.gold) {
      $('#gold b').textContent = String(gold);
      this.shown.gold = gold;
      this.displayedGold = gold;
    }
    if (g.lives !== this.shown.lives) {
      $('#lives b').textContent = String(g.lives);
      if (this.shown.lives !== -1) this.bump('#lives');
      this.shown.lives = g.lives;
    }
    const w = Math.max(1, g.wave);
    if (w !== this.shown.wave) {
      $('#wave b').textContent = String(w);
      this.shown.wave = w;
    }
  }

  private bump(sel: string): void {
    const el = $(sel);
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  shake(sel: string): void {
    const el = $(sel);
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 220 },
    );
  }

  draft(cards: Card[], imgs: string[], pick: (i: number) => void, selected: number, wave: number): void {
    this.bottom.innerHTML = '';
    const panel = el('div', 'panel');
    panel.append(el('h2', '', `Wegstück für Welle ${wave} wählen`));
    const row = el('div', 'cards');
    cards.forEach((c, i) => {
      const card = el('div', 'card' + (i === selected ? ' sel' : ''));
      const img = document.createElement('img');
      img.src = imgs[i];
      card.append(img, el('div', 'name', TURN_NAMES[c.turn]), el('div', 'perk', PERKS[c.feature]));
      card.addEventListener('click', () => pick(i));
      row.append(card);
    });
    panel.append(row);
    panel.append(el('div', 'hint', 'Antippen zeigt die Vorschau, nochmal tippen legt an'));
    this.bottom.append(panel);
  }

  markCard(i: number): void {
    this.bottom.querySelectorAll('.card').forEach((c, j) => c.classList.toggle('sel', i === j));
    const hint = this.bottom.querySelector('.hint');
    if (hint) hint.textContent = 'Nochmal tippen zum Anlegen';
  }

  buildPhase(wave: number, firstTime: boolean, start: () => void): void {
    this.bottom.innerHTML = '';
    if (firstTime) this.bottom.append(el('div', 'status', 'Tippe auf ein Grasfeld, um einen Turm zu bauen'));
    const btn = el('button', 'btn go', `Welle ${wave} starten ⚔`) as HTMLButtonElement;
    btn.addEventListener('click', start);
    const wrap = el('div', 'panel');
    wrap.style.padding = '8px';
    wrap.append(btn);
    this.bottom.append(wrap);
  }

  wavePhase(wave: number): void {
    this.bottom.innerHTML = '';
    this.bottom.append(el('div', 'status', `Welle ${wave} läuft · Bauen geht weiter`));
  }

  buildMenu(
    gold: number,
    bonus: { range: number; rate: number },
    thumbs: Record<TowerType, string>,
    build: (t: TowerType) => void,
    preview: (t: TowerType) => void,
    close: () => void,
  ): void {
    this.bottom.innerHTML = '';
    const panel = el('div', 'panel');
    const head = el('div', 'row');
    let title = 'Turm bauen';
    if (bonus.rate > 0) title += ` · Wald +${Math.round(bonus.rate * 100)}% Tempo`;
    if (bonus.range > 0) title += ` · Berg +Reichweite`;
    head.append(el('h2', '', title));
    const x = el('button', 'x', '✕');
    x.addEventListener('click', close);
    head.append(x);
    panel.append(head);
    const row = el('div', 'towers');
    for (const type of ['archer', 'catapult'] as const) {
      const st = TOWERS[type];
      const b = el('button', 'tower-opt' + (gold < st.cost ? ' poor' : ''));
      const img = document.createElement('img');
      img.src = thumbs[type];
      const cost = el('div', 'cost');
      cost.append(el('span', 'ico coin'), document.createTextNode(String(st.cost)));
      b.append(img, el('div', 'name', TOWER_INFO[type].name), el('div', 'desc', TOWER_INFO[type].desc), cost);
      b.addEventListener('pointerenter', () => preview(type));
      b.addEventListener('click', () => build(type));
      row.append(b);
    }
    panel.append(row);
    this.bottom.append(panel);
  }

  towerInfo(t: Tower, stats: { range: number; cooldown: number }, thumb: string, close: () => void): void {
    this.bottom.innerHTML = '';
    const panel = el('div', 'panel');
    const head = el('div', 'row');
    head.append(el('h2', '', TOWER_INFO[t.type].name));
    const x = el('button', 'x', '✕');
    x.addEventListener('click', close);
    head.append(x);
    panel.append(head);
    const body = el('div', 'towers');
    const img = document.createElement('img');
    img.src = thumb;
    img.style.cssText = 'width:64px;height:64px;object-fit:contain';
    const lines = [
      `Reichweite ${stats.range.toFixed(1)}`,
      `${(1 / stats.cooldown).toFixed(1)} Schuss/s`,
      t.rateBonus > 0 ? `Wald: +${Math.round(t.rateBonus * 100)}% Tempo` : '',
      t.rangeBonus > 0 ? `Berg: +${t.rangeBonus.toFixed(1)} Reichweite` : '',
    ].filter(Boolean);
    const txt = el('div', 'hint', lines.join(' · '));
    txt.style.textAlign = 'left';
    body.append(img, txt);
    body.style.alignItems = 'center';
    panel.append(body);
    this.bottom.append(panel);
  }

  banner(title: string, sub: string): void {
    const b = $('#banner');
    b.innerHTML = '';
    b.append(document.createTextNode(title), el('small', '', sub));
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  floatText(pos: { x: number; y: number }, text: string, cls: string): void {
    if (this.floats > 40) return;
    const d = el('div', 'dmg ' + cls, text);
    d.style.left = `${pos.x + (Math.random() - 0.5) * 16}px`;
    d.style.top = `${pos.y}px`;
    $('#float').append(d);
    this.floats++;
    d.addEventListener('animationend', () => {
      d.remove();
      this.floats--;
    });
  }

  /** Münzen fliegen von der Kill-Stelle zur Goldanzeige */
  flyCoins(from: { x: number; y: number }, amount: number, onArrive: () => void): void {
    const target = $('#gold .ico').getBoundingClientRect();
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    const n = Math.min(5, Math.max(1, Math.round(amount / 3)));
    const gen = this.generation;
    this.pendingGold += amount;
    for (let i = 0; i < n; i++) {
      const c = el('div', 'fly-coin ico coin');
      const sx = from.x + (Math.random() - 0.5) * 30;
      const sy = from.y + (Math.random() - 0.5) * 20;
      c.style.transform = `translate(${sx}px, ${sy}px) scale(0.6)`;
      $('#float').append(c);
      const delay = 60 + i * 70;
      setTimeout(() => {
        c.style.transform = `translate(${tx}px, ${ty}px) scale(1)`;
      }, delay);
      setTimeout(() => {
        c.remove();
        if (i === n - 1 && gen === this.generation) {
          this.pendingGold -= amount;
          this.displayedGold += amount;
          $('#gold b').textContent = String(this.displayedGold);
          this.shown.gold = this.displayedGold;
          this.bump('#gold');
          onArrive();
        }
      }, delay + 660);
    }
  }

  hurt(): void {
    const h = $('#hurt');
    h.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => h.classList.remove('on')));
  }

  gameOver(wave: number, restart: () => void): void {
    this.bottom.innerHTML = '';
    const o = el('div', 'overlay');
    const p = el('div', 'panel');
    p.append(el('h1', '', 'Die Burg ist gefallen'), el('p', '', `Du hast ${wave - 1} ${wave - 1 === 1 ? 'Welle' : 'Wellen'} überstanden.`));
    const b = el('button', 'btn', 'Neue Insel');
    b.addEventListener('click', () => {
      o.remove();
      restart();
    });
    p.append(b);
    o.append(p);
    document.body.append(o);
  }
}

function el(tag: string, cls = '', text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
