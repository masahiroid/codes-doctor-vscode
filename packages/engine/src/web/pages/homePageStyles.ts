export function homePageStyles(): string {
  return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f3f4f6;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            padding: 40px;
          max-width: 560px;
            width: 100%;
        }

        h1 {
            color: #111827;
            margin-bottom: 10px;
            font-size: 2em;
            font-weight: 600;
        }

        .subtitle {
            color: #6b7280;
            margin-bottom: 30px;
            font-size: 0.95em;
        }

        .upload-section {
          margin: 28px 0;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
        }

        .upload-section:first-of-type {
          padding-top: 0;
          border-top: none;
        }

        .section-title {
          font-size: 1.15em;
          font-weight: 700;
          color: #111827;
          margin-bottom: 12px;
        }

        .section-help {
          margin-bottom: 14px;
          color: #6b7280;
          font-size: 0.92em;
          line-height: 1.5;
        }

        .file-input-wrapper {
            position: relative;
            overflow: hidden;
            display: inline-block;
            width: 100%;
        }

        .file-input-wrapper input[type=file] {
            position: absolute;
            left: -9999px;
        }

        .file-input-label {
            display: block;
            padding: 20px;
            background: #2563eb;
            color: white;
            border-radius: 6px;
            text-align: center;
            cursor: pointer;
            font-weight: 600;
            transition: background 0.2s;
        }

        .file-input-label:hover {
            background: #3b82f6;
        }

        .file-name {
            margin-top: 10px;
            color: #6b7280;
            font-size: 0.9em;
        }

        .path-input {
            width: 100%;
            padding: 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 0.95em;
        }

        .selection-note {
            margin-top: 10px;
            color: #6b7280;
            font-size: 0.9em;
            line-height: 1.5;
        }

        .language-select {
            width: 100%;
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 1em;
            background: white;
            cursor: pointer;
        }

        .language-select-label {
            display: block;
            margin-bottom: 8px;
            color: #374151;
            font-weight: 600;
        }

        button {
            width: 100%;
            padding: 15px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1em;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 20px;
        }

        button:hover:not(:disabled) {
            background: #3b82f6;
        }

        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        #progress {
            display: none;
            margin: 20px 0;
            text-align: center;
        }

        .spinner {
            border: 4px solid #e5e7eb;
            border-top: 4px solid #2563eb;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        #result {
            display: none;
            margin: 20px 0;
            padding: 20px;
            background: #d1fae5;
            border-left: 4px solid #059669;
            border-radius: 6px;
        }

        #error {
            display: none;
            margin: 20px 0;
            padding: 20px;
            background: #fee2e2;
            border-left: 4px solid #dc2626;
            border-radius: 6px;
            color: #991b1b;
        }

        a {
            color: #2563eb;
            text-decoration: none;
            font-weight: 600;
        }

        a:hover {
            text-decoration: underline;
        }
  `;
}
