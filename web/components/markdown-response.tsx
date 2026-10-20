import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownResponse({ content }: { content: string }) {
  return (
    <div className="markdown-response">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
        a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        // Evitar que respuestas del modelo carguen recursos de terceros automáticamente.
        img: ({ alt }) => <span>{alt}</span>,
        table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
      }}>{content}</Markdown>
    </div>
  );
}
