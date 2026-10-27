import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './notice-markdown.css';

/** Keep relative links, web links and email links; never execute authored URLs. */
export function noticeUrlTransform(url: string) {
  const safe = defaultUrlTransform(url);
  if (!safe || /[\u0000-\u001f\u007f-\u009f]/.test(safe)) return '';
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(safe);
  return protocol && !/^(https?|mailto)$/i.test(protocol[1]) ? '' : safe;
}

const components: Components = {
  a: ({ href, title, children, id, 'aria-describedby': describedBy, 'aria-label': label }) => {
    if (!href) return <span>{children}</span>;
    const external = /^(?:https?:)?\/\//i.test(href);
    return <a href={href} title={title} id={id} aria-describedby={describedBy} aria-label={label}
      target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
      {children}{external && <span className="notice-markdown-new-window"> (새 창)</span>}
    </a>;
  },
  // A notice never loads tracking images or embeds third-party content.
  img: ({ alt }) => <span className="notice-markdown-image">{alt || '이미지'}</span>,
  table: ({ children }) => <div className="notice-markdown-table" role="region" aria-label="공지사항 표" tabIndex={0}><table>{children}</table></div>,
};

export default function NoticeMarkdown({ markdown }: { markdown: string }) {
  return <div className="notice-markdown">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={noticeUrlTransform} components={components}
      remarkRehypeOptions={{ footnoteLabel: '각주', footnoteBackLabel: '본문으로 돌아가기' }}>
      {markdown}
    </Markdown>
  </div>;
}
