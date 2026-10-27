import { notFound } from 'next/navigation';
import EvaluationWorkspace from '@/app/evaluation/workspace';
import { parseBureauRoute } from '@/app/lib/bureaus';

type Props = { params: Promise<{ bureau: string }> };

export async function generateMetadata({ params }: Props) {
  const bureau = parseBureauRoute((await params).bureau);
  return { title: bureau ? `${bureau} AI 검색 결과 평가 | 심사데스크` : '심사국 확인 | 심사데스크' };
}

export default async function BureauPage({ params }: Props) {
  const bureau = parseBureauRoute((await params).bureau);
  if (!bureau) notFound();
  return <EvaluationWorkspace bureau={bureau} />;
}
