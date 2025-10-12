// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const summarizeButton = document.getElementById('summarize');
    const regenerateButton = document.getElementById('regenerate');
    const conciseButton = document.getElementById('concise');
    const detailedButton = document.getElementById('detailed');
    const outputDiv = document.getElementById('output');
    const loader = document.getElementById('loader');
    const cancelButton = document.getElementById('cancel');

    function isYouTubeVideoURL(url) {
        return url && (
            url.match(/youtube\.com\/watch\?v=/) ||
            url.match(/youtu\.be\//)
        );
    }

    // ONLY update the UI display - never trigger processing
    function updateUI() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url || !isYouTubeVideoURL(url)) {
                outputDiv.textContent = "Please navigate to a YouTube video page.";
                summarizeButton.disabled = true;
                regenerateButton.style.display = 'none';
                cancelButton.style.display = 'none';
                loader.style.display = 'none';
                return;
            }

            summarizeButton.disabled = false;
            chrome.storage.local.get([url], (result) => {
                const data = result[url];
                loader.style.display = 'none';
                cancelButton.style.display = 'none';

                if (data) {
                    if (data.processing) {
                        outputDiv.textContent = "Processing...";
                        loader.style.display = 'block';
                        summarizeButton.style.display = 'none';
                        regenerateButton.style.display = 'none';
                        cancelButton.style.display = 'block';
                    } else if (data.summary) {
                        if (data.summary.startsWith("Error:")) {
                            outputDiv.textContent = data.summary;
                            summarizeButton.style.display = 'block';
                            regenerateButton.style.display = 'none';
                        } else {
                            outputDiv.innerHTML = data.summary;
                            summarizeButton.style.display = 'none';
                            regenerateButton.style.display = 'block';
                        }
                    } else {
                        // No summary, no error, not processing
                        outputDiv.textContent = "Click 'Summarize' to generate a summary.";
                        summarizeButton.style.display = 'block';
                        regenerateButton.style.display = 'none';
                    }
                } else {
                    outputDiv.textContent = "Click 'Summarize' to generate a summary.";
                    summarizeButton.style.display = 'block';
                    regenerateButton.style.display = 'none';
                }
            });
        });
    }

    // Function to start processing (only called by user actions)
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

                // Clear any previous state and start processing
                outputDiv.textContent = "";
                loader.style.display = "block";
                summarizeButton.style.display = 'none';
                regenerateButton.style.display = 'none';
                cancelButton.style.display = 'block';

                chrome.runtime.sendMessage({ 
                    action: "processVideo", 
                    url, 
                    summaryStyle: style 
                }, (response) => {
                    if (response && response.error) {
                        loader.style.display = "none";
                        outputDiv.textContent = `Error: ${response.error}`;
                        cancelButton.style.display = 'none';
                        summarizeButton.style.display = 'block';
                    }
                });
            });
        });
    }

    // Immediately update the UI when the popup opens.
    updateUI();

    // Listen for background script messages to update the UI.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "updateUI") {
            updateUI();
        }
    });

    // Button handlers - only trigger processing on user click
    summarizeButton.addEventListener('click', () => startProcessing());
    conciseButton.addEventListener('click', () => startProcessing('concise'));
    detailedButton.addEventListener('click', () => startProcessing('detailed'));

    // Regenerate button
    regenerateButton.addEventListener('click', () => {
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

    // Cancel button
    cancelButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url?.trim();
            if (!url) return;
            
            chrome.storage.local.remove(url, () => {
                loader.style.display = "none";
                outputDiv.textContent = "Generation cancelled";
                summarizeButton.style.display = 'block';
                regenerateButton.style.display = 'none';
                cancelButton.style.display = 'none';
            });
        });
    });
});
