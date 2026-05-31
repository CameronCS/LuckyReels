import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { HubService } from '../../services/hub.service';
import { AuthService } from '../../services/auth.service';
import { RouletteBet } from '../../models/game.models';

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const WHEEL_ORDER = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,37,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];

@Component({
  selector: 'app-roulette',
  templateUrl: './roulette.component.html',
  styleUrl: './roulette.component.css',
  standalone: false
})
export class RouletteComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;
  @ViewChild('wheelCanvas') wheelCanvasRef!: ElementRef<HTMLCanvasElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  selectedChip = 5;
  spinning = false;
  wheelRot = 0;
  bets: Record<string, number> = {};
  totalBet = 0;
  winNum = '—';
  winNumCls = 'win-num-display';
  resultText = '';
  resultCls = 'result-bar';
  winningKeys: string[] = [];
  customChipVisible = false;
  customChipValue = '';

  chipBtns = [1, 5, 10, 25, 50, 100];
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animFrameHandle = 0;
  private subs = new Subscription();

  numRows = [
    { nums: [3,6,9,12,15,18,21,24,27,30,33,36], colKey: 'col-3' },
    { nums: [2,5,8,11,14,17,20,23,26,29,32,35], colKey: 'col-2' },
    { nums: [1,4,7,10,13,16,19,22,25,28,31,34], colKey: 'col-1' },
  ];
  dozens = [
    { text: '1st 12', key: 'dozen-1' },
    { text: '2nd 12', key: 'dozen-2' },
    { text: '3rd 12', key: 'dozen-3' },
  ];
  evenBets = [
    { text: '1–18', key: 'low',   cls: 'even-cell' },
    { text: 'Even', key: 'even',  cls: 'even-cell' },
    { text: '●',    key: 'red',   cls: 'even-cell red-cell' },
    { text: '●',    key: 'black', cls: 'even-cell black-cell' },
    { text: 'Odd',  key: 'odd',   cls: 'even-cell' },
    { text: '19–36',key: 'high',  cls: 'even-cell' },
  ];

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

    this.subs.add(this.hub.rouletteResult$.subscribe(result => {
      const winNumber = parseInt(result.winNumber);
      this.ngZone.run(() => this.animateToResult(winNumber, result.net, result.newBalance, result.winningBets));
    }));

    this.subs.add(this.hub.hubError$.subscribe(msg => {
      this.ngZone.run(() => {
        this.spinning = false;
        this.resultText = msg; this.resultCls = 'result-bar loss';
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
    this.canvas = this.wheelCanvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.drawWheel();
  }

  setChip(val: number): void { this.selectedChip = val; this.customChipVisible = false; }
  showCustomChip(): void { this.customChipVisible = true; }
  applyCustomChip(): void { const v = Math.max(1, parseInt(this.customChipValue) || 1); this.selectedChip = v; }

  placeBet(key: string): void {
    if (this.spinning) return;
    this.bets[key] = (this.bets[key] || 0) + this.selectedChip;
    this.updateTotal();
  }

  getChipAmt(key: string): number { return this.bets[key] || 0; }
  chipLabel(amt: number): string { return amt >= 1000 ? Math.round(amt / 1000) + 'k' : String(amt); }

  clearBets(): void {
    if (this.spinning) return;
    this.bets = {}; this.updateTotal(); this.winningKeys = [];
    this.winNum = '—'; this.winNumCls = 'win-num-display';
    this.resultText = ''; this.resultCls = 'result-bar';
  }

  spin(): void {
    if (this.spinning || this.totalBet === 0 || this.tokens < this.totalBet) return;
    this.spinning = true;
    this.winningKeys = []; this.resultText = ''; this.resultCls = 'result-bar';
    const betData: RouletteBet[] = Object.entries(this.bets).filter(([,v]) => v > 0).map(([k,v]) => ({ key: k, amount: v }));
    this.hub.spinRoulette(betData).catch(() => { this.spinning = false; });

    const sectorDeg = 360 / 38;
    let fakeTarget = -(Math.floor(Math.random() * 38) + 0.5) * sectorDeg;
    while (fakeTarget < this.wheelRot + 1800) fakeTarget += 360;
    const startRot = this.wheelRot, startTime = performance.now();
    this.ngZone.runOutsideAngular(() => {
      const animFrame = (now: number) => {
        const t = Math.min((now - startTime) / 4500, 1);
        this.wheelRot = startRot + (fakeTarget - startRot) * this.easeOut(t);
        this.drawWheel();
        if (t < 1) this.animFrameHandle = requestAnimationFrame(animFrame);
      };
      this.animFrameHandle = requestAnimationFrame(animFrame);
    });
  }

  private animateToResult(winNum: number, net: number, newTokens: number, winningKeys: string[]): void {
    cancelAnimationFrame(this.animFrameHandle);
    const sectorDeg = 360 / 38;
    let targetRot = -(WHEEL_ORDER.indexOf(winNum) + 0.5) * sectorDeg;
    while (targetRot < this.wheelRot + 900) targetRot += 360;
    const startRot = this.wheelRot, startTime = performance.now();
    this.ngZone.runOutsideAngular(() => {
      const frame = (now: number) => {
        const t = Math.min((now - startTime) / 2200, 1);
        this.wheelRot = startRot + (targetRot - startRot) * this.easeOut(t);
        this.drawWheel();
        if (t < 1) { requestAnimationFrame(frame); }
        else { this.wheelRot = targetRot; this.drawWheel(); this.ngZone.run(() => this.finishSpin(winNum, net, newTokens, winningKeys)); }
      };
      requestAnimationFrame(frame);
    });
  }

  private finishSpin(winNum: number, net: number, newTokens: number, winningKeys: string[]): void {
    this.tokens = newTokens; this.hub.balance$.next(newTokens);
    if (net > 0) this.bumpTokens();
    const label = winNum === 37 ? '00' : String(winNum);
    const numCls = (winNum === 0 || winNum === 37) ? 'green-num' : RED_NUMS.has(winNum) ? 'red-num' : 'black-num';
    const colorLabel = (winNum === 0 || winNum === 37) ? 'GREEN' : RED_NUMS.has(winNum) ? 'RED' : 'BLACK';
    this.winNum = label; this.winNumCls = `win-num-display ${numCls}`;
    const barCls = net > 0 ? 'win' : net < 0 ? 'loss' : 'push';
    this.resultText = net > 0 ? `${colorLabel} · +${net}` : net < 0 ? `${colorLabel} · −${Math.abs(net)}` : `${colorLabel} · PUSH`;
    this.resultCls = `result-bar ${barCls}`;
    this.winningKeys = winningKeys || [];
    this.spinning = false;
  }

  isWinner(key: string): boolean { return this.winningKeys.includes(key); }
  numCls(n: number): string { return RED_NUMS.has(n) ? 'num-cell red-num' : 'num-cell black-num'; }

  drawWheel(): void {
    if (!this.ctx) return;
    const cx = this.canvas.width / 2, cy = this.canvas.height / 2, r = cx - 10;
    const n = WHEEL_ORDER.length, arc = (2 * Math.PI) / n;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.beginPath(); this.ctx.arc(cx, cy, r + 8, 0, 2 * Math.PI);
    this.ctx.fillStyle = '#1a0a00'; this.ctx.fill();
    this.ctx.strokeStyle = '#FFD700'; this.ctx.lineWidth = 2; this.ctx.stroke();
    this.ctx.save(); this.ctx.translate(cx, cy); this.ctx.rotate(this.wheelRot * Math.PI / 180);
    for (let i = 0; i < n; i++) {
      const num = WHEEL_ORDER[i], s = -Math.PI / 2 + i * arc, e = s + arc, mid = s + arc / 2;
      this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.arc(0, 0, r, s, e); this.ctx.closePath();
      this.ctx.fillStyle = this.pocketColor(num); this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(255,255,255,0.1)'; this.ctx.lineWidth = 0.7; this.ctx.stroke();
      const tr = r * 0.77;
      this.ctx.save(); this.ctx.translate(tr * Math.cos(mid), tr * Math.sin(mid)); this.ctx.rotate(mid + Math.PI / 2);
      this.ctx.fillStyle = '#fff'; this.ctx.font = 'bold 8px monospace'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
      this.ctx.fillText(num === 37 ? '00' : String(num), 0, 0); this.ctx.restore();
    }
    this.ctx.beginPath(); this.ctx.arc(0, 0, r * 0.2, 0, 2 * Math.PI);
    this.ctx.fillStyle = '#0a0a0f'; this.ctx.fill(); this.ctx.strokeStyle = '#FFD700'; this.ctx.lineWidth = 1.5; this.ctx.stroke();
    this.ctx.restore();
    this.ctx.save(); this.ctx.translate(cx, cy - r - 2);
    this.ctx.beginPath(); this.ctx.moveTo(-7, -6); this.ctx.lineTo(7, -6); this.ctx.lineTo(0, 10);
    this.ctx.closePath(); this.ctx.fillStyle = '#FFD700'; this.ctx.fill(); this.ctx.restore();
  }

  private pocketColor(n: number): string {
    if (n === 0 || n === 37) return '#1a5c1a';
    return RED_NUMS.has(n) ? '#8b1515' : '#0e0e1c';
  }
  private easeOut(t: number): number { return 1 - Math.pow(1 - t, 3); }
  private updateTotal(): void { this.totalBet = Object.values(this.bets).reduce((s, b) => s + b, 0); }
  private bumpTokens(): void {
    this.tokensBump = false;
    setTimeout(() => { this.tokensBump = true; setTimeout(() => this.tokensBump = false, 300); }, 0);
  }

  goBack(): void { this.router.navigate(['/lobby']); }
  ngOnDestroy(): void { cancelAnimationFrame(this.animFrameHandle); this.subs.unsubscribe(); }
}
