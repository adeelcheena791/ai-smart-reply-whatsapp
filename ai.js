const API_KEY = "AIzaSyA5IKRw4W1yAV4BLEXb_bazV0auAkPfpcU";

// GLOBAL FUNCTION
async function generateAIReply(userText, tone) {

    if (!userText) return "No input provided";

    let toneInstruction = "";

    if (tone === "friendly") {
        toneInstruction = "Reply in a friendly casual tone.";
    } 
    else if (tone === "professional") {
        toneInstruction = "Reply in a professional business tone.";
    } 
    else {
        toneInstruction = "Reply in a neutral tone.";
    }

    const prompt = `
${toneInstruction}

User message:
${userText}

Give a short helpful reply.
`;

    try {

   const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [{ text: prompt }]
                }
            ]
        })
    }
);

// 👇 THIS IS WHERE YOU ADD YOUR DEBUG LINE
console.log("STATUS CODE:", response.status);

// 👇 THIS IS YOUR RAW RESPONSE DEBUG (IMPORTANT)
console.log("RAW RESPONSE:", await response.clone().text());

const data = await response.json();

console.log("PARSED DATA:", data);

        const data = await response.json();

        console.log("FULL GEMINI RESPONSE:", data); // 🔥 IMPORTANT DEBUG

        // ❗ CHECK ERROR FIRST
        if (data.error) {
            return "API Error: " + data.error.message;
        }

        // ❗ SAFE EXTRACTION
        let reply = "";

        if (
            data.candidates &&
            data.candidates.length > 0 &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts.length > 0
        ) {
            reply = data.candidates[0].content.parts[0].text;
        }

        if (!reply) {
            return "No response from AI (check API key or quota)";
        }

        return reply;

    } catch (error) {
        console.error("Fetch Error:", error);
        return "Network error or API failed";
    }
}