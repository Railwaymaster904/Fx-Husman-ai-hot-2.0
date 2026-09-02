"use strict";

import "dotenv/config";

import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

/*
=========================================================
CLIENTS
=========================================================
*/

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    })
    : null;

const gemini = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    })
    : null;

const xai = process.env.XAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: "https://api.x.ai/v1"
    })
    : null;


/*
=========================================================
MIDDLEWARE
=========================================================
*/

app.use(cors());

app.use(express.json({
    limit: "15mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "15mb"
}));

app.use(express.static(__dirname));


/*
=========================================================
AI PROMPT
=========================================================
*/

const ANALYSIS_PROMPT = `
You are an expert technical chart-analysis assistant.

Analyze the provided trading chart image carefully.

IMPORTANT:
- Do NOT claim 100% accuracy.
- Do NOT invent data that cannot be seen.
- Do NOT guarantee profit.
- Base the answer only on visible chart information.
- Identify the likely short-term direction from the chart.
- Use technical-analysis concepts such as trend, support, resistance,
  price action, momentum, candlestick patterns and visible indicators.
- If the chart is unclear, confidence must be lower.

Return ONLY valid JSON.

Required JSON format:

{
  "direction": "UP",
  "confidence": 85,
  "trend": "Bullish",
  "pattern": "Bullish continuation",
  "momentum": "Strong",
  "support": "Visible support level or Unknown",
  "resistance": "Visible resistance level or Unknown",
  "reason": "Short concise explanation"
}

Rules:
- direction must be exactly one of:
  UP
  DOWN
  NO TRADE

- confidence must be an integer from 0 to 100.
- reason must be short.
- Do not include markdown.
- Do not include code fences.
- Return JSON only.
`;


/*
=========================================================
JSON CLEANER
=========================================================
*/

function cleanJSON(text) {

    if (!text) {
        throw new Error("Empty AI response");
    }

    let cleaned = String(text).trim();

    /*
    Remove markdown code fences if model accidentally returns them.
    */

    cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    /*
    Try direct JSON.
    */

    try {
        return JSON.parse(cleaned);
    } catch (_) {
        // Continue below.
    }

    /*
    Extract first JSON object.
    */

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end !== -1 && end > start) {

        const possibleJSON =
            cleaned.substring(start, end + 1);

        try {
            return JSON.parse(possibleJSON);
        } catch (_) {
            // Continue.
        }
    }

    throw new Error("AI returned invalid JSON");
}


/*
=========================================================
NORMALIZE AI RESULT
=========================================================
*/

function normalizeResult(raw) {

    const direction = String(
        raw?.direction || "NO TRADE"
    )
        .trim()
        .toUpperCase();

    const validDirections = [
        "UP",
        "DOWN",
        "NO TRADE"
    ];

    const finalDirection =
        validDirections.includes(direction)
            ? direction
            : "NO TRADE";

    let confidence = Number(
        raw?.confidence
    );

    if (!Number.isFinite(confidence)) {
        confidence = 0;
    }

    confidence = Math.max(
        0,
        Math.min(100, Math.round(confidence))
    );

    return {

        direction: finalDirection,

        confidence,

        trend: String(
            raw?.trend || "Unknown"
        ).slice(0, 120),

        pattern: String(
            raw?.pattern || "Unknown"
        ).slice(0, 120),

        momentum: String(
            raw?.momentum || "Unknown"
        ).slice(0, 120),

        support: String(
            raw?.support || "Unknown"
        ).slice(0, 120),

        resistance: String(
            raw?.resistance || "Unknown"
        ).slice(0, 120),

        reason: String(
            raw?.reason || "No explanation provided."
        ).slice(0, 500)
    };
}


/*
=========================================================
OPENAI
=========================================================
*/

async function analyzeWithOpenAI(imageDataUrl) {

    if (!openai) {
        throw new Error("OpenAI API key is not configured.");
    }

    const response = await openai.responses.create({

        /*
        Change this model if your OpenAI account/project
        uses a different available vision model.
        */

        model: "gpt-5",

        input: [

            {
                role: "user",

                content: [

                    {
                        type: "input_text",
                        text: ANALYSIS_PROMPT
                    },

                    {
                        type: "input_image",
                        image_url: imageDataUrl,
                        detail: "high"
                    }
                ]
            }
        ]
    });

    return normalizeResult(
        cleanJSON(response.output_text)
    );
}


/*
=========================================================
GEMINI
=========================================================
*/

async function analyzeWithGemini(
    base64Image,
    mimeType
) {

    if (!gemini) {
        throw new Error("Gemini API key is not configured.");
    }

    const response =
        await gemini.models.generateContent({

            model: "gemini-3.7-flash",

            contents: [

                {
                    inlineData: {
                        data: base64Image,
                        mimeType
                    }
                },

                {
                    text: ANALYSIS_PROMPT
                }
            ]
        });

    const text =
        response.text ||
        "";

    return normalizeResult(
        cleanJSON(text)
    );
}


/*
=========================================================
GROK
=========================================================
*/

async function analyzeWithGrok(imageDataUrl) {

    if (!xai) {
        throw new Error("Grok/xAI API key is not configured.");
    }

    const response =
        await xai.responses.create({

            model: "grok-4.6",

            input: [

                {
                    role: "user",

                    content: [

                        {
                            type: "input_image",

                            image_url: imageDataUrl,

                            detail: "high"
                        },

                        {
                            type: "input_text",

                            text: ANALYSIS_PROMPT
                        }
                    ]
                }
            ]
        });

    return normalizeResult(
        cleanJSON(response.output_text)
    );
}


/*
=========================================================
CONSENSUS ENGINE
=========================================================
*/

function calculateConsensus(results) {

    const validResults =
        results.filter(
            item =>
                item &&
                item.success &&
                item.result &&
                (
                    item.result.direction === "UP" ||
                    item.result.direction === "DOWN"
                )
        );

    /*
    No usable result.
    */

    if (validResults.length === 0) {

        return {

            direction: "NO TRADE",

            confidence: 0,

            agreement: "0/0",

            agreementCount: 0,

            totalModels: results.length,

            signalStrength: "NONE",

            risk: "HIGH",

            upVotes: 0,

            downVotes: 0,

            reason:
                "No AI model returned a usable signal."
        };
    }

    let upVotes = 0;
    let downVotes = 0;

    for (const item of validResults) {

        if (item.result.direction === "UP") {
            upVotes++;
        }

        if (item.result.direction === "DOWN") {
            downVotes++;
        }
    }

    let finalDirection = "NO TRADE";
    let majorityCount = 0;

    if (upVotes > downVotes) {

        finalDirection = "UP";
        majorityCount = upVotes;

    } else if (downVotes > upVotes) {

        finalDirection = "DOWN";
        majorityCount = downVotes;
    }

    /*
    No majority.
    */

    if (finalDirection === "NO TRADE") {

        return {

            direction: "NO TRADE",

            confidence: 0,

            agreement:
                `${upVotes}/${validResults.length} UP vs ${downVotes}/${validResults.length} DOWN`,

            agreementCount: 0,

            totalModels: validResults.length,

            signalStrength: "NONE",

            risk: "HIGH",

            upVotes,

            downVotes,

            reason:
                "The AI models do not have a clear majority."
        };
    }

    /*
    Average confidence of majority models only.
    */

    const majorityResults =
        validResults.filter(
            item =>
                item.result.direction === finalDirection
        );

    const averageConfidence =
        majorityResults.reduce(
            (sum, item) =>
                sum + item.result.confidence,
            0
        ) / majorityResults.length;

    /*
    Agreement factor.

    3/3 = 1.00
    2/3 = 0.80
    2/2 = 1.00
    */

    const agreementRatio =
        majorityCount / validResults.length;

    let agreementFactor = 0.80;

    if (agreementRatio >= 1) {
        agreementFactor = 1.00;
    } else if (agreementRatio >= 0.66) {
        agreementFactor = 0.80;
    }

    let confidence =
        Math.round(
            averageConfidence *
            agreementFactor
        );

    /*
    Avoid displaying fake 100%.
    */

    confidence =
        Math.min(
            95,
            Math.max(0, confidence)
        );

    /*
    Signal strength.
    */

    let signalStrength = "WEAK";

    if (
        majorityCount === validResults.length &&
        confidence >= 80
    ) {

        signalStrength = "STRONG";

    } else if (confidence >= 70) {

        signalStrength = "MODERATE";
    }

    /*
    Risk.
    */

    let risk = "HIGH";

    if (
        majorityCount === validResults.length &&
        confidence >= 80
    ) {

        risk = "LOW";

    } else if (confidence >= 70) {

        risk = "MEDIUM";
    }

    return {

        direction: finalDirection,

        confidence,

        agreement:
            `${majorityCount}/${validResults.length}`,

        agreementCount: majorityCount,

        totalModels: validResults.length,

        signalStrength,

        risk,

        upVotes,

        downVotes,

        reason:
            `${majorityCount} of ${validResults.length} AI models agree on ${finalDirection}.`
    };
}


/*
=========================================================
POST /api/analyze
=========================================================
*/

app.post("/api/analyze", async (req, res) => {

    try {

        const {
            image,
            mimeType,
            market,
            mode
        } = req.body || {};

        /*
        Validate image.
        */

        if (!image || typeof image !== "string") {

            return res.status(400).json({

                success: false,

                error: "Chart image is required."
            });
        }

        if (
            !mimeType ||
            ![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/jpg"
            ].includes(mimeType)
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Unsupported image type."
            });
        }

        /*
        Basic size protection.
        */

        const approxBytes =
            Math.ceil(
                image.length * 0.75
            );

        const maxBytes =
            10 * 1024 * 1024;

        if (approxBytes > maxBytes) {

            return res.status(413).json({

                success: false,

                error:
                    "Image is larger than 10MB."
            });
        }

        /*
        Make sure data URL exists.
        */

        let imageDataUrl = image;

        if (!image.startsWith("data:")) {

            imageDataUrl =
                `data:${mimeType};base64,${image}`;
        }

        /*
        Extract pure base64 for Gemini.
        */

        const base64Image =
            imageDataUrl.includes(",")
                ? imageDataUrl.split(",")[1]
                : imageDataUrl;

        /*
        Optional context.
        */

        console.log(
            `[ANALYZE] mode=${mode || "real"} market=${market || "unknown"}`
        );

        /*
        Run all three AI models in parallel.
        */

        const tasks = [

            {
                name: "OpenAI",

                promise:
                    analyzeWithOpenAI(
                        imageDataUrl
                    )
            },

            {
                name: "Gemini",

                promise:
                    analyzeWithGemini(
                        base64Image,
                        mimeType
                    )
            },

            {
                name: "Grok",

                promise:
                    analyzeWithGrok(
                        imageDataUrl
                    )
            }
        ];

        const settled =
            await Promise.allSettled(
                tasks.map(
                    task => task.promise
                )
            );

        /*
        Convert results into clean response.
        */

        const results =
            settled.map(
                (item, index) => {

                    const provider =
                        tasks[index].name;

                    if (
                        item.status ===
                        "fulfilled"
                    ) {

                        return {

                            provider,

                            success: true,

                            result:
                                item.value
                        };
                    }

                    console.error(
                        `[${provider}]`,
                        item.reason
                    );

                    return {

                        provider,

                        success: false,

                        result: null,

                        error:
                            item.reason?.message ||
                            "AI request failed."
                    };
                }
            );

        /*
        Calculate final consensus.
        */

        const final =
            calculateConsensus(
                results
            );

        /*
        Return result.
        */

        return res.json({

            success: true,

            timestamp:
                new Date().toISOString(),

            market:
                market || null,

            mode:
                mode || "real",

            final,

            models: results
        });

    } catch (error) {

        console.error(
            "[SERVER ERROR]",
            error
        );

        return res.status(500).json({

            success: false,

            error:
                error?.message ||
                "Server error while analyzing chart."
        });
    }
});


/*
=========================================================
HEALTH CHECK
=========================================================
*/

app.get("/api/health", (req, res) => {

    res.json({

        success: true,

        service:
            "AI Market Analyzer",

        version:
            "2.0.0",

        providers: {

            openai:
                Boolean(
                    process.env.OPENAI_API_KEY
                ),

            gemini:
                Boolean(
                    process.env.GEMINI_API_KEY
                ),

            grok:
                Boolean(
                    process.env.XAI_API_KEY
                )
        },

        time:
            new Date().toISOString()
    });
});


/*
=========================================================
START SERVER
=========================================================
*/

app.listen(PORT, () => {

    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "   AI MARKET ANALYZER"
    );

    console.log(
        "   Server running"
    );

    console.log(
        `   Port: ${PORT}`
    );

    console.log(
        "========================================"
    );

    console.log(
        `OpenAI: ${
            openai ? "READY" : "MISSING KEY"
        }`
    );

    console.log(
        `Gemini: ${
            gemini ? "READY" : "MISSING KEY"
        }`
    );

    console.log(
        `Grok: ${
            xai ? "READY" : "MISSING KEY"
        }`
    );

    console.log("");
});
