import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, map, of } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly apiStatus = toSignal(
    this.http.get<{ status: string }>('/api/public/ping').pipe(
      map((r) => (r.status === 'ok' ? 'online' : 'offline')),
      catchError(() => of('offline')),
    ),
    { initialValue: 'checking' },
  );
}
