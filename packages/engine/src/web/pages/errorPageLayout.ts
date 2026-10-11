/**
 * Shared chrome for the two error pages (analysis error, report not found).
 * Both previously duplicated this CSS almost verbatim; `maxWidthPx` and
 * `centerText` are the only two things that actually differed between them.
 */
export function renderErrorPageLayout(options: {
  title: string;
  bodyHtml: string;
  maxWidthPx?: number;
  centerText?: boolean;
}): string {
  const { title, bodyHtml, maxWidthPx = 600, centerText = false } = options;

  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f3f4f6;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
          }
          .error-container {
            background: white;
            border-radius: 8px;
            padding: 40px;
            max-width: ${maxWidthPx}px;
            ${centerText ? 'text-align: center;' : ''}
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 {
            color: #dc2626;
            font-size: 1.5em;
            margin-bottom: 15px;
          }
          p {
            color: #6b7280;
            line-height: 1.6;
            margin: 10px 0;
          }
          pre {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 6px;
            overflow-x: auto;
            font-size: 0.9em;
            color: #374151;
          }
          code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.9em;
          }
          a {
            display: inline-block;
            margin-top: 20px;
            padding: 10px 20px;
            background: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: background 0.2s;
          }
          a:hover {
            background: #3b82f6;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          ${bodyHtml}
        </div>
      </body>
    </html>
  `;
}
