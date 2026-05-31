import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { HubService } from '../../services/hub.service';

interface GameCard {
  name: string;
  route: string;
  emoji: string;
  desc: string;
  cls: string;
}

@Component({
  selector: 'app-lobby',
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.css',
  standalone: false
})
export class LobbyComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;

  userName: string;
  tokens = 0;
  tokensBump = false;
  private subs = new Subscription();

  games: GameCard[] = [
    { name: 'Lucky Reels', route: '/slots',     emoji: '🎰', desc: 'Spin the reels and match symbols.\nJackpot pays up to 50× your bet.',     cls: 'slots' },
    { name: 'Blackjack',   route: '/blackjack', emoji: '🃏', desc: 'Beat the dealer without going over 21.\nBlackjack pays 3 to 2.',            cls: 'bj' },
    { name: 'Roulette',    route: '/roulette',  emoji: '🎡', desc: 'Bet on numbers, colors, or groups.\nStraight up pays 35 to 1.',            cls: 'roulette' },
    { name: 'Horse Racing',route: '/horse',     emoji: '🏇', desc: 'Pick your horse and watch the race.\nWinner pays 4 to 1.',                  cls: 'horse' },
    { name: 'Baccarat',    route: '/baccarat',  emoji: '🎴', desc: 'Bet on Player, Banker, or Tie.\nBanker pays 0.95:1 · Tie pays 8:1.',       cls: 'baccarat' },
    { name: 'Mines',       route: '/mines',     emoji: '💣', desc: 'Reveal gems, avoid the bombs.\nCash out anytime before you explode.',      cls: 'mines' },
    { name: 'Crash',       route: '/crash',     emoji: '🚀', desc: 'Watch the multiplier climb.\nCash out before it crashes.',                 cls: 'crash' },
    { name: 'Plinko',      route: '/plinko',    emoji: '🎯', desc: 'Drop the ball through 8 rows of pegs.\nLow, Medium, or High risk.',        cls: 'plinko' },
  ];

  constructor(
    private auth: AuthService,
    public hub: HubService,
    private router: Router
  ) {
    this.userName = this.auth.getUserName();
  }

  ngOnInit(): void {
    this.subs.add(
      this.hub.balance$.subscribe(b => { this.tokens = b; })
    );
  }

  ngAfterViewInit(): void {
    const el = this.starsEl?.nativeElement;
    if (!el) return;
    for (let i = 0; i < 100; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      const sz = Math.random() * 2 + 1;
      s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${2+Math.random()*5}s;--o:${0.15+Math.random()*0.5};animation-delay:${Math.random()*5}s`;
      el.appendChild(s);
    }
  }

  navigate(route: string): void { this.router.navigate([route]); }

  logout(): void {
    this.hub.disconnect();
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
