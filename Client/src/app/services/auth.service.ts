import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthResponse, LoginRequest, RegisterRequest } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'lr_token';
  private readonly userKey  = 'lr_user';

  constructor(private http: HttpClient) {}

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/api/v1.0/Auth/LoginPlayer`, request)
      .pipe(tap(r => this.store(r)));
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/api/v1.0/Auth/Register`, request)
      .pipe(tap(r => this.store(r)));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getUserName(): string {
    return localStorage.getItem(this.userKey) ?? '';
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  private store(response: AuthResponse): void {
    if (response.isAuthenticated) {
      localStorage.setItem(this.tokenKey, response.token);
      localStorage.setItem(this.userKey, response.userName);
    }
  }
}
