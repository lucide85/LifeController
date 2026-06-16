"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// Render AI-generated / user markdown to HTML. Raw HTML is NOT enabled (no
// rehype-raw), and rehype-sanitize strips anything unsafe — load-bearing even for
// a single-tenant app, since the markdown can come from an LLM or the web.
// Styled with arbitrary child-selectors (no @tailwindcss/typography dependency).
export function Markdown({ children }: { children: string }) {
  return (
    <div
      className="text-sm leading-relaxed text-foreground/90 [&>*:first-child]:mt-0
        [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
        [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
        [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]
        [&_h1]:mt-5 [&_h1]:text-lg [&_h1]:font-bold
        [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold
        [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold
        [&_hr]:my-4 [&_hr]:border-border
        [&_li]:my-0.5
        [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
        [&_p]:my-2
        [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3
        [&_strong]:font-semibold
        [&_table]:my-3 [&_table]:w-full [&_table]:text-left
        [&_td]:border-t [&_td]:border-border [&_td]:py-1.5 [&_td]:pr-4
        [&_th]:border-b [&_th]:border-border [&_th]:py-1.5 [&_th]:pr-4 [&_th]:font-semibold
        [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
