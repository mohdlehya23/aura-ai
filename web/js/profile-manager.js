import { devLog, devError } from './config.js';

/**
 * Built-in default profile templates for quick switching.
 */
export const DEFAULT_PROFILES = {
    "medicine": {
        id: "medicine",
        title: "Clinical Medicine & Public Health (Open Doors)",
        name: "Mohammed",
        company: "opendoors",
        role: "Bachelor's Candidate in Clinical Medicine and Public Health (Open Doors Russian Scholarship)",
        resume: `Prospective Bachelor's / Specialist Student in Clinical Medicine & Public Health
High School Graduate (Scientific Track: Advanced Biology & Chemistry Honors)

Academic Strengths & Foundational Knowledge:
- Biology & Physiology: Cell biology, genetics & heredity, human anatomy and major organ systems (circulatory, respiratory, nervous, digestive, endocrine), homeostasis, and basic immunology.
- Chemistry & Biochemistry: General and organic chemistry, acid-base balance and blood pH buffers, biomolecules (proteins, enzymes, carbohydrates, lipids, nucleic acids), and cellular respiration.
- Public Health & Preventative Medicine: Disease prevention, hygiene and sanitation, infectious vs. chronic diseases, epidemiology basics (disease transmission, herd immunity, vaccines), and healthcare ethics.
- Core Skills: Scientific reasoning, ethical decision-making, biological problem-solving, and clear oral communication.`,
        focus: ["behavioral", "cultural-fit", "hr"],
        objectives: `Context: Stage 2 Academic Exam & Oral-Response Preparation for the Open Doors Russian Scholarship (Undergraduate Bachelor's Track in Clinical Medicine and Public Health).

Exam Format & Evaluation Criteria:
- The candidate is a prospective undergraduate student (high school graduate entering medical university), NOT a licensed physician or medical resident.
- Answers should demonstrate strong conceptual understanding of biology, human physiology, basic biochemistry, and public health awareness.
- The candidate must deliver structured, clear 1.5 to 2-minute spoken explanations of medical, biological, or public health topics.

Core Syllabus Topics (Undergraduate Entry Level):
1. Human Anatomy & Physiology: Major systems (heart & circulation, respiratory gas exchange, nervous transmission, endocrine regulation, kidney filtration, immune response).
2. Cell Biology & Genetics: Cell structure, DNA replication, protein synthesis, Mendelian genetics, mutations, mitosis/meiosis.
3. Biochemistry & Chemistry Basics: Enzymes and catalysis, cellular respiration, blood pH regulation, structure of macro-molecules.
4. Public Health & Global Medicine: Infectious disease prevention, epidemiology basics, vaccines and herd immunity, non-communicable diseases (diabetes, cardiovascular disease), and medical ethics.`,
        customInstructions: `Speak directly as an ambitious, knowledgeable undergraduate candidate applying for a Bachelor's in Clinical Medicine and Public Health (NOT a senior doctor or researcher). Keep answers scientifically accurate, highly structured, and calibrated for a 1.5 to 2-minute spoken response.

Structure each scientific answer logically:
1. Direct Definition & Core Answer: Start immediately with the main concept.
2. Biological & Physiological Mechanism: Explain how it functions in the human body/cells simply and clearly.
3. Clinical & Public Health Relevance: Connect it to disease prevention, clinical diagnosis, or human health impact.

Tone: Empathetic, scientifically rigorous, and ethically grounded. Answer in the same language as the interviewer (Arabic or English).`
    },
    "cs": {
        id: "cs",
        title: "Computer Science & Technology (Open Doors)",
        name: "Mohammed",
        company: "opendoors",
        role: "Bachelor's Candidate in Computer Science and Technology (Open Doors Russian Scholarship)",
        resume: `Prospective Bachelor's Student in Computer Science and Technology
High School Graduate (Scientific / Mathematics Track)

Academic Strengths & Foundational Skills:
- Mathematics & Logic: Algebra, Functions, Discrete Mathematics basics, Boolean Logic, Sets, Combinatorics, and Probability.
- Programming Fundamentals: Python and C++ basics, variables, control flow (loops and conditionals), functions, recursion, arrays, and strings.
- Introductory Data Structures & Algorithms: Linear and binary search, basic sorting algorithms (Bubble, Selection, Insertion Sort), stacks, queues, and basic time complexity intuition.
- Computer Science & IT Basics: Number systems (Binary, Decimal, Hexadecimal), basic computer architecture (CPU, RAM, Storage), operating systems fundamentals, and internet/networking basics.`,
        focus: ["system-design", "dsa", "coding"],
        objectives: `Context: Stage 2 Academic Exam & Oral-Response Preparation for the Open Doors Russian Scholarship (Bachelor's Track in Computer Science and Technology).

Exam Format & Evaluation Criteria:
- The candidate is a high school graduate applying for an undergraduate (Bachelor's) degree, NOT a senior engineer or Master's student.
- The candidate must explain 1 foundational computer science, programming, or logic concept in a clear 2-minute spoken response, supported by a simple, concrete example.

Core Syllabus Topics (Undergraduate Entry Level):
1. Programming Fundamentals: Variables, data types, loops, conditionals, functions, recursion, arrays, strings, and tracing simple code logic.
2. Foundational Algorithms & Data Structures: Linear search vs. binary search, basic sorting methods, stacks, queues, and basic efficiency comparison.
3. Computer Science Basics & Discrete Logic: Binary and hexadecimal conversions, boolean logic gates (AND, OR, NOT, XOR), basic sets/combinatorics, and how hardware, OS, and networks interact.`,
        customInstructions: `Explain concepts from first principles with clear, simple analogies and concrete code examples in Python/C++. Keep answers concise, highly structured, and speak directly as an undergraduate candidate (NOT a senior architect or researcher). Answer in the same language as the interviewer (Arabic or English).`
    }
};

/**
 * ProfileManager
 * Handles bidirectional persistence of user onboarding profile and AI configuration.
 * Supports multiple candidate profiles with instant switching, creation, duplication, and deletion.
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

        // Multi-profile state
        this.profiles = { ...DEFAULT_PROFILES };
        this.activeProfileId = 'medicine';

        this.initElements();
    }

    initElements() {
        this.elements = {
            profileSelect: document.getElementById('profile-select'),
            btnNewProfile: document.getElementById('btn-new-profile'),
            btnDuplicateProfile: document.getElementById('btn-duplicate-profile'),
            btnRenameProfile: document.getElementById('btn-rename-profile'),
            btnDeleteProfile: document.getElementById('btn-delete-profile'),
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
     * Renders all saved profiles into the dropdown selector.
     */
    renderProfileDropdown() {
        if (!this.elements.profileSelect) return;
        this.elements.profileSelect.innerHTML = '';

        const ids = Object.keys(this.profiles);
        ids.forEach(id => {
            const p = this.profiles[id];
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = p.title || p.role || id;
            if (id === this.activeProfileId) {
                opt.selected = true;
            }
            this.elements.profileSelect.appendChild(opt);
        });

        this.elements.profileSelect.value = this.activeProfileId;
    }

    /**
     * Synchronizes current form field values into memory for the active profile.
     */
    syncCurrentFieldsToActiveProfile() {
        if (!this.activeProfileId || !this.profiles[this.activeProfileId]) return;

        const focusCheckboxes = Array.from(document.querySelectorAll('input[name="focus"]:checked')).map(cb => cb.value);
        const active = this.profiles[this.activeProfileId];

        active.name = this.elements.name?.value?.trim() || '';
        active.company = this.elements.company?.value?.trim() || '';
        active.role = this.elements.role?.value?.trim() || '';
        active.resume = this.elements.resume?.value || '';
        active.focus = focusCheckboxes;
        active.objectives = this.elements.objectives?.value || '';
        active.customInstructions = this.elements.instructions?.value || '';
    }

    /**
     * Switches to a different saved profile, updating all UI inputs and saving state.
     */
    switchProfile(targetId) {
        if (!targetId || !this.profiles[targetId]) return;

        // 1. Sync any unsaved field changes into currently active profile
        this.syncCurrentFieldsToActiveProfile();

        // 2. Set new active profile
        this.activeProfileId = targetId;
        const target = this.profiles[targetId];

        // 3. Populate form fields
        this.populateBasicFields(target);

        // 4. Update dropdown selection
        if (this.elements.profileSelect) {
            this.elements.profileSelect.value = targetId;
        }

        // 5. Persist immediately
        this.saveProfile(null, true);
        this.showSaveStatus(`📁 Switched: ${target.title || target.role}`, 'success');
        devLog(`Switched active profile to [${targetId}]:`, target.title);
    }

    /**
     * Creates a new blank profile and activates it.
     */
    createNewProfile() {
        const title = prompt("Enter a title for the new profile (مثال: Software Engineering, Data Science, Medical Exam):");
        if (!title || !title.trim()) return;

        this.syncCurrentFieldsToActiveProfile();

        const newId = 'profile_' + Date.now();
        const newProfile = {
            id: newId,
            title: title.trim(),
            name: this.elements.name?.value?.trim() || 'Mohammed',
            company: '',
            role: title.trim(),
            resume: '',
            focus: ['behavioral'],
            objectives: '',
            customInstructions: ''
        };

        this.profiles[newId] = newProfile;
        this.activeProfileId = newId;

        this.renderProfileDropdown();
        this.populateBasicFields(newProfile);
        this.saveProfile(null, true);
        this.showSaveStatus(`✨ Created profile: ${title.trim()}`, 'success');

        if (this.elements.role) this.elements.role.focus();
    }

    /**
     * Duplicates the current active profile.
     */
    duplicateCurrentProfile() {
        this.syncCurrentFieldsToActiveProfile();
        const current = this.profiles[this.activeProfileId];
        if (!current) return;

        const baseTitle = current.title || current.role || 'Profile';
        const newTitle = `${baseTitle} (Copy)`;
        const newId = 'profile_' + Date.now();

        const cloned = {
            ...JSON.parse(JSON.stringify(current)),
            id: newId,
            title: newTitle
        };

        this.profiles[newId] = cloned;
        this.activeProfileId = newId;

        this.renderProfileDropdown();
        this.populateBasicFields(cloned);
        this.saveProfile(null, true);
        this.showSaveStatus(`📋 Duplicated: ${newTitle}`, 'success');
    }

    /**
     * Renames the current active profile.
     */
    renameCurrentProfile() {
        const current = this.profiles[this.activeProfileId];
        if (!current) return;

        const currentTitle = current.title || current.role || '';
        const newTitle = prompt("Enter new title for this profile:", currentTitle);
        if (!newTitle || !newTitle.trim()) return;

        current.title = newTitle.trim();
        this.renderProfileDropdown();
        this.saveProfile(null, true);
        this.showSaveStatus(`✏️ Renamed to: ${newTitle.trim()}`, 'success');
    }

    /**
     * Deletes the current active profile after user confirmation.
     */
    deleteCurrentProfile() {
        const keys = Object.keys(this.profiles);
        if (keys.length <= 1) {
            alert("You must keep at least one profile.");
            return;
        }

        const current = this.profiles[this.activeProfileId];
        const title = current?.title || current?.role || this.activeProfileId;
        const confirmed = confirm(`Are you sure you want to delete profile "${title}"?`);
        if (!confirmed) return;

        delete this.profiles[this.activeProfileId];
        const remainingKeys = Object.keys(this.profiles);
        this.activeProfileId = remainingKeys[0];

        this.renderProfileDropdown();
        this.populateBasicFields(this.profiles[this.activeProfileId]);
        this.saveProfile(null, true);
        this.showSaveStatus(`🗑️ Deleted profile`, 'warning');
    }

    /**
     * Gathers all current values from form elements into a clean profile object.
     * Keeps top-level keys synchronized with the active profile for 100% backend compatibility.
     */
    getProfileData() {
        this.syncCurrentFieldsToActiveProfile();

        const focusCheckboxes = Array.from(document.querySelectorAll('input[name="focus"]:checked')).map(cb => cb.value);
        const languageCheckboxes = Array.from(document.querySelectorAll('input[name="language"]:checked')).map(cb => cb.value);

        return {
            activeProfileId: this.activeProfileId,
            profiles: this.profiles,
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

        // 3. Resolve multi-profiles structure
        if (profile.profiles && typeof profile.profiles === 'object' && Object.keys(profile.profiles).length > 0) {
            this.profiles = { ...DEFAULT_PROFILES, ...profile.profiles };
        } else {
            this.profiles = { ...DEFAULT_PROFILES };
            // If single legacy profile exists, incorporate it
            if (profile.role && !profile.profiles) {
                const legacyId = profile.role.toLowerCase().includes('computer') ? 'cs' : 'custom_saved';
                const legacyTitle = profile.role.toLowerCase().includes('computer') 
                    ? 'Computer Science & Technology (Open Doors)' 
                    : (profile.role.slice(0, 45) || 'Saved Profile');
                this.profiles[legacyId] = {
                    id: legacyId,
                    title: legacyTitle,
                    name: profile.name || 'Mohammed',
                    company: profile.company || 'opendoors',
                    role: profile.role,
                    resume: profile.resume || '',
                    focus: profile.focus || ['system-design', 'dsa', 'coding'],
                    objectives: profile.objectives || '',
                    customInstructions: profile.customInstructions || profile.instructions || ''
                };
            }
        }

        // Determine active profile ID
        if (profile.activeProfileId && this.profiles[profile.activeProfileId]) {
            this.activeProfileId = profile.activeProfileId;
        } else if (this.profiles['medicine']) {
            this.activeProfileId = 'medicine';
        } else {
            this.activeProfileId = Object.keys(this.profiles)[0];
        }

        this.savedProfile = profile;
        this.renderProfileDropdown();

        // Populate fields from the active profile merged with global settings
        const activeProfileData = this.profiles[this.activeProfileId] || {};
        this.populateBasicFields({ ...profile, ...activeProfileData });
        return profile;
    }

    /**
     * Populates text fields, textareas, and checkboxes from the loaded profile.
     */
    populateBasicFields(profile) {
        if (!profile) return;

        if (this.elements.name) this.elements.name.value = profile.name || '';
        if (this.elements.company) this.elements.company.value = profile.company || '';
        if (this.elements.role) this.elements.role.value = profile.role || '';
        if (this.elements.resume) this.elements.resume.value = profile.resume || '';
        if (this.elements.objectives) this.elements.objectives.value = profile.objectives || '';
        if (this.elements.instructions) {
            this.elements.instructions.value = profile.customInstructions || profile.instructions || '';
        }

        // Populate focus checkboxes
        const focusList = Array.isArray(profile.focus) ? profile.focus : [];
        const focusCbs = document.querySelectorAll('input[name="focus"]');
        focusCbs.forEach(cb => {
            cb.checked = focusList.includes(cb.value);
        });

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

        if (profile.name || profile.resume || profile.title) {
            this.showSaveStatus(`💾 Loaded profile: ${profile.title || profile.role || ''}`, 'success');
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
            if (this.elements.secondaryProviderSelect) {
                this.elements.secondaryProviderSelect.value = '';
                this.providerManager.updateSecondaryModelDropdown();
            }
        }

        // --- 3. Vision AI Provider & Model ---
        const savedVisionName = profile.visionProvider;
        let matchingVision = providers.find(p => p.name === savedVisionName && p.supportsVision);

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
        // Multi-Profile toolbar actions
        if (this.elements.profileSelect) {
            this.elements.profileSelect.addEventListener('change', (e) => {
                this.switchProfile(e.target.value);
            });
        }

        if (this.elements.btnNewProfile) {
            this.elements.btnNewProfile.addEventListener('click', () => {
                this.createNewProfile();
            });
        }

        if (this.elements.btnDuplicateProfile) {
            this.elements.btnDuplicateProfile.addEventListener('click', () => {
                this.duplicateCurrentProfile();
            });
        }

        if (this.elements.btnRenameProfile) {
            this.elements.btnRenameProfile.addEventListener('click', () => {
                this.renameCurrentProfile();
            });
        }

        if (this.elements.btnDeleteProfile) {
            this.elements.btnDeleteProfile.addEventListener('click', () => {
                this.deleteCurrentProfile();
            });
        }

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

        devLog("✅ ProfileManager auto-save listeners attached (Multi-Profile enabled)");
    }
}
