import type { Metadata } from 'next';
import 'krds-uiux/resources/css/component/output.css';
import './globals.css';
import './krds-foundation.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: '심사데스크 | AI 검색 결과 평가',
  description: '월별 대상 선정, AI 검색 결과 평가와 KIPRIS Plus 전문 PDF를 연결하는 심사 업무 공간',
  openGraph: {
    title: '심사데스크',
    description: 'AI 검색 결과 평가 · KIPRIS Plus 전문 PDF',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: '심사데스크 — KIPRIS Plus 특허 사건 검토 대시보드',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '심사데스크',
    description: 'AI 검색 결과 평가 · KIPRIS Plus 전문 PDF',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-krds-mode="light">
      <body>{children}</body>
    </html>
  );
}
