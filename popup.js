document.addEventListener('DOMContentLoaded', () => {
    const summarizeButton = document.getElementById('summarize');
    const regenerateButton = document.getElementById('regenerate');
    const conciseButton = document.getElementById('concise');
    const detailedButton = document.getElementById('detailed');
    const outputDiv = document.getElementById('output');
    const loader = document.getElementById('loader');
    const cancelButton = document.getElementById('cancel');
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');

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
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                summarizeButton.disabled = true;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
                loader.style.display = 'none';
                return;
            }

            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                loader.style.display = 'none';

                if (data) {
                    if (data.processing) {
                        outputDiv.textContent = "Processing...";
                        loader.style.display = 'block';
                        summarizeButton.disabled = true;
                        summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                        regenerateButton.disabled = true;
                        cancelButton.disabled = false;
                        return;
                    } else if (data.summary) {
                        if (data.summary.startsWith("Error:")) {
                            outputDiv.textContent = data.summary;
                            summarizeButton.disabled = false;
                            summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                            regenerateButton.disabled = true;
                        } else {
                            outputDiv.innerHTML = data.summary;
                            summarizeButton.disabled = true;
                            summarizeButton.setAttribute('data-tooltip', 'Use the buttons below after first generation');
                            regenerateButton.disabled = false;
                        }
                        cancelButton.disabled = true;
                        return;
                    }
                }

                outputDiv.textContent = "Click ✨ to generate a summary.";
                summarizeButton.disabled = false;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
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
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                return;
            }

            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                if (data && data.processing) {
                    outputDiv.textContent = "Already processing...";
                    return;
                }

                outputDiv.textContent = "";
                loader.style.display = "block";
                summarizeButton.disabled = true;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = false;

                chrome.runtime.sendMessage({ 
                    action: "processVideo", 
                    url, 
                    summaryStyle: style 
                }, (response) => {
                    if (response && response.error) {
                        loader.style.display = "none";
                        outputDiv.textContent = `Error: ${response.error}`;
                        cancelButton.disabled = true;
                        summarizeButton.disabled = false;
                        summarizeButton.setAttribute('data-tooltip', 'Summarize video');
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

    regenerateButton.addEventListener('click', () => {
        if (regenerateButton.disabled) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
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
                outputDiv.textContent = "Generation cancelled";
                summarizeButton.disabled = false;
                summarizeButton.setAttribute('data-tooltip', 'Summarize video');
                regenerateButton.disabled = true;
                cancelButton.disabled = true;
            });
        });
    });
});
