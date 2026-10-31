import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseTaskRequest } from '@/app/lib/task-window';
import TaskWorkspace from './task-workspace';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export const metadata: Metadata = { title: 'AI 검색 업무 | AI 선행기술 검색 포털', robots: { index: false, follow: false } };
export default async function TaskPage({ searchParams }: Props) {
  const request = parseTaskRequest(await searchParams);
  if (!request) notFound();
  return <TaskWorkspace key={JSON.stringify(request)} request={request} />;
}
