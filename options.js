document.addEventListener('DOMContentLoaded', () => {
    const apiProvider = document.getElementById('apiProvider');
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const baseUrlGroup = document.getElementById('baseUrlGroup');
    const apiKey = document.getElementById('apiKey');
    const baseUrl = document.getElementById('baseUrl');
    const modelName = document.getElementById('modelName');
    const modelHint = document.getElementById('modelHint');
    const transcriptServer = document.getElementById('transcriptServer');
    const saveButton = document.getElementById('save');
    const savedMessage = document.getElementById('savedMessage');
    const resetTranscriptServer = document.getElementById('resetTranscriptServer');
    const resetBaseUrl = document.getElementById('resetBaseUrl');

    const DEFAULT_TRANSCRIPT_SERVER = 'http://localhost:5000/get_transcript';
    const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1';

    const providerDefaults = {
        'openai': {
            defaultModel: 'gpt-4-turbo-preview',
            hint: 'Examples: gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo'
        }
    };

    // Load saved settings
    chrome.storage.local.get(['apiProvider', 'apiKey', 'modelName', 'baseUrl', 'transcriptServer'], (result) => {
        if (result.apiProvider) {
            apiProvider.value = result.apiProvider;
            toggleApiKeyField();
            updateModelHint(result.apiProvider);
        }
        if (result.apiKey) {
            apiKey.value = result.apiKey;
        }
        if (result.modelName) {
            modelName.value = result.modelName;
        }
        if (result.baseUrl) {
            baseUrl.value = result.baseUrl;
        }
        transcriptServer.value = result.transcriptServer || DEFAULT_TRANSCRIPT_SERVER;
    });

    function toggleApiKeyField() {
        apiKeyGroup.style.display = 'block';
        baseUrlGroup.style.display = 'block';
    }

    function updateModelHint(provider) {
        modelHint.textContent = providerDefaults[provider]?.hint || '';
        modelName.placeholder = providerDefaults[provider]?.defaultModel || '';
    }

    apiProvider.addEventListener('change', () => {
        const provider = apiProvider.value;
        toggleApiKeyField();
        updateModelHint(provider);
        modelName.value = providerDefaults[provider]?.defaultModel || '';
        if (provider === 'openai') {
            baseUrl.value = DEFAULT_OPENAI_URL;
        }
    });

    resetTranscriptServer.addEventListener('click', () => {
        transcriptServer.value = DEFAULT_TRANSCRIPT_SERVER;
    });

    resetBaseUrl.addEventListener('click', () => {
        baseUrl.value = DEFAULT_OPENAI_URL;
    });

    saveButton.addEventListener('click', () => {
        const settings = {
            apiProvider: apiProvider.value,
            apiKey: apiKey.value,
            modelName: modelName.value || providerDefaults[apiProvider.value]?.defaultModel,
            transcriptServer: transcriptServer.value || DEFAULT_TRANSCRIPT_SERVER
        };

        if (apiProvider.value === 'openai') {
            settings.baseUrl = baseUrl.value || DEFAULT_OPENAI_URL;
        }

        chrome.storage.local.set(settings, () => {
            savedMessage.style.display = 'block';
            setTimeout(() => {
                savedMessage.style.display = 'none';
            }, 2000);
        });
    });
}); 