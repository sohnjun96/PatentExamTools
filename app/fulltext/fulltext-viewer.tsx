'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import OriginalDocumentViewer from '@/app/original-document-viewer';
import type { OriginalTarget } from '@/app/lib/evidence-location';

export default function FullTextViewer({ initialApplicationNumber }: { initialApplicationNumber: string }) {
  const applicationNumber = /^(10|20)\d{11}$/.test(initialApplicationNumber) ? initialApplicationNumber : '1020200093844';
  const [target, setTarget] = useState<OriginalTarget | null>(null);
  const [title, setTitle] = useState('');
  useEffect(() => {
    const synchronize = () => {
      try {
        const id = decodeURIComponent(window.location.hash.slice(1));
        const locator = id.startsWith('claim-') ? '청구항 ' + id.slice(6) : id.startsWith('paragraph-') ? '[' + id.slice(10) + ']' : '원문 근거';
        setTarget(id ? { sourceId: id, locator, excerpt: new URLSearchParams(window.location.search).get('evidence') || '' } : null);
      } catch { setTarget(null); }
    };
    window.queueMicrotask(synchronize);
    window.addEventListener('hashchange', synchronize);
    return () => window.removeEventListener('hashchange', synchronize);
  }, []);
  return <main className="standalone-original-page">
    <header><div><small>전체 명세서·청구항</small><h1>{title || applicationNumber}</h1></div><div className="original-page-actions"><button type="button" onClick={() => window.print()}>인쇄</button><Link href={'/?applicationNumber=' + applicationNumber}>심사 작업으로 돌아가기</Link></div></header>
    <OriginalDocumentViewer key={applicationNumber} applicationNumber={applicationNumber} target={target} onLoaded={(document) => setTitle(document.title)}/>
  </main>;
}
