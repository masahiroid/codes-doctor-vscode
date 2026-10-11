import { escapeHtml } from '../html';
import { homePageStyles } from './pages/homePageStyles';
import { homePageScript } from './pages/homePageScript';
import { renderErrorPageLayout } from './pages/errorPageLayout';
import { ANALYSIS_LANGUAGES, AUTO_LANGUAGE, AnalysisLanguage, SOURCE_LANGUAGES } from '../analyzer/languages/catalog';

/** Dropdown wording that differs from a language's plain name. */
const LANGUAGE_OPTION_LABELS: Partial<Record<AnalysisLanguage, string>> = {
  [AUTO_LANGUAGE]: '自動検出 (推奨)',
  typescript: 'TypeScript/JavaScript',
  javascript: 'JavaScript のみ',
  dart: 'Dart (Flutter)',
};

function languageOptionLabel(language: AnalysisLanguage): string {
  return LANGUAGE_OPTION_LABELS[language] ?? SOURCE_LANGUAGES.find((source) => source.id === language)?.label ?? language;
}

function renderLanguageOptions(): string {
  return ANALYSIS_LANGUAGES
    .map((language) => `<option value="${language}">${escapeHtml(languageOptionLabel(language))}</option>`)
    .join('\n                ');
}

export function renderHomePage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Doctor - コード構造監査レポート</title>
    <style>${homePageStyles()}</style>
</head>
<body>
    <div class="container">
        <h1>Code Doctor</h1>
        <p class="subtitle">コード構造監査レポート</p>

        <div class="upload-section">
            <div class="section-title">解析言語の選択</div>
            <p class="section-help">分析対象の主要言語を選択してください。通常は自動検出で問題ありません。</p>
            <label for="languageSelect" class="language-select-label">
                解析言語
            </label>
            <select id="languageSelect" class="language-select">
                ${renderLanguageOptions()}
            </select>
        </div>

        <div class="upload-section">
            <div class="section-title">ZIPファイル選択</div>
            <p class="section-help">ZIP にまとめたソースコードをアップロードして分析します。</p>
            <label class="file-input-label">
                <div class="file-input-wrapper">
                    <input type="file" id="fileInput" accept=".zip" />
                    ZIPファイルを選択
                </div>
            </label>
            <div class="file-name" id="fileName"></div>
            <button id="uploadBtn" onclick="uploadFile()" disabled>
              解析開始
            </button>
        </div>

        <div class="upload-section">
            <div class="section-title">解析フォルダーを指定</div>
            <p class="section-help">サーバーから参照できるローカルフォルダーを、そのまま直接スキャンします。</p>
            <input id="repoPathInput" class="path-input" type="text" placeholder="例: /Users/yourname/projects/my-app" />
            <div class="selection-note">ブラウザの制約上、Web画面からフォルダーの実パスを自動取得できないため、直接スキャン時のみパス指定が必要です。</div>
            <button id="directoryAnalyzeBtn" onclick="analyzePath()">
              分析開始
            </button>
        </div>

        <div id="progress">
            <div class="spinner"></div>
            <p>分析中...</p>
        </div>

        <div id="result"></div>
        <div id="error"></div>
    </div>

    <script>${homePageScript()}</script>
</body>
</html>`;
}

export function renderAnalysisErrorPage(message: string): string {
  return renderErrorPageLayout({
    title: '分析エラー',
    bodyHtml: `
          <h1>分析エラー</h1>
          <p>レポート生成中にエラーが発生しました:</p>
          <pre>${escapeHtml(message)}</pre>
          <a href="/">トップページに戻る</a>
    `,
  });
}

export function renderReportNotFoundPage(analysisId: string): string {
  return renderErrorPageLayout({
    title: 'レポートが見つかりません',
    maxWidthPx: 500,
    centerText: true,
    bodyHtml: `
          <h1>レポートが見つかりません</h1>
          <p>Analysis ID: <code>${escapeHtml(analysisId)}</code></p>
          <p>このレポートは存在しないか、既に削除されています。</p>
          <a href="/">トップページに戻る</a>
    `,
  });
}
