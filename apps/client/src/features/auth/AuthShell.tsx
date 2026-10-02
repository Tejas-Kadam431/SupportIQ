import type { ReactNode } from 'react';
import './auth.css';

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className="auth-page">
    <section className="auth-hero" aria-label="About SupportIQ">
      <div className="auth-brand"><img className="auth-logo-image" src="/supportiq-icon-192.png" alt=""/><span>SupportIQ</span></div>
      <div className="auth-hero-content">
        <p className="auth-eyebrow">A little clarity. Better support.</p>
        <h1>Great answers start with solid evidence.</h1>
        <p>Bring your conversations, knowledge and team together. Get AI suggestions you can inspect, improve and send with confidence.</p>
        <div className="auth-proof"><span aria-hidden="true">✓</span> Your team stays in control of every reply.</div>
      </div>
      <div className="auth-feature-grid">
        <div><span className="auth-feature-number" aria-hidden="true">01</span><strong>One workspace</strong><span>Tickets, conversations and private team notes.</span></div>
        <div><span className="auth-feature-number" aria-hidden="true">02</span><strong>Evidence first</strong><span>Suggestions grounded in your published knowledge.</span></div>
        <div><span className="auth-feature-number" aria-hidden="true">03</span><strong>Learn from feedback</strong><span>Review outcomes and verify knowledge fixes.</span></div>
      </div>
    </section>
    <section className="auth-card">{children}</section>
  </main>;
}
