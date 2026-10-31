import type { EvaluationNotice } from '@/app/lib/evaluation';
import type { Bureau } from '@/app/lib/bureaus';
import NoticeMarkdown from './notice-markdown';
import AppIcon from './app-icon';
import './bureau-notice.css';

export default function BureauNotice({ notice, bureau }: { notice?: EvaluationNotice | null; bureau?: Bureau }) {
  if (!notice?.markdown.trim()) return null;
  const updated = new Date(notice.updatedAt);
  const dateLabel = Number.isNaN(updated.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(updated);

  return <section className="bureau-notice" aria-labelledby="bureau-notice-title">
    <div className="bureau-notice-heading">
      <h2 id="bureau-notice-title"><AppIcon name="notification" size={24} />{bureau ? `${bureau} 공지사항` : '공지사항'}</h2>
      {dateLabel && <time dateTime={notice.updatedAt}>수정 {dateLabel}</time>}
    </div>
    <NoticeMarkdown markdown={notice.markdown} />
  </section>;
}
