import type { Metadata } from 'next';
import FullTextViewer from './fulltext-viewer';
import { applicationNumberLabel, fullTextRequest } from '../lib/patent-number';

type FullTextPageProps = {
  searchParams: Promise<{ applicationNumber?: string; demo?: string }>;
};

export async function generateMetadata({
  searchParams,
}: FullTextPageProps): Promise<Metadata> {
  const params = await searchParams;
  const request = fullTextRequest(params.applicationNumber, params.demo === '1');
  const formatted = applicationNumberLabel(request.requested);

  return {
    title: request.normalized ? `${formatted} 전문 명세서 | 심사데스크` : `${formatted ? '출원번호 확인' : '전문 조회'} | 심사데스크`,
    description: request.normalized ? `${formatted}의 전체 명세서와 청구항을 검토하는 전문 읽기 화면` : '출원번호를 확인해 명세서와 청구항을 조회하세요.',
  };
}

export default async function FullTextPage({ searchParams }: FullTextPageProps) {
  const params = await searchParams;
  const request = fullTextRequest(params.applicationNumber, params.demo === '1');
  return <FullTextViewer key={`${request.requested}:${request.demo}`} initialApplicationNumber={request.requested} explicitDemo={request.demo} />;
}
