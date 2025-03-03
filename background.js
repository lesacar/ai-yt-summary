import * as module from "./marked.min.js";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processVideo") {
        console.log('Received processVideo request for URL:', request.url);
        processVideo(request.url)
            .then(() => {
                console.log('Processing completed successfully');
                sendResponse({ status: "complete" });
            })
            .catch(error => {
                console.error('Processing failed:', error);
                sendResponse({ error: error.message });
            });
        return true;
    }
});

const processingVideos = {}; // prevent multiple simultaneous summarizations

async function processVideo(url) {
    if (processingVideos[url]) {
        console.log('Already processing this URL');
        throw new Error("Video already being processed");
    }
    processingVideos[url] = true;
    try {
        console.log('Starting video processing');
        await chrome.storage.local.set({ [url]: { summary: null, processing: true } });

        console.log('Fetching transcript...');
        const transcript = await fetchTranscript(url);
        if (!transcript) {
            throw new Error("Received empty transcript from server");
        }
        console.log('Transcript received:', transcript.substring(0, 100) + '...');

        console.log('Fetching AI completion...');
        const summary = await fetchAICompletion(transcript);
        if (!summary) {
            throw new Error("No content received from AI");
        }
        console.log('Summary received:', summary.substring(0, 100) + '...');

        await chrome.storage.local.set({
            [url]: { summary: summary, processing: false }
        });
        console.log('Summary saved to storage');

        chrome.runtime.sendMessage({ action: "updateUI", url: url });
    }
    catch (error) {
        console.error('Error in processVideo:', error);
        await chrome.storage.local.set({
            [url]: { summary: `Error: ${error.message}`, processing: false }
        });
        chrome.runtime.sendMessage({ action: "updateUI", url: url });
        throw error;
    } finally {
        delete processingVideos[url];
    }
}

async function fetchTranscript(url) {
    console.log('Making request to transcript server...');
    const settings = await chrome.storage.local.get(['transcriptServer']);
    const serverUrl = settings.transcriptServer || 'http://localhost:5000/get_transcript';
    if (serverUrl === null) {
        console.error("serverUrl is null");
    }

    try {
        const response = await fetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Transcript server error:', error);
            throw new Error(`Transcript server: ${error}`);
        }

        const data = await response.json();
        console.log('Transcript server response:', data);

        if (!data || !data.text) {
            throw new Error("Invalid response format from transcript server\nIt's possible the channel disabled captions");
        }

        return data.text;
    } catch (error) {
        console.error('Error in fetchTranscript:', error);
        throw error;
    }
}


async function fetchAICompletion(transcript) {
    console.log('Making request to AI API...');

    const settings = await chrome.storage.local.get(['apiKey', 'modelName', 'baseUrl']);
    const modelName = settings.modelName;
    let baseUrl = settings.baseUrl;
    if (!baseUrl) {throw new Error("No base url provided!")}
    if (!modelName) {throw new Error("No AI model name provided!")}
    if (baseUrl.charAt(baseUrl.length-1) === '/') {
        baseUrl = baseUrl.slice(0, -1);
    }

    console.log(`endpoint used: ${baseUrl}/chat/completions`);

    console.log('Using model:', modelName);

    try {
        // Replace processChunks with sendFullTranscript
        const summary = await sendFullTranscript(
            transcript, 
            modelName, 
            settings.apiKey, 
            baseUrl
        );

        if (!summary) {
            throw new Error("No content received from AI");
        }
        console.log(`Before markdown: ${modelName}:\n${summary}`);
        let ret = marked.parse(summary);
        console.log(`Markdown:\n${ret}`);
        return ret;
        // return summary;
    } catch (error) {
        console.error('Error in fetchAICompletion:', error);
        throw error;
    }
}

// use this instead of processChunks
async function sendFullTranscript(transcript, modelName, apiKey, baseUrl) {
    console.log('Sending full transcript to AI API...');

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: [{
                    role: 'system',
                    content: 'You should output markdown when it\'s necessary to list things (e.g. recipe ingredients) or when trying to emphasize something, most of your output should be plain text. Do not use markdown for everything. You should never make the entire markdown a markdown list! The user will provide you with a transcript of a video, your ONLY task is to summarize it. Focus on key facts and events. Be direct and objective.'
                }, {
                        role: 'user',
                        content: transcript
                    }],
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`AI API: ${response.status}`);
        }

        const reader = response.body.getReader();
        let fullSummary = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = new TextDecoder().decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.choices && data.choices[0].delta.content) {
                            fullSummary += data.choices[0].delta.content;
                        }
                    } catch (e) {
                        if (!line.includes('[DONE]')) {
                            console.warn('Error parsing SSE message:', e);
                        }
                    }
                }
            }
        }

        await chrome.runtime.sendMessage({ 
            action: "updateUI",
            partial: fullSummary
        }).catch(() => {});

        return fullSummary;
    } catch (error) {
        console.error('Error sending full transcript:', error);
        throw error;
    }
}
