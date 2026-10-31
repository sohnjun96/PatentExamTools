import type { Metadata } from 'next';
import { BUREAUS, bureauPath } from './lib/bureaus';
import AppIcon from './components/app-icon';
import './home.css';

export const metadata: Metadata = {
  title: '심사국 선택 | AI 선행기술 검색 포털',
  description: '심사국을 선택해 AI 선행기술 검색 업무로 이동하세요.',
};

export default function Home() {
  return (
    <main className="bureau-home">
      <div className="bureau-home-content">
        <header className="bureau-home-brand">
          <span className="bureau-home-mark" aria-hidden="true">AI</span>
          <span>AI 선행기술 검색 포털</span>
        </header>
        <h1 id="bureau-home-title">심사국 선택</h1>
        <nav aria-labelledby="bureau-home-title">
          <ul className="bureau-home-list">
            {BUREAUS.map((bureau) => (
              <li key={bureau}>
                <a className="bureau-home-link" href={bureauPath(bureau)}>
                  <span>{bureau}</span>
                  <AppIcon name="arrow-right" size={24} />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
