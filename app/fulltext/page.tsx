import type { Metadata } from 'next';
import FullTextViewer from './fulltext-viewer';

type FullTextPageProps = {
  searchParams: Promise<{ applicationNumber?: string }>;
};

function formatApplicationNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 13
    ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    : value;
}

export async function generateMetadata({
  searchParams,
}: FullTextPageProps): Promise<Metadata> {
  const params = await searchParams;
  const applicationNumber =
    params.applicationNumber?.replace(/\D/g, '') || '1020200093844';
  const formatted = formatApplicationNumber(applicationNumber);

  return {
    title: `${formatted} 전문 명세서 | 심사데스크`,
    description: `${formatted}의 전체 명세서와 청구항을 검토하는 전문파일 읽기 화면`,
  };
}

export default async function FullTextPage({ searchParams }: FullTextPageProps) {
  const params = await searchParams;
  const applicationNumber =
    params.applicationNumber?.replace(/\D/g, '') || '1020200093844';

  return <FullTextViewer initialApplicationNumber={applicationNumber} />;
}
