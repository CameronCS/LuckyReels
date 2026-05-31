import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  template: '',
  standalone: false
})
export class RegisterComponent implements OnInit {
  constructor(private router: Router) {}
  ngOnInit(): void { this.router.navigate(['/login']); }
}
