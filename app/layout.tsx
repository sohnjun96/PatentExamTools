import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: '특허심사 지원서비스 | 심사데스크',
  description: 'KIPRIS Plus 데이터를 심사 흐름에 맞춰 정리하는 특허 사건 대시보드',
  openGraph: {
    title: '특허심사 지원서비스 | 심사데스크',
    description: 'KIPRIS Plus 특허 사건 검토 대시보드',
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
    title: '특허심사 지원서비스 | 심사데스크',
    description: 'KIPRIS Plus 특허 사건 검토 대시보드',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
