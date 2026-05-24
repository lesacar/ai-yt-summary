document.addEventListener('DOMContentLoaded', () => {
    const summarizeButton = document.getElementById('summarize');
    const regenerateButton = document.getElementById('regenerate');
    const conciseButton = document.getElementById('concise');
    const detailedButton = document.getElementById('detailed');
    const outputDiv = document.getElementById('output');
    const outputContent = document.getElementById('output-content');
    const loader = document.getElementById('loader');
    const cancelButton = document.getElementById('cancel');
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const copyButton = document.getElementById('copy');

    function isYouTubeVideoURL(url) {
        return url && (
            url.match(/youtube\.com\/watch\?v=/) ||
            url.match(/youtu\.be\//)
        );
    }

    function updateUI() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputContent.textContent = "Please navigate to a YouTube video page.";
                summarizeButton.disabled = true;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
                copyButton.disabled = true;
                loader.style.display = 'none';
                return;
            }

            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                loader.style.display = 'none';

                if (data) {
                    if (data.processing) {
                        outputContent.textContent = "Processing...";
                        loader.style.display = 'block';
                        summarizeButton.disabled = true;
                        summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                        regenerateButton.disabled = true;
                        cancelButton.disabled = false;
                        copyButton.disabled = true;
                        return;
                    } else if (data.summary) {
                        if (data.summary.startsWith("Error:")) {
                            outputContent.textContent = data.summary;
                            summarizeButton.disabled = false;
                            summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                            regenerateButton.disabled = true;
                            copyButton.disabled = true;
                        } else {
                            outputContent.innerHTML = data.summary;
                            summarizeButton.disabled = true;
                            summarizeButton.setAttribute('data-tooltip', 'Use the buttons below after first generation');
                            regenerateButton.disabled = false;
                            copyButton.disabled = false;
                        }
                        cancelButton.disabled = true;
                        return;
                    }
                }

                outputContent.textContent = "Click ✨ to generate a summary.";
                summarizeButton.disabled = false;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
                copyButton.disabled = true;
            });
        });
    }

    // Font size slider
    function applyFontSize(size) {
        outputDiv.style.fontSize = size + 'px';
        fontSizeValue.textContent = size + 'px';
    }

    chrome.storage.sync.get('fontSize', (result) => {
        const size = result.fontSize || 16;
        fontSizeSlider.value = size;
        applyFontSize(size);
    });

    fontSizeSlider.addEventListener('input', () => {
        const size = parseInt(fontSizeSlider.value);
        applyFontSize(size);
        chrome.storage.sync.set({ fontSize: size });
    });

    function startProcessing(style = null) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputContent.textContent = "Please navigate to a YouTube video page.";
                return;
            }

            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                if (data && data.processing) {
                    outputContent.textContent = "Already processing...";
                    return;
                }

                outputContent.textContent = "";
                loader.style.display = "block";
                summarizeButton.disabled = true;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = false;
                copyButton.disabled = true;

                chrome.runtime.sendMessage({ 
                    action: "processVideo", 
                    url, 
                    summaryStyle: style 
                }, (response) => {
                    if (response && response.error) {
                        loader.style.display = "none";
                        outputContent.textContent = `Error: ${response.error}`;
                        cancelButton.disabled = true;
                        summarizeButton.disabled = false;
                        summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                        copyButton.disabled = true;
                    }
                });
            });
        });
    }

    updateUI();

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "updateUI") {
            updateUI();
        }
    });

    summarizeButton.addEventListener('click', () => startProcessing());
    conciseButton.addEventListener('click', () => startProcessing('concise'));
    detailedButton.addEventListener('click', () => startProcessing('detailed'));

    copyButton.addEventListener('click', () => {
        if (copyButton.disabled) return;
        const text = outputContent.textContent || outputContent.innerText;
        navigator.clipboard.writeText(text).then(() => {
            copyButton.classList.add('flash-success');
            setTimeout(() => copyButton.classList.remove('flash-success'), 1500);
        });
    });

    regenerateButton.addEventListener('click', () => {
        if (regenerateButton.disabled) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputContent.textContent = "Please navigate to a YouTube video page.";
                return;
            }
            
            chrome.storage.local.get([url], (result) => {
                const currentStyle = result[url]?.summaryStyle || null;
                chrome.storage.local.remove(url, () => {
                    startProcessing(currentStyle);
                });
            });
        });
    });

    cancelButton.addEventListener('click', () => {
        if (cancelButton.disabled) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url) return;
            
            chrome.storage.local.remove(url, () => {
                loader.style.display = "none";
                outputContent.textContent = "Generation cancelled";
                summarizeButton.disabled = false;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
                copyButton.disabled = true;
            });
        });
    });
});
