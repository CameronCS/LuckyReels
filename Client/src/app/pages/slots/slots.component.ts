import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { HubService } from '../../services/hub.service';
import { AuthService } from '../../services/auth.service';

const SYMBOLS = ['💎', '7️⃣', '🍀', '⭐', '🍒', '🍋', '🍇', '🔔'];
const MAX_MACHINES = 6;

interface SlotMachine {
  id: number;
  num: number;
  symbols: string[];
  msg: string;
  msgClass: string;
  spinning: boolean;
  winnerMask: boolean[];
  shake: boolean;
}

@Component({
  selector: 'app-slots',
  templateUrl: './slots.component.html',
  styleUrl: './slots.component.css',
  standalone: false
})
export class SlotsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  bet = 1;
  customBet = '';
  spinning = false;
  machines: SlotMachine[] = [];
  private machineCounter = 0;
  private subs = new Subscription();
  private pendingSpins = new Map<number, (result: any) => void>();

  presetBets = [1, 5, 10, 25, 50, 100];
  activeBet = 1;

  messageBar = '';
  messageBarClass = 'message-bar neutral';
  showNoTokens = false;
  paytableOpen = false;

  constructor(
    private hub: HubService,
    private auth: AuthService,
    private router: Router
  ) {
    this.userName = auth.getUserName();
  }

  ngOnInit(): void {
    this.subs.add(this.hub.balance$.subscribe(b => { this.tokens = b; }));
    this.subs.add(this.hub.slotResult$.subscribe(r => {
      const resolve = this.pendingSpins.get((r as any).machineNum);
      if (resolve) { this.pendingSpins.delete((r as any).machineNum); resolve(r); }
    }));
    this.addMachine();
  }

  ngAfterViewInit(): void {
    const el = this.starsEl?.nativeElement;
    if (!el) return;
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('div'); s.className = 'star';
      const sz = Math.random() * 2 + 1;
      s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${2+Math.random()*4}s;--o:${0.2+Math.random()*0.5};animation-delay:${Math.random()*4}s`;
      el.appendChild(s);
    }
  }

  setBet(amount: number): void {
    this.bet = amount;
    this.activeBet = amount;
    this.customBet = '';
  }

  onCustomBet(): void {
    const v = parseInt(this.customBet);
    if (v && v > 0) { this.bet = v; this.activeBet = -1; }
  }

  get colsClass(): string {
    const n = this.machines.length;
    if (n <= 1) return 'cols-1';
    if (n === 2) return 'cols-2';
    return 'cols-3';
  }

  get spinBtnText(): string {
    const cost = this.bet * this.machines.length;
    return this.machines.length > 1 ? `SPIN ALL · ${cost}` : 'SPIN';
  }

  canSpin(): boolean {
    return !this.spinning && this.tokens >= this.bet * this.machines.length && this.tokens > 0;
  }

  addMachine(): void {
    if (this.machines.length >= MAX_MACHINES) return;
    const id = ++this.machineCounter;
    this.machines.push({
      id, num: this.machines.length + 1,
      symbols: ['🎰', '🎰', '🎰'],
      msg: 'Ready to spin', msgClass: 'slot-msg neutral',
      spinning: false, winnerMask: [false, false, false], shake: false
    });
    this.updateMachineNums();
  }

  removeMachine(id: number): void {
    if (this.machines.length <= 1) return;
    this.machines = this.machines.filter(m => m.id !== id);
    this.updateMachineNums();
  }

  private updateMachineNums(): void {
    this.machines.forEach((m, i) => m.num = i + 1);
  }

  async spinAll(): Promise<void> {
    if (this.spinning || this.machines.some(m => m.spinning)) return;
    const cost = this.bet * this.machines.length;
    if (this.tokens < cost) return;
    this.spinning = true;
    this.machines.forEach(m => { m.msg = 'Spinning...'; m.msgClass = 'slot-msg neutral'; });
    await Promise.all(this.machines.map((m, i) => {
      const machineNum = i + 1;
      this.hub.spinSlots(machineNum, this.bet).catch(() => {});
      return this.spinMachine(m, machineNum);
    }));
    this.spinning = false;
  }

  async spinOne(machine: SlotMachine): Promise<void> {
    if (machine.spinning || this.spinning || this.tokens < this.bet) return;
    machine.spinning = true;
    machine.msg = 'Spinning...'; machine.msgClass = 'slot-msg neutral';
    const machineNum = this.machines.findIndex(m => m.id === machine.id) + 1;
    this.hub.spinSlots(machineNum, this.bet).catch(() => {});
    await this.spinMachine(machine, machineNum);
    machine.spinning = false;
  }

  private spinMachine(machine: SlotMachine, machineNum: number): Promise<void> {
    return new Promise(resolve => {
      machine.winnerMask = [false, false, false];
      machine.shake = false;
      const DURATIONS = [700, 900, 1100];
      let completedReels = 0;
      const animationDone = new Promise<void>(resAnim => {
        DURATIONS.forEach((dur, i) => {
          const total = Math.floor(dur / 80);
          let n = 0;
          const iv = setInterval(() => {
            machine.symbols = [...machine.symbols];
            machine.symbols[i] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            if (++n >= total) {
              clearInterval(iv);
              completedReels++;
              if (completedReels === 3) resAnim();
            }
          }, 80);
        });
      });
      const serverDone = new Promise<any>(resServer => this.pendingSpins.set(machineNum, resServer));
      Promise.all([animationDone, serverDone]).then(([, serverMsg]) => {
        machine.symbols = [...(serverMsg as any).symbols];
        this.tokens = (serverMsg as any).tokens ?? this.tokens;
        this.hub.balance$.next(this.tokens);
        const { result, net } = serverMsg as any;
        if (result === 'jackpot') {
          machine.winnerMask = [true, true, true];
          machine.msg = `🎉 JACKPOT! +${net}`; machine.msgClass = 'slot-msg win';
          this.confetti(machine.id);
        } else if (result === 'match') {
          const [a, b, c] = machine.symbols;
          machine.winnerMask = [a === b || a === c, a === b || b === c, b === c || a === c];
          machine.msg = `✨ Match! +${net}`; machine.msgClass = 'slot-msg win';
        } else {
          machine.msg = `No match  −${this.bet}`; machine.msgClass = 'slot-msg lose';
          machine.shake = true;
          setTimeout(() => { machine.shake = false; }, 400);
        }
        if (net > 0) this.bumpTokens();
        resolve();
      });
    });
  }

  private bumpTokens(): void {
    this.tokensBump = false;
    setTimeout(() => { this.tokensBump = true; setTimeout(() => this.tokensBump = false, 300); }, 0);
  }

  private confetti(machineId: number): void {
    const colors = ['#FFD700', '#FF2D55', '#00FF87', '#7F5AF0', '#FFA500'];
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    for (let i = 0; i < 28; i++) {
      const c = document.createElement('div'); c.className = 'confetti-piece';
      c.style.cssText = `left:${cx + (Math.random() - 0.5) * 200}px;top:${cy}px;background:${colors[Math.floor(Math.random() * colors.length)]};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};transform:rotate(${Math.random() * 360}deg);animation-delay:${Math.random() * 0.3}s;animation-duration:${1 + Math.random()}s;`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2000);
    }
  }

  togglePaytable(): void {
    this.paytableOpen = !this.paytableOpen;
  }

  goBack(): void { this.router.navigate(['/lobby']); }

  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
