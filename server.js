const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
app.use(cors());

// ── YOUR GEMINI KEY LIVES HERE (set in Railway environment variables) ──
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// ── RATE LIMITING: max 5 plan generations per student per day ──
const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5,
  keyGenerator: (req) => req.body?.studentId || req.ip,
  message: { error: 'You have reached your daily plan limit. Come back tomorrow!' }
});

// ── HEALTH CHECK ──
app.get('/', (req, res) => {
  res.json({ status: 'Vector backend is running ✓' });
});

// ── MAIN AI ENDPOINT ──
app.post('/generate', limiter, async (req, res) => {
  const { prompt, studentId } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);
      return res.status(500).json({ error: 'AI service error. Please try again.' });
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json|```/g, '').trim();

    // Try to parse as JSON (for plan generation)
    try {
      const parsed = JSON.parse(text);
      return res.json(parsed);
    } catch {
      // Return as plain text (for mental health responses)
      return res.json({ text });
    }

  } catch (error) {
    console.error('Backend error:', error);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vector backend running on port ${PORT}`);
});
