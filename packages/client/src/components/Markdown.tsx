import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from '@vtt/shared';

/**
 * Renderer markdowna (etap 24a).
 *
 * Nie ma tu `dangerouslySetInnerHTML` i nie ma sanitizera — `parseMarkdown`
 * z `shared` zwraca **drzewo bloków**, a każdy węzeł staje się elementem
 * React. Znacznik HTML wpisany w treść jest tekstem, bo nie ma drogi, którą
 * mógłby stać się czymkolwiek innym. Ma to znaczenie już przy handoutach MG,
 * a stanie się kluczowe w 24c, gdzie treść pisze model językowy.
 */

function renderInline(nodes: MarkdownInline[]): ReactNode {
  return nodes.map((node, index) => {
    const key = index;
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>;
      case 'break':
        return <br key={key} />;
      case 'code':
        return (
          <code key={key} className="md-code">
            {node.value}
          </code>
        );
      case 'strong':
        return <strong key={key}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={key}>{renderInline(node.children)}</em>;
      case 'link':
        // `noreferrer` razem z `noopener`: handout może wskazywać stronę spoza
        // stołu, a ta nie musi wiedzieć, skąd przyszedł gracz.
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

function renderBlock(block: MarkdownBlock, key: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1]!;
      // Nagłówek handoutu jest nagłówkiem sekcji w oknie, nie strony — stąd
      // start od h3, żeby okno nie kłóciło się z hierarchią całego widoku.
      return (
        <Tag key={key} className={`md-h md-h${block.level}`}>
          {renderInline(block.children)}
        </Tag>
      );
    }
    case 'paragraph':
      return <p key={key}>{renderInline(block.children)}</p>;
    case 'list':
      return block.ordered ? (
        <ol key={key} className="md-list">
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="md-list">
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case 'quote':
      return (
        <blockquote key={key} className="md-quote">
          {renderInline(block.children)}
        </blockquote>
      );
    case 'code':
      return (
        <pre key={key} className="md-pre">
          <code>{block.value}</code>
        </pre>
      );
    case 'rule':
      return <hr key={key} className="md-rule" />;
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;
  return (
    <div className={className ? `markdown ${className}` : 'markdown'}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
