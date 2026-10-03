'use client';
import { useRef, useState, type FormEvent } from 'react';
import type { CandidateDocument } from '@/app/lib/candidate-documents';
export default function CandidateEditor({ disabled, onSave }: { disabled: boolean; onSave: (input: Partial<CandidateDocument>) => Promise<void> }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const value = new FormData(form);
    setBusy(true); setError('');
    try {
      await onSave({ country: String(value.get('country') || 'KR'), number: String(value.get('number')), title: String(value.get('title')),
        publicationDate: String(value.get('publicationDate')), applicationDate: String(value.get('applicationDate')),
        sourceUrl: String(value.get('sourceUrl')), notes: String(value.get('notes')), role: String(value.get('role')) as CandidateDocument['role'],
        matches: String(value.get('matches')).split(/[,·\s]+/).filter(Boolean),
      });
      form.reset(); if (detailsRef.current) detailsRef.current.open = false;
    } catch (reason) { setError(reason instanceof Error ? reason.message : '문헌을 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <details className="candidate-editor" ref={detailsRef}><summary>문헌번호 직접 추가</summary><form onSubmit={submit}>
    <div className="candidate-input-grid">
      <label>국가<select name="country" defaultValue="KR"><option>KR</option><option>US</option><option>JP</option><option>EP</option><option>WO</option><option>CN</option></select></label>
      <label>문헌번호<input name="number" required maxLength={60} placeholder="10-2018-0012345"/></label>
      <label className="wide">발명의 명칭<input name="title" maxLength={500}/></label>
      <label>공개일<input type="date" name="publicationDate"/></label><label>출원일<input type="date" name="applicationDate"/></label>
      <label>문헌 역할<select name="role" defaultValue="보류"><option>보류</option><option>D1 후보</option><option>D2 후보</option></select></label>
      <label>대응 구성<input name="matches" placeholder="1A, 1B"/></label>
      <label className="wide">원문 링크<input type="url" name="sourceUrl" placeholder="https://" maxLength={2000}/></label>
      <label className="wide">검토 메모<textarea name="notes" rows={3} maxLength={4000}/></label>
    </div>
    <small>입력한 정보만 저장합니다. 공개일이 없으면 기준일 비교는 보류합니다.</small>
    {error && <p className="inline-warning" role="alert">{error}</p>}
    <button className="exam-primary" type="submit" disabled={disabled || busy}>{busy ? '저장 중…' : disabled ? '실사건에서 추가 가능' : '후보문헌 저장'}</button>
  </form></details>;
}
