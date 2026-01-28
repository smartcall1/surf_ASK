module.exports = {
    // Time Range (KST - UTC+9)
    START_HOUR: 8,
    END_HOUR: 23,

    // Interval settings (in minutes)
    MIN_INTERVAL_MINUTES: 30,
    MAX_INTERVAL_MINUTES: 120,

    // Target URL
    TARGET_URL: 'https://asksurf.ai',

    // Selectors (Configurable if they change)
    // NOTE: These are placeholders. User needs to verify via F12.
    SELECTORS: {
        INPUT_BOX: '#chat-input',
        // Removed '> svg' to click the button element directly
        SEND_BUTTON: '#chat-scroller > div.z-1.relative > form > div.flex.items-center.justify-between > div > button',
        LOGIN_BUTTON: 'text/Log In'
    }
};
