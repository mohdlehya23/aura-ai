import { devLog } from './config.js';

export class ConfigManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.providers = [];
        this.elements = {
            providersList: document.getElementById('adv-providers-list'),
            deepgramKey: document.getElementById('adv-deepgram-key'),
            saveDeepgramBtn: document.getElementById('save-deepgram-btn'),
            saveProvidersBtn: document.getElementById('save-all-providers-btn')
        };

        this.init();
    }

    async init() {
        if (!this.elements.providersList) return;

        await this.loadInitialData();
        this.setupEventListeners();
    }

    async loadInitialData() {
        try {
            // Load full providers with keys
            const pResp = await fetch('/api/ai-providers/full');
            this.providers = await pResp.json();

            // Load Deepgram key
            const dResp = await fetch('/api/deepgram-key');
            const dData = await dResp.json();
            if (this.elements.deepgramKey) {
                this.elements.deepgramKey.value = dData.key || '';
            }

            this.renderProviders();
        } catch (error) {
            console.error('Failed to load advanced config data:', error);
        }
    }

    setupEventListeners() {
        if (this.elements.saveDeepgramBtn) {
            this.elements.saveDeepgramBtn.addEventListener('click', () => this.saveDeepgramKey());
        }

        if (this.elements.deepgramKey) {
            this.elements.deepgramKey.addEventListener('blur', () => {
                const val = (this.elements.deepgramKey.value || '').trim();
                if (val && !val.startsWith('your_') && !val.startsWith('YOUR_')) {
                    this.saveDeepgramKey();
                }
            });
        }

        if (this.elements.saveProvidersBtn) {
            this.elements.saveProvidersBtn.addEventListener('click', () => this.saveProviders());
        }
    }

    renderProviders() {
        if (!this.elements.providersList) return;

        this.elements.providersList.innerHTML = '';

        this.providers.forEach((provider, pIndex) => {
            const tr = document.createElement('tr');

            // Name Cell
            const nameTd = document.createElement('td');
            nameTd.innerHTML = `<strong>${provider.name}</strong><br><small>${provider.baseURL}</small>`;
            tr.appendChild(nameTd);

            // Keys Cell
            const keysTd = document.createElement('td');
            const keyListDiv = document.createElement('div');
            keyListDiv.className = 'key-list';

            // Filter out placeholder keys so inputs aren't pre-filled with mysterious fake password dots
            let rawKeys = provider.apiKeys || [provider.apiKey || ''];
            let cleanedKeys = rawKeys
                .map(k => (k || '').trim())
                .filter(k => k && !k.startsWith('YOUR_') && !k.startsWith('PLACEHOLDER'));

            // Always display at least one input field
            const apiKeysToRender = cleanedKeys.length > 0 ? cleanedKeys : [''];

            apiKeysToRender.forEach((key, kIndex) => {
                const group = document.createElement('div');
                group.className = 'key-input-group';

                const input = document.createElement('input');
                input.type = 'password';
                input.value = key;
                input.placeholder = `Paste API Key ${kIndex + 1} here`;
                input.addEventListener('input', (e) => {
                    const val = e.target.value.trim();
                    if (!provider.apiKeys) {
                        provider.apiKeys = [];
                    }
                    provider.apiKeys[kIndex] = val;
                    if (kIndex === 0) {
                        provider.apiKey = val;
                    }
                });

                group.appendChild(input);

                if (apiKeysToRender.length > 1) {
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-key-btn';
                    removeBtn.textContent = '×';
                    removeBtn.title = 'Remove key';
                    removeBtn.onclick = () => {
                        if (provider.apiKeys) {
                            provider.apiKeys.splice(kIndex, 1);
                        }
                        this.renderProviders();
                    };
                    group.appendChild(removeBtn);
                }

                keyListDiv.appendChild(group);
            });

            const addKeyBtn = document.createElement('button');
            addKeyBtn.className = 'add-key-btn';
            addKeyBtn.textContent = '+';
            addKeyBtn.title = 'Add API key for rotation';
            addKeyBtn.onclick = () => {
                if (!provider.apiKeys) {
                    provider.apiKeys = cleanedKeys.length > 0 ? [...cleanedKeys] : [];
                }
                provider.apiKeys.push('');
                this.renderProviders();
            };

            keysTd.appendChild(keyListDiv);
            keysTd.appendChild(addKeyBtn);
            tr.appendChild(keysTd);

            // Actions Cell
            const actionsTd = document.createElement('td');
            const testBtn = document.createElement('button');
            testBtn.className = 'save-small';
            testBtn.textContent = 'Test Connection';
            testBtn.onclick = () => this.testProviderConnection(provider, testBtn);
            actionsTd.appendChild(testBtn);
            tr.appendChild(actionsTd);

            this.elements.providersList.appendChild(tr);
        });
    }

    async testProviderConnection(provider, btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Testing...';
        btn.disabled = true;

        try {
            // Read latest values directly from input elements in the row
            const tr = btn.closest('tr');
            const inputs = tr ? Array.from(tr.querySelectorAll('input')) : [];
            const enteredKeys = inputs
                .map(inp => inp.value.trim())
                .filter(val => val && !val.startsWith('YOUR_') && !val.startsWith('PLACEHOLDER'));

            // Fallback to provider object
            const providerKeys = (provider.apiKeys || [provider.apiKey || ''])
                .map(k => (k || '').trim())
                .filter(k => k && !k.startsWith('YOUR_') && !k.startsWith('PLACEHOLDER'));

            const keysToTest = enteredKeys.length > 0 ? enteredKeys : providerKeys;

            if (keysToTest.length === 0) {
                alert('Please paste a valid API key first.');
                btn.textContent = originalText;
                btn.disabled = false;
                return;
            }

            const testKey = keysToTest[0];
            const testModel = provider.defaultModel || (provider.models?.[0]?.modelName || provider.models?.[0] || 'gemini-3.8-flash');

            const response = await fetch('/api/verify-provider', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: provider.name,
                    model: testModel,
                    apiKey: testKey,
                    apiKeys: keysToTest
                }),
            });

            const result = await response.json();

            if (result.success) {
                btn.textContent = '✅ Success';
                btn.style.borderColor = 'var(--accent-success)';
                provider.apiKey = testKey;
                provider.apiKeys = keysToTest;
                if (window.screenshotService?.showNotification) {
                    window.screenshotService.showNotification('✅ Key Verified & Saved', `${provider.name} connected successfully!`, 'success');
                }
            } else {
                btn.textContent = '❌ Failed';
                btn.style.borderColor = 'var(--accent-warning)';
                const errMsg = result.error || 'Verification failed. Please check your API key.';
                if (window.screenshotService?.showNotification) {
                    window.screenshotService.showNotification('❌ Verification Failed', errMsg, 'error');
                } else {
                    alert(`Verification failed: ${errMsg}`);
                }
            }

            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
                btn.style.borderColor = '';
            }, 3500);

        } catch (error) {
            console.error('Test failed:', error);
            btn.textContent = '❌ Error';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 3000);
        }
    }

    async saveDeepgramKey() {
        const key = this.elements.deepgramKey.value;
        const btn = this.elements.saveDeepgramBtn;
        const originalText = btn.textContent;

        btn.textContent = 'Saving...';
        btn.disabled = true;

        try {
            const resp = await fetch('/api/save-deepgram-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key })
            });

            if (resp.ok) {
                btn.textContent = '✅ Saved';
                devLog('Deepgram key saved successfully');
            } else {
                btn.textContent = '❌ Failed';
            }

            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Save failed:', error);
            btn.textContent = 'Error';
            btn.disabled = false;
        }
    }

    async saveProviders() {
        const btn = this.elements.saveProvidersBtn;
        const originalText = btn.textContent;

        btn.textContent = 'Saving Configuration...';
        btn.disabled = true;

        try {
            const resp = await fetch('/api/save-ai-providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providers: this.providers })
            });

            if (resp.ok) {
                btn.textContent = '✅ All Changes Saved';
                devLog('AI Providers saved successfully');

                // Trigger reload in provider manager if available
                if (window.providerManager) {
                    await window.providerManager.loadAiProviders();
                }
            } else {
                btn.textContent = '❌ Save Failed';
            }

            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 3000);
        } catch (error) {
            console.error('Save failed:', error);
            btn.textContent = 'Error';
            btn.disabled = false;
        }
    }
}
