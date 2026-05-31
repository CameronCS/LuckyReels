import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { HubService } from '../../services/hub.service';
import { AuthService } from '../../services/auth.service';

const ROWS = 8, SLOTS = 9;
const MULTIPLIERS: Record<string, number[]> = {
  low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
  medium: [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13 ],
  high:   [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29 ],
};

@Component({
  selector: 'app-plinko',
  templateUrl: './plinko.component.html',
  styleUrl: './plinko.component.css',
  standalone: false
})
export class PlinkoComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;
  @ViewChild('plinkoCanvas') plinkoCanvasRef!: ElementRef<HTMLCanvasElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  bet = 10;
  activeBet = 10;
  customBet = '';
  risk: 'low' | 'medium' | 'high' = 'medium';
  dropping = false;
  resultText = '';
  resultCls = 'result-overlay hidden';

  presetBets = [10, 25, 50, 100, 250, 500];
  riskOptions: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private subs = new Subscription();

  constructor(
    private hub: HubService,
    private auth: AuthService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.userName = auth.getUserName();
  }

  ngOnInit(): void {
    this.subs.add(this.hub.balance$.subscribe(b => { this.tokens = b; }));

    this.subs.add(this.hub.plinkoResult$.subscribe(result => {
      this.ngZone.run(() => {
        this.tokens = result.newBalance;
        this.hub.balance$.next(result.newBalance);
        this.ngZone.runOutsideAngular(() => this.animate(result.path, result.slot, result.multiplier, result.net));
      });
    }));

    this.subs.add(this.hub.hubError$.subscribe(msg => {
      this.ngZone.run(() => {
        this.dropping = false;
        this.showResult(msg, false);
      });
    }));
  }

  ngAfterViewInit(): void {
    const el = this.starsEl?.nativeElement;
    if (el) {
      for (let i = 0; i < 80; i++) {
        const s = document.createElement('div'); s.className = 'star';
        const sz = Math.random() * 2 + 1;
        s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${2+Math.random()*4}s;--o:${0.2+Math.random()*0.5};animation-delay:${Math.random()*4}s`;
        el.appendChild(s);
      }
    }
    this.canvas = this.plinkoCanvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.initCanvas();
    this.drawIdleBoard();
    window.addEventListener('resize', () => { this.initCanvas(); if (!this.dropping) this.drawIdleBoard(); });
  }

  setBet(amount: number): void {
    if (this.dropping) return;
    this.bet = amount; this.activeBet = amount; this.customBet = '';
  }

  onCustomBet(): void {
    if (this.dropping) return;
    const v = parseInt(this.customBet);
    if (v && v >= 10) { this.bet = v; this.activeBet = -1; }
  }

  setRisk(r: 'low' | 'medium' | 'high'): void {
    if (this.dropping) return;
    this.risk = r;
    this.drawIdleBoard();
  }

  drop(): void {
    if (this.dropping || this.tokens < this.bet) return;
    this.dropping = true;
    this.hub.dropPlinko(this.bet, this.risk).catch(() => { this.dropping = false; });
  }

  get canDrop(): boolean { return !this.dropping && this.tokens >= this.bet; }

  private initCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.offsetWidth, h = this.canvas.offsetHeight;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private metrics() {
    const W = this.canvas.offsetWidth, H = this.canvas.offsetHeight;
    const padX = 14, s = (W - 2 * padX) / SLOTS;
    const topPad = 36, slotH = Math.min(44, H * 0.12);
    const rowH = (H - topPad - slotH - 10) / (ROWS + 0.5);
    const boardTop = topPad + rowH * 0.5;
    const slotsY = boardTop + ROWS * rowH;
    return { W, H, s, padX, topPad, rowH, boardTop, slotsY, slotH };
  }

  private px(pos: number, m: ReturnType<typeof this.metrics>): number {
    return m.padX + (pos + 0.5) * m.s;
  }

  private slotColor(mult: number): string {
    if (mult >= 10)  return '#FF3B3B';
    if (mult >= 3)   return '#FF9500';
    if (mult >= 1.5) return '#FFD700';
    if (mult >= 1)   return '#00D4FF';
    if (mult >= 0.5) return '#666';
    return '#444';
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y); this.ctx.lineTo(x + w - r, y); this.ctx.arcTo(x + w, y, x + w, y + r, r);
    this.ctx.lineTo(x + w, y + h - r); this.ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.ctx.lineTo(x + r, y + h); this.ctx.arcTo(x, y + h, x, y + h - r, r);
    this.ctx.lineTo(x, y + r); this.ctx.arcTo(x, y, x + r, y, r); this.ctx.closePath();
  }

  private drawBoard(m: ReturnType<typeof this.metrics>, ballX: number | null, ballY: number | null, hitPeg: { row: number; idx: number } | null, landedSlot: number): void {
    const { W, H, s, padX, rowH, boardTop, slotsY, slotH } = m;
    this.ctx.clearRect(0, 0, W, H);
    const mults = MULTIPLIERS[this.risk];
    for (let k = 0; k < SLOTS; k++) {
      const x = padX + k * s, col = this.slotColor(mults[k]), isLanded = landedSlot === k;
      this.ctx.fillStyle = isLanded ? col : col + '55';
      this.roundRect(x + 2, slotsY + 4, s - 4, slotH, 6); this.ctx.fill();
      if (isLanded) { this.ctx.shadowColor = col; this.ctx.shadowBlur = 18; this.roundRect(x + 2, slotsY + 4, s - 4, slotH, 6); this.ctx.fill(); this.ctx.shadowBlur = 0; }
      this.ctx.fillStyle = isLanded ? '#fff' : 'rgba(255,255,255,0.6)';
      this.ctx.font = `bold ${Math.max(9, Math.floor(s * 0.22))}px Space Mono, monospace`;
      this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
      this.ctx.fillText(mults[k] + 'Ã—', x + s / 2, slotsY + 4 + slotH / 2);
    }
    const pegR = Math.max(3, Math.floor(s * 0.09));
    for (let r = 0; r < ROWS; r++) {
      const y = boardTop + r * rowH;
      for (let i = 0; i <= r; i++) {
        const xPos = (SLOTS / 2) - r / 2 + i, x = padX + xPos * s;
        const isHit = hitPeg && hitPeg.row === r && hitPeg.idx === i;
        this.ctx.beginPath(); this.ctx.arc(x, y, pegR, 0, Math.PI * 2);
        if (isHit) { this.ctx.fillStyle = '#ffffff'; this.ctx.shadowColor = '#ffffff'; this.ctx.shadowBlur = 12; }
        else { this.ctx.fillStyle = 'rgba(255,255,255,0.55)'; this.ctx.shadowBlur = 0; }
        this.ctx.fill(); this.ctx.shadowBlur = 0;
      }
    }
    if (ballX !== null && ballY !== null) {
      const ballR = Math.max(6, Math.floor(s * 0.16));
      this.ctx.beginPath(); this.ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
      this.ctx.fillStyle = '#FFD700'; this.ctx.shadowColor = '#FFD700'; this.ctx.shadowBlur = 20;
      this.ctx.fill(); this.ctx.shadowBlur = 0;
    }
    this.ctx.textAlign = 'left'; this.ctx.textBaseline = 'alphabetic';
  }

  drawIdleBoard(): void {
    const m = this.metrics(); this.drawBoard(m, null, null, null, -1);
  }

  private animate(path: number[], slot: number, mult: number, net: number): void {
    const m = this.metrics();
    const { s, padX, rowH, boardTop, slotsY } = m;
    const xPos: number[] = [];
    let bx = padX + 4.5 * s; xPos.push(bx);
    for (let r = 0; r < ROWS; r++) { bx += path[r] === 1 ? s / 2 : -s / 2; xPos.push(bx); }
    const yPos: number[] = [boardTop - rowH * 0.6];
    for (let r = 0; r < ROWS; r++) yPos.push(boardTop + r * rowH);
    yPos.push(slotsY + 20);
    const hitPegIndices: number[] = []; let rights = 0;
    for (let r = 0; r < ROWS; r++) { hitPegIndices.push(rights); if (path[r] === 1) rights++; }
    const STEP_MS = 190, TOTAL = (ROWS + 1) * STEP_MS;
    let startTs: number | null = null;

    const frame = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const stepF = elapsed / STEP_MS, step = Math.min(Math.floor(stepF), ROWS);
      const prog = Math.min(stepF - step, 1), t = this.easeInOut(prog);
      const fromX = step === 0 ? padX + 4.5 * s : xPos[step];
      const toX = xPos[step + 1] ?? xPos[step];
      const fromY = yPos[step], toY = yPos[step + 1] ?? yPos[step];
      const ballX = fromX + (toX - fromX) * t, ballY = fromY + (toY - fromY) * t;
      const hitPeg = step > 0 && prog < 0.35 ? { row: step - 1, idx: hitPegIndices[step - 1] } : null;
      this.drawBoard(m, ballX, ballY, hitPeg, elapsed >= TOTAL ? slot : -1);
      if (elapsed < TOTAL + STEP_MS * 0.5) {
        requestAnimationFrame(frame);
      } else {
        this.drawBoard(m, null, null, null, slot);
        this.ngZone.run(() => {
          this.dropping = false;
          this.bumpTokens();
          const sign = net >= 0 ? '+' : '';
          this.showResult(mult + 'Ã—  ' + sign + net, net >= 0);
        });
      }
    };
    requestAnimationFrame(frame);
  }

  private easeInOut(t: number): number { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  private showResult(text: string, isWin: boolean): void {
    this.resultText = text;
    this.resultCls = 'result-overlay ' + (isWin ? 'win' : 'lose');
    setTimeout(() => { this.resultCls = 'result-overlay hidden'; }, 2800);
  }

  private bumpTokens(): void {
    this.tokensBump = false;
    setTimeout(() => { this.tokensBump = true; setTimeout(() => this.tokensBump = false, 300); }, 0);
  }

  goBack(): void { this.router.navigate(['/lobby']); }
  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
