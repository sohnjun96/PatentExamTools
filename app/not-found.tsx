import Link from 'next/link';
import { BUREAUS, bureauPath } from './lib/bureaus';
import './not-found.css';

export default function NotFound() {
  return <main className="bureau-not-found">
    <p>AI 선행기술 검색 포털</p>
    <h1>페이지를 찾을 수 없습니다.</h1>
    <p>주소를 확인하거나 이용할 심사국을 선택해 주세요.</p>
    <nav aria-label="심사국 선택">{BUREAUS.map((bureau) => <Link className="krds-btn medium tertiary" key={bureau} href={bureauPath(bureau)}>{bureau}</Link>)}</nav>
    <Link href="/">처음 화면으로 이동</Link>
  </main>;
}
