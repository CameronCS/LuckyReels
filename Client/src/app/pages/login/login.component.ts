import { Component, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { HubService } from '../../services/hub.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  standalone: false
})
export class LoginComponent implements AfterViewInit {
  @ViewChild('starsEl') starsEl!: ElementRef<HTMLDivElement>;

  mode: 'login' | 'register' = 'register';
  loginForm: FormGroup;
  registerForm: FormGroup;
  error = '';
  loading = false;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private hub: HubService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
    this.registerForm = this.fb.group({
      name:     ['', [Validators.required, Validators.maxLength(20)]],
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(4)]]
    });

    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/lobby']);
    }
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

  switchTab(m: 'login' | 'register'): void {
    this.mode = m;
    this.error = '';
  }

  submit(): void {
    this.error = '';
    if (this.mode === 'login') {
      this.submitLogin();
    } else {
      this.submitRegister();
    }
  }

  private submitLogin(): void {
    if (this.loginForm.invalid) {
      this.error = this.loginForm.get('username')?.invalid ? 'Enter a username.' : 'Enter a password.';
      return;
    }
    this.loading = true;
    this.auth.login(this.loginForm.value).subscribe({
      next: async r => {
        if (r.isAuthenticated) {
          await this.hub.connect();
          this.router.navigate(['/lobby']);
        } else {
          this.error = 'Invalid username or password.';
        }
        this.loading = false;
      },
      error: () => {
        this.error = 'Login failed. Please try again.';
        this.loading = false;
      }
    });
  }

  private submitRegister(): void {
    if (this.registerForm.invalid) {
      const c = this.registerForm.controls;
      if (c['name'].invalid) { this.error = 'Enter a username.'; return; }
      if (c['email'].invalid) { this.error = 'Enter a valid email.'; return; }
      if (c['password'].invalid) { this.error = 'Password must be at least 4 characters.'; return; }
      return;
    }
    this.loading = true;
    this.auth.register(this.registerForm.value).subscribe({
      next: async r => {
        if (r.isAuthenticated) {
          await this.hub.connect();
          this.router.navigate(['/lobby']);
        } else {
          this.error = 'Username already taken.';
        }
        this.loading = false;
      },
      error: () => {
        this.error = 'Registration failed. Please try again.';
        this.loading = false;
      }
    });
  }
}
