import type { Metadata } from 'next';
import { ErrorToastProvider } from './components/error-toast';
import 'krds-uiux/resources/css/component/output.css';
import './globals.css';
import './krds-foundation.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: 'AI 선행기술 검색 포털 | AI 검색 결과 평가',
  description: '월별 대상 선정, AI 검색 결과 평가와 KIPRIS Plus 전문 PDF를 연결하는 심사 업무 공간',
  openGraph: {
    title: 'AI 선행기술 검색 포털',
    siteName: 'AI 선행기술 검색 포털',
    description: 'AI 검색 결과 평가 · KIPRIS Plus 전문 PDF',
    type: 'website',
    images: [
      {
        url: '/og-portal.png',
        width: 1200,
        height: 630,
        alt: 'AI 선행기술 검색 포털 — AI 검색 결과 평가와 전문 PDF',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI 선행기술 검색 포털',
    description: 'AI 검색 결과 평가 · KIPRIS Plus 전문 PDF',
    images: ['/og-portal.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-krds-mode="light">
      <body><ErrorToastProvider>{children}</ErrorToastProvider></body>
    </html>
  );
}
