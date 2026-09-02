"use strict";

/*
=========================================================
AI MARKET ANALYZER
Frontend Configuration
=========================================================

IMPORTANT:
Never put OpenAI, Gemini or Grok API keys here.

API keys stay on the Railway backend.
=========================================================
*/

const CONFIG = {

    APP_NAME: "AI Market Analyzer",

    VERSION: "2.0.0",

    analysis: {

        maxAnalysisTime: 30000,

        autoStartAfterUpload: true,

        supportedImageTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/jpg"
        ],

        maxImageSizeMB: 10
    },

    api: {

        enabled: true,

        /*
        Same-origin API.
        This works when the complete project is deployed
        together on Railway.
        */

        endpoint: "/api/analyze",

        timeout: 60000
    },

    ai: {

        providers: [
            "OpenAI",
            "Gemini",
            "Grok"
        ],

        minimumAgreement: 2,

        /*
        If fewer than 2 AI models agree,
        final result becomes NO TRADE.
        */

        minimumConfidence: 60,

        maximumDisplayedConfidence: 95
    },

    futureSignals: {

        count: 10,

        markets: [
            "EUR/USD",
            "GBP/USD",
            "USD/JPY",
            "USD/CHF",
            "AUD/USD",
            "USD/CAD",
            "NZD/USD",
            "EUR/GBP",
            "EUR/JPY",
            "GBP/JPY",
            "AUD/JPY",
            "EUR/AUD",
            "EUR/CAD",
            "GBP/CAD",
            "AUD/CAD",
            "USD/SGD",
            "USD/HKD",
            "USD/TRY",
            "USD/MXN",
            "USD/ZAR"
        ]
    },

    ui: {

        toastDuration: 3500,

        pageAnimation: true,

        signalAnimation: true,

        loadingAnimation: true
    }
};

Object.freeze(CONFIG);

window.MARKET_ANALYZER_CONFIG = CONFIG;

console.log(
    `[${CONFIG.APP_NAME}] v${CONFIG.VERSION} loaded`
);

console.log(
    `[AI] Backend API: ${CONFIG.api.enabled ? "ENABLED" : "DISABLED"}`
);
