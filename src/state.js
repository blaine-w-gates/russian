// Global application state and utilities to prevent circular dependencies
export const AppState = {
    currentPage: 'dashboard',
    apiKey: localStorage.getItem('gemini_api_key') || '',
    isMobile: window.innerWidth < 768,
    sortSession: {
        active: false,
        wordQueue: [],
        currentIndex: 0,
        currentStage: 0,
        currentWord: null,
        targetNumber: 'singular',
        selectedBubble: false,
        animacyChoice: null,
        genderChoice: null,
        isProcessing: false
    },
    extractedNouns: [],
    isLoading: false,
    settings: {
        showTranslations: localStorage.getItem('show_translations') !== 'false'
    }
};

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return; // fail gracefully in tests
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Validation Loop Helper: Treats ё and е as identical for typing drills
export function normalizeRussianText(text) {
    if (!text) return '';
    return text.toLowerCase().replace(/ё/g, 'е').trim();
}
