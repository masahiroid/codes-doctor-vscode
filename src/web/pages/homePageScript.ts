/**
 * Client-side script for the home page upload/analyze form.
 * Returned as a plain string so it can be inlined into the page's <script> tag.
 */
export function homePageScript(): string {
  return `
        const fileInput = document.getElementById('fileInput');
        const fileNameLabel = document.getElementById('fileName');
        const uploadBtn = document.getElementById('uploadBtn');
        const directoryAnalyzeBtn = document.getElementById('directoryAnalyzeBtn');
        const languageSelect = document.getElementById('languageSelect');
        const repoPathInput = document.getElementById('repoPathInput');
        const progressDiv = document.getElementById('progress');
        const resultDiv = document.getElementById('result');
        const errorDiv = document.getElementById('error');

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                fileNameLabel.textContent = '選択ファイル: ' + file.name;
                uploadBtn.disabled = false;
            } else {
                fileNameLabel.textContent = '';
                uploadBtn.disabled = true;
            }
        });

        function setSubmittingState(isSubmitting) {
            uploadBtn.disabled = isSubmitting || !(fileInput.files && fileInput.files[0]);
            directoryAnalyzeBtn.disabled = isSubmitting;
        }

        function showError(message) {
            progressDiv.style.display = 'none';
            errorDiv.style.display = 'block';
            errorDiv.innerHTML = 'エラー: ' + message;
        }

        function buildReportUrl(analysisId, language) {
            return '/reports/' + analysisId + (language !== 'auto' ? '?language=' + language : '');
        }

        async function uploadFile() {
            const file = fileInput.files?.[0];
            if (!file) {
                return;
            }

            const language = languageSelect.value || 'auto';
            const formData = new FormData();
            formData.append('file', file);

            setSubmittingState(true);
            progressDiv.style.display = 'block';
            resultDiv.style.display = 'none';
            errorDiv.style.display = 'none';

            try {
                const uploadUrl = '/api/upload' + (language !== 'auto' ? '?language=' + language : '');
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData,
                });

                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.error || 'Upload failed');
                }

                window.location.href = buildReportUrl(data.analysisId, language);
            } catch (error) {
                showError(error instanceof Error ? error.message : 'Unknown error');
                setSubmittingState(false);
            }
        }

        async function analyzePath() {
            const repoPath = repoPathInput.value.trim();
            if (!repoPath) {
                showError('解析フォルダーのパスを入力してください');
                return;
            }

            const language = languageSelect.value || 'auto';

            setSubmittingState(true);
            progressDiv.style.display = 'block';
            resultDiv.style.display = 'none';
            errorDiv.style.display = 'none';

            try {
                const response = await fetch('/api/analyze-path', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ repoPath, language }),
                });

                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.error || 'Path analysis failed');
                }

                window.location.href = buildReportUrl(data.analysisId, language);
            } catch (error) {
                showError(error instanceof Error ? error.message : 'Unknown error');
                setSubmittingState(false);
            }
        }
  `;
}
