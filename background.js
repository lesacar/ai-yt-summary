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
            throw new Error("Received empty summary from AI");
        }
        console.log('Summary received:', summary.substring(0, 100) + '...');
        
        await chrome.storage.local.set({
            [url]: { summary: summary, processing: false }
        });
        console.log('Summary saved to storage');
        
        chrome.runtime.sendMessage({ action: "updateUI", url: url });
        
    } catch (error) {
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
    try {
        const response = await fetch('http://localhost:5000/get_transcript', {
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
            throw new Error("Invalid response format from transcript server");
        }
        
        return data.text;
    } catch (error) {
        console.error('Error in fetchTranscript:', error);
        throw error;
    }
}

async function fetchAICompletion(transcript) {
    console.log('Making request to AI API...');
    try {
        const response = await fetch('http://localhost:11434/completion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2',
                prompt: `Below is a transcript from a video. Your task is to provide a clear and concise summary of its main points:

Transcript:
${transcript}

Summary:`,
                stream: true,
                raw: true
            })
        });

        if (!response.ok) {
            console.error('AI API error:', response.status);
            throw new Error(`AI API: ${response.status}`);
        }

        // Handle streaming response
        const reader = response.body.getReader();
        let summary = '';
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Convert the chunk to text and add to buffer
            buffer += new TextDecoder().decode(value);
            
            // Process any complete messages in the buffer
            while (buffer.includes('\n')) {
                const newlineIndex = buffer.indexOf('\n');
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                
                if (line.startsWith('data: ')) {
                    try {
                        const jsonStr = line.slice(6); // Remove 'data: ' prefix
                        const data = JSON.parse(jsonStr);
                        if (data.content) {
                            summary += data.content;
                            // Send a progress update to the UI
                            chrome.runtime.sendMessage({ 
                                action: "updateUI", 
                                url: null, 
                                partial: summary 
                            });
                        }
                    } catch (e) {
                        console.warn('Error parsing SSE message:', e);
                    }
                }
            }
        }
        
        if (!summary) {
            throw new Error("No content received from AI");
        }
        
        return summary;
    } catch (error) {
        console.error('Error in fetchAICompletion:', error);
        throw error;
    }
}
