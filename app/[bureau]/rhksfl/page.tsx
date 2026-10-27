import { notFound } from 'next/navigation';
import EvaluationWorkspace from '@/app/evaluation/workspace';
import { parseBureauRoute } from '@/app/lib/bureaus';

type Props = { params: Promise<{ bureau: string }> };

export async function generateMetadata({ params }: Props) {
  const bureau = parseBureauRoute((await params).bureau);
  return { title: bureau ? `${bureau} 계정·AI 운영 관리 | 선행기술 AI 검색 포털` : '심사국 확인 | 선행기술 AI 검색 포털' };
}

export default async function BureauAdminPage({ params }: Props) {
  const bureau = parseBureauRoute((await params).bureau);
  if (!bureau) notFound();
  return <EvaluationWorkspace bureau={bureau} admin />;
}
