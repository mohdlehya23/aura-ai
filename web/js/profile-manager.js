import { devLog, devError } from './config.js';

/**
 * ProfileManager
 * Handles bidirectional persistence of user onboarding profile and AI configuration.
 * Persists data to both localStorage (instant client-side recovery)
 * and /api/profile (disk JSON user_profile.json for cross-session survival).
 */
export class ProfileManager {
    constructor(stateManager, providerManager) {
        this.stateManager = stateManager;
        this.providerManager = providerManager;
        this.storageKey = 'aura_user_profile';
        this.saveTimeout = null;
        this.savedProfile = {};
        this.elements = {};

        this.initElements();
    }

    initElements() {
        this.elements = {
            name: document.getElementById('user-name'),
            company: document.getElementById('user-company'),
            role: document.getElementById('user-role'),
            resume: document.getElementById('user-resume'),
            objectives: document.getElementById('user-objectives'),
            instructions: document.getElementById('user-instructions'),
            providerSelect: document.getElementById('ai-provider-select'),
            modelSelect: document.getElementById('ai-model-select'),
            secondaryProviderSelect: document.getElementById('ai-secondary-provider-select'),
            secondaryModelSelect: document.getElementById('ai-secondary-model-select'),
            visionProviderSelect: document.getElementById('vision-provider-select'),
            visionModelSelect: document.getElementById('vision-model-select'),
            visionSecondaryProviderSelect: document.getElementById('vision-secondary-provider-select'),
            visionSecondaryModelSelect: document.getElementById('vision-secondary-model-select'),
            enableReasoningToggle: document.getElementById('enable-reasoning-toggle'),
            reasoningEffortSelect: document.getElementById('reasoning-effort-select'),
            enableWebSearchToggle: document.getElementById('enable-web-search-toggle'),
            webSearchBadge: document.getElementById('web-search-badge'),
            micSelect: document.getElementById('mic-select'),
            statusBadge: document.getElementById('auto-save-status')
        };
    }

    /**
     * Gathers all current values from form elements into a clean profile object.
     */
    getProfileData() {
        const focusCheckboxes = Array.from(document.querySelectorAll('input[name="focus"]:checked')).map(cb => cb.value);
        const languageCheckboxes = Array.from(document.querySelectorAll('input[name="language"]:checked')).map(cb => cb.value);

        return {
            name: this.elements.name?.value?.trim() || '',
            company: this.elements.company?.value?.trim() || '',
            role: this.elements.role?.value?.trim() || '',
            resume: this.elements.resume?.value || '',
            focus: focusCheckboxes,
            objectives: this.elements.objectives?.value || '',
            customInstructions: this.elements.instructions?.value || '',
            primaryProvider: this.elements.providerSelect?.value || '',
            primaryModel: this.elements.modelSelect?.value || '',
            secondaryProvider: this.elements.secondaryProviderSelect?.value || '',
            secondaryModel: this.elements.secondaryModelSelect?.value || '',
            visionProvider: this.elements.visionProviderSelect?.value || '',
            visionModel: this.elements.visionModelSelect?.value || '',
            visionSecondaryProvider: this.elements.visionSecondaryProviderSelect?.value || '',
            visionSecondaryModel: this.elements.visionSecondaryModelSelect?.value || '',
            enableReasoning: this.elements.enableReasoningToggle ? this.elements.enableReasoningToggle.checked : true,
            reasoningEffort: this.elements.reasoningEffortSelect?.value || 'medium',
            enableWebSearch: this.elements.enableWebSearchToggle ? this.elements.enableWebSearchToggle.checked : false,
            languages: languageCheckboxes,
            preferredMic: this.elements.micSelect?.value || ''
        };
    }

    /**
     * Loads saved profile from localStorage and /api/profile.
     * Populates form fields immediately.
     */
    async loadProfile() {
        let profile = {};

        // 1. Fast synchronous recovery from localStorage
        try {
            const rawLocal = localStorage.getItem(this.storageKey);
            if (rawLocal) {
                profile = JSON.parse(rawLocal) || {};
                devLog("Loaded profile from localStorage:", profile);
            }
        } catch (e) {
            devLog("Could not read profile from localStorage:", e);
        }

        // 2. Fetch authoritative profile from backend disk
        try {
            const resp = await fetch('/api/profile');
            if (resp.ok) {
                const diskProfile = await resp.json();
                if (diskProfile && Object.keys(diskProfile).length > 0) {
                    profile = { ...profile, ...diskProfile };
                    devLog("Loaded profile from /api/profile:", diskProfile);
                }
            }
        } catch (err) {
            devLog("Could not fetch /api/profile:", err);
        }

        this.savedProfile = profile;
        this.populateBasicFields(profile);
        return profile;
    }

    /**
     * Populates text fields, textareas, and checkboxes from the loaded profile.
     */
    populateBasicFields(profile) {
        if (!profile) return;

        if (profile.name && this.elements.name) this.elements.name.value = profile.name;
        if (profile.company && this.elements.company) this.elements.company.value = profile.company;
        if (profile.role && this.elements.role) this.elements.role.value = profile.role;
        if (profile.resume && this.elements.resume) this.elements.resume.value = profile.resume;
        if (profile.objectives && this.elements.objectives) this.elements.objectives.value = profile.objectives;
        if ((profile.customInstructions || profile.instructions) && this.elements.instructions) {
            this.elements.instructions.value = profile.customInstructions || profile.instructions || '';
        }

        // Populate focus checkboxes
        if (Array.isArray(profile.focus) && profile.focus.length > 0) {
            const focusCbs = document.querySelectorAll('input[name="focus"]');
            focusCbs.forEach(cb => {
                cb.checked = profile.focus.includes(cb.value);
            });
        }

        // Populate preferred languages checkboxes
        if (Array.isArray(profile.languages) && profile.languages.length > 0) {
            const langCbs = document.querySelectorAll('input[name="language"]');
            langCbs.forEach(cb => {
                cb.checked = profile.languages.includes(cb.value);
            });
        }

        // Populate reasoning effort and toggle
        const reasoningEffort = profile.reasoningEffort || 'medium';
        const isReasoningEnabled = profile.enableReasoning !== undefined 
            ? Boolean(profile.enableReasoning) 
            : (reasoningEffort !== 'off');

        if (this.elements.enableReasoningToggle) {
            this.elements.enableReasoningToggle.checked = isReasoningEnabled;
        }

        if (this.elements.reasoningEffortSelect) {
            this.elements.reasoningEffortSelect.value = isReasoningEnabled ? (reasoningEffort === 'off' ? 'medium' : reasoningEffort) : 'off';
        }

        // Populate web search toggle and status badge
        const isWebSearchEnabled = Boolean(profile.enableWebSearch);
        if (this.elements.enableWebSearchToggle) {
            this.elements.enableWebSearchToggle.checked = isWebSearchEnabled;
        }
        this.updateWebSearchBadge(isWebSearchEnabled);

        if (profile.name || profile.resume) {
            this.showSaveStatus('💾 Loaded saved profile', 'success');
        }
    }

    /**
     * Updates the status text and visual indicator for Web Search Grounding.
     */
    updateWebSearchBadge(enabled) {
        if (!this.elements.webSearchBadge) return;
        if (enabled) {
            this.elements.webSearchBadge.textContent = 'ON (Google Real-Time Search Grounding 🌐)';
            this.elements.webSearchBadge.className = 'search-badge-on';
        } else {
            this.elements.webSearchBadge.textContent = 'Off (Internal Knowledge Only)';
            this.elements.webSearchBadge.className = 'search-badge-off';
        }
    }

    /**
     * Applies saved AI provider and model selections to dropdowns once providers are loaded.
     */
    applySavedAiProviders() {
        if (!this.providerManager || !this.providerManager.aiProviders) return;

        const profile = this.savedProfile || {};
        const providers = this.providerManager.aiProviders;
        if (!providers || providers.length === 0) return;

        // --- 1. Primary AI Provider & Model ---
        const savedPrimaryName = profile.primaryProvider;
        let matchingPrimary = providers.find(p => p.name === savedPrimaryName);
        
        // If saved primary has no key, switch to the first provider that HAS a key
        if (!matchingPrimary || !matchingPrimary.hasKey) {
            const keyed = providers.find(p => p.hasKey);
            if (keyed) {
                matchingPrimary = keyed;
            }
        }

        if (matchingPrimary && this.elements.providerSelect) {
            this.elements.providerSelect.value = matchingPrimary.name;
            this.providerManager.updateModelDropdown();

            const targetModel = profile.primaryModel || matchingPrimary.defaultModel || matchingPrimary.models[0];
            const modelName = this.providerManager._getModelName(targetModel);
            if (modelName && this.elements.modelSelect) {
                const hasModel = Array.from(this.elements.modelSelect.options).some(o => o.value === modelName);
                if (hasModel) {
                    this.elements.modelSelect.value = modelName;
                }
            }
        } else {
            // Fall back to defaultPrimary from ai_providers.json
            const defPrimary = providers.find(p => p.defaultPrimary);
            if (defPrimary && this.elements.providerSelect) {
                this.elements.providerSelect.value = defPrimary.name;
                this.providerManager.updateModelDropdown();
                const defModel = this.providerManager._getModelName(defPrimary.defaultModel || defPrimary.models[0]);
                if (defModel && this.elements.modelSelect) {
                    this.elements.modelSelect.value = defModel;
                }
            }
        }

        // --- 2. Secondary AI Provider & Model ---
        // ONLY select secondary if it has a valid key and is different from primary
        const savedSecondaryName = profile.secondaryProvider;
        const matchingSecondary = providers.find(p => p.name === savedSecondaryName && p.hasKey && p.name !== matchingPrimary?.name);

        if (matchingSecondary && this.elements.secondaryProviderSelect) {
            this.elements.secondaryProviderSelect.value = matchingSecondary.name;
            this.providerManager.updateSecondaryModelDropdown();

            if (profile.secondaryModel && this.elements.secondaryModelSelect) {
                const hasModel = Array.from(this.elements.secondaryModelSelect.options).some(o => o.value === profile.secondaryModel);
                if (hasModel) {
                    this.elements.secondaryModelSelect.value = profile.secondaryModel;
                }
            }
        } else {
            // Clear secondary provider if it doesn't have a valid key
            if (this.elements.secondaryProviderSelect) {
                this.elements.secondaryProviderSelect.value = '';
                this.providerManager.updateSecondaryModelDropdown();
            }
        }

        // --- 3. Vision AI Provider & Model ---
        const savedVisionName = profile.visionProvider;
        let matchingVision = providers.find(p => p.name === savedVisionName && p.supportsVision);

        // If saved vision has no key, switch to the first vision provider with a key
        if (!matchingVision || !matchingVision.hasKey) {
            const keyedVision = providers.find(p => p.hasKey && p.supportsVision);
            if (keyedVision) {
                matchingVision = keyedVision;
            }
        }

        if (matchingVision && this.elements.visionProviderSelect) {
            this.elements.visionProviderSelect.value = matchingVision.name;
            this.providerManager.updateVisionModelDropdown();

            const targetVisionModel = profile.visionModel || matchingVision.defaultVisionModel || matchingVision.visionModels[0];
            const visionModelName = this.providerManager._getModelName(targetVisionModel);
            if (visionModelName && this.elements.visionModelSelect) {
                const hasModel = Array.from(this.elements.visionModelSelect.options).some(o => o.value === visionModelName);
                if (hasModel) {
                    this.elements.visionModelSelect.value = visionModelName;
                }
            }
        } else {
            const defVision = providers.find(p => p.defaultVisionPrimary);
            if (defVision && this.elements.visionProviderSelect) {
                this.elements.visionProviderSelect.value = defVision.name;
                this.providerManager.updateVisionModelDropdown();
                const defModel = this.providerManager._getModelName(defVision.defaultVisionModel || defVision.visionModels[0]);
                if (defModel && this.elements.visionModelSelect) {
                    this.elements.visionModelSelect.value = defModel;
                }
            }
        }

        // --- 4. Secondary Vision AI Provider & Model ---
        // ONLY select secondary vision if it has a valid key and is different from primary vision
        const savedSecVisionName = profile.visionSecondaryProvider;
        const matchingSecVision = providers.find(p => p.name === savedSecVisionName && p.supportsVision && p.hasKey && p.name !== matchingVision?.name);

        if (matchingSecVision && this.elements.visionSecondaryProviderSelect) {
            this.elements.visionSecondaryProviderSelect.value = matchingSecVision.name;
            this.providerManager.updateSecondaryVisionModelDropdown();

            if (profile.visionSecondaryModel && this.elements.visionSecondaryModelSelect) {
                const hasModel = Array.from(this.elements.visionSecondaryModelSelect.options).some(o => o.value === profile.visionSecondaryModel);
                if (hasModel) {
                    this.elements.visionSecondaryModelSelect.value = profile.visionSecondaryModel;
                }
            }
        } else {
            // Clear secondary vision provider if no key
            if (this.elements.visionSecondaryProviderSelect) {
                this.elements.visionSecondaryProviderSelect.value = '';
                this.providerManager.updateSecondaryVisionModelDropdown();
            }
        }

        // --- 5. Reasoning Effort ---
        if (profile.reasoningEffort && this.elements.reasoningEffortSelect) {
            this.elements.reasoningEffortSelect.value = profile.reasoningEffort;
        }

        devLog("AI Provider dropdowns restored from saved profile");
    }

    /**
     * Persists profile data to both localStorage and /api/profile.
     */
    async saveProfile(partialData = null, showFeedback = true) {
        const fullData = this.getProfileData();
        const dataToSave = partialData ? { ...fullData, ...partialData } : fullData;
        this.savedProfile = { ...this.savedProfile, ...dataToSave };

        // 1. Save to localStorage
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.savedProfile));
        } catch (e) {
            devLog("LocalStorage write warning:", e);
        }

        // 2. Save to backend /api/profile (disk)
        try {
            const resp = await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.savedProfile)
            });

            if (resp.ok && showFeedback) {
                this.showSaveStatus('💾 All changes saved', 'success');
            }
        } catch (err) {
            devError("Failed to save profile to disk:", err);
            if (showFeedback) {
                this.showSaveStatus('💾 Saved locally', 'warning');
            }
        }
    }

    /**
     * Triggers a debounced auto-save (e.g. while typing).
     */
    triggerDebouncedSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.showSaveStatus('⏳ Saving...', 'saving');

        this.saveTimeout = setTimeout(() => {
            this.saveProfile(null, true);
        }, 400);
    }

    /**
     * Displays a save status badge in the UI.
     */
    showSaveStatus(text, statusType = 'success') {
        const badge = this.elements.statusBadge || document.getElementById('auto-save-status');
        if (!badge) return;

        badge.textContent = text;
        badge.className = `auto-save-status ${statusType}`;
        badge.style.opacity = '1';

        if (statusType === 'success') {
            setTimeout(() => {
                if (badge.textContent === text) {
                    badge.style.opacity = '0.6';
                }
            }, 3000);
        }
    }

    /**
     * Hooks change and input event listeners on all form fields for automatic persistence.
     */
    setupAutoSave() {
        // Text inputs & textareas (auto-save with debounce)
        const textInputs = [
            this.elements.name,
            this.elements.company,
            this.elements.role,
            this.elements.resume,
            this.elements.objectives,
            this.elements.instructions
        ];

        textInputs.forEach(el => {
            if (!el) return;
            el.addEventListener('input', () => this.triggerDebouncedSave());
            el.addEventListener('change', () => this.saveProfile(null, true));
        });

        // Thinking / Extended Reasoning switch listener
        if (this.elements.enableReasoningToggle) {
            this.elements.enableReasoningToggle.addEventListener('change', (e) => {
                const isEnabled = e.target.checked;
                if (!isEnabled) {
                    if (this.elements.reasoningEffortSelect) {
                        this.elements.reasoningEffortSelect.value = 'off';
                    }
                } else {
                    if (this.elements.reasoningEffortSelect && this.elements.reasoningEffortSelect.value === 'off') {
                        this.elements.reasoningEffortSelect.value = 'medium';
                    }
                }
                this.saveProfile(null, true);
            });
        }

        // Web Search Grounding switch listener
        if (this.elements.enableWebSearchToggle) {
            this.elements.enableWebSearchToggle.addEventListener('change', (e) => {
                const isEnabled = e.target.checked;
                this.updateWebSearchBadge(isEnabled);
                this.saveProfile(null, true);
            });
        }

        // Checkboxes (focus and language)
        document.querySelectorAll('input[name="focus"], input[name="language"]').forEach(cb => {
            cb.addEventListener('change', () => this.saveProfile(null, true));
        });

        // Dropdowns in AI Setup
        const selects = [
            this.elements.providerSelect,
            this.elements.modelSelect,
            this.elements.secondaryProviderSelect,
            this.elements.secondaryModelSelect,
            this.elements.visionProviderSelect,
            this.elements.visionModelSelect,
            this.elements.visionSecondaryProviderSelect,
            this.elements.visionSecondaryModelSelect,
            this.elements.reasoningEffortSelect
        ];

        selects.forEach(select => {
            if (!select) return;
            select.addEventListener('change', () => {
                if (select === this.elements.reasoningEffortSelect) {
                    const isOff = select.value === 'off';
                    if (this.elements.enableReasoningToggle) {
                        this.elements.enableReasoningToggle.checked = !isOff;
                    }
                }
                // Short delay so child model dropdowns update first if provider changed
                setTimeout(() => {
                    this.saveProfile(null, true);
                }, 100);
            });
        });

        // Microphone dropdown (Pre-flight)
        if (this.elements.micSelect) {
            this.elements.micSelect.addEventListener('change', (e) => {
                this.saveProfile({ preferredMic: e.target.value }, false);
            });
        }

        devLog("✅ ProfileManager auto-save listeners attached");
    }
}

