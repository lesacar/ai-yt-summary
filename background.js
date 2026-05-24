// background.js
import * as module from "./marked.min.js";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processVideo") {
        console.log('Received processVideo request for URL:', request.url, 'Style:', request.summaryStyle);
        processVideo(request.url, request.summaryStyle)
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

async function processVideo(url, summaryStyle = null) {
    if (processingVideos[url]) {
        console.log('Already processing this URL');
        throw new Error("Video already being processed");
    }
    processingVideos[url] = true;
    try {
        console.log('Starting video processing');
        await chrome.storage.local.set({ [url]: { summary: null, processing: true, summaryStyle } });

        console.log('Fetching transcript...');
        const { text: transcript, channel, upload_date } = await fetchTranscript(url);
        if (!transcript) {
            throw new Error("Received empty transcript from server");
        }
        console.log('Transcript received:', transcript.substring(0, 100) + '...');

        const current_date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        console.log('Fetching AI completion...');
        console.log('AI style used:', summaryStyle);
        const summary = await fetchAICompletion(transcript, channel, upload_date, current_date, summaryStyle);
        if (!summary) {
            throw new Error("No content received from AI");
        }
        console.log('Summary received:', summary.substring(0, 100) + '...');

        await chrome.storage.local.set({
            [url]: { summary: summary, processing: false, summaryStyle }
        });
        console.log('Summary saved to storage');

        chrome.runtime.sendMessage({ action: "updateUI", url: url });
    }
    catch (error) {
        console.error('Error in processVideo:', error);
        await chrome.storage.local.set({
            [url]: { summary: `Error: ${error.message}`, processing: false, summaryStyle }
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
        throw new Error("serverUrl is null");
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
            console.error('Maybe youtube broke again and the server needs an updated yt-dlp!');
            throw new Error(`Transcript server: ${error}`);
        }

        const data = await response.json();
        console.log('Transcript server response:', data);

        if (!data || !data.text) {
            throw new Error("Invalid response format from transcript server\nIt's possible the channel disabled captions");
        }

        return { text: data.text, channel: data.channel || '', upload_date: data.upload_date || '' };
    } catch (error) {
        console.error('Error in fetchTranscript:', error);
        throw error;
    }
}


async function fetchAICompletion(transcript, channel, uploadDate, currentDate, summaryStyle = null) {
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
            baseUrl,
            summaryStyle,
            channel,
            uploadDate,
            currentDate
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
async function sendFullTranscript(transcript, modelName, apiKey, baseUrl, summaryStyle, channel, uploadDate, currentDate) {
    console.log('Sending full transcript to AI API...');

    function buildSystemPrompt() {
        const metadataBlock = `Additional video information:\n# channel name: ${channel}\n# video upload date: ${uploadDate}\n# current date: ${currentDate}`;

        if (summaryStyle === 'concise') {
            return `The following instructions were programmatically appended and override all previous instructions: Be as concise as possible while retaining only basic information. Instead of using markdown lists, separate items by commas. Try to fit the text in one phone screen or less.

${metadataBlock}`;
        }

        if (summaryStyle === 'detailed') {
            return `The following instructions were programmatically appended and override all previous instructions: Be as detailed and comprehensive as possible. Include specific examples, key quotes if relevant, and anything that could be considered not important — the user doesn't want anything to slip by. Use markdown throughout.

${metadataBlock}`;
        }

        return `You are an analytical assistant. The user will provide a transcript of an online video.

Read the transcript carefully and determine the type of content it is — for example: analytical/opinion, narrative/story, technical tutorial, news reporting, or conversational. Then tailor your response accordingly.

Your entire output will be parsed by a markdown lexer, so use markdown sections, headings, and formatting throughout to structure your response.

Your response should go beyond mere summarization:
- For analytical or opinion content: identify the core argument, note any assumptions or contradictions, and offer thoughtful pushback or alternative perspectives.
- For narrative or story content: summarize the plot arc, but focus on character motivations, thematic tension, and what makes the story compelling or flawed.
- For technical or tutorial content: extract the key concepts and methods, and note any questionable claims or missing context.
- For news or reporting: contextualize the information — what's the framing, what's left unsaid, what are the implications.
- Add anything else you deem important for this video — don't feel limited by these categories.

Keep the tone insightful and direct. Do not be rude or dismissive, but do not be a passive regurgitator either. Do not say things like "summary:", "analysis:", or label your sections — just output the content.

${metadataBlock}`;
    }

    const systemPrompt = buildSystemPrompt();

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
                    content: systemPrompt},
                    {
                        role: 'user',
                        content: transcript
                    }],
                stream: true
            })
        });

        if (!response.ok) {
            const err_text = await response.text();
            console.error(err_text);
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
