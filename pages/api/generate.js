import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { query, apiKey, model, baseUrl } = req.body;

  if (!apiKey || !model || !baseUrl) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  const apiClient = axios.create({
    baseURL: baseUrl,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
      'Content-Type': 'application/json'
    },
    timeout: 50000 // 50 seconds timeout
  });

  try {
    const steps = [];
    let totalTime = 0;
    let messages = [
      { role: "system", content: `You are an expert AI assistant that explains your reasoning step by step. For each step:
1. Provide a title that describes what you're doing in that step.
2. Explain your reasoning or analysis for this step.
3. Decide if you need another step or if you're ready to give the final answer.
4. Format your response as a JSON object with "title", "content", and "next_action" keys. The "next_action" should be either "continue" or "final_answer".

USE AT LEAST 3 STEPS before reaching a final answer. Be aware of your limitations as an AI and what you can and cannot do. In your reasoning, include exploration of alternative answers. Consider that you may be wrong, and if so, where your reasoning might be flawed. Fully test all other possibilities. When you say you are re-examining, actually re-examine using a different approach. Use best practices in your analysis.

Example of a valid JSON response:
{
  "title": "Initial Analysis of the Query",
  "content": "To begin solving this problem, we need to carefully examine the given information and identify the crucial elements that will guide our solution process. [Your detailed analysis here]",
  "next_action": "continue"
}` },
      { role: "user", content: query },
    ];

    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      const completion = await apiClient.post('/v1/chat/completions', {
        model: model,
        messages: messages
      });
      const endTime = Date.now();

      let stepData;
      try {
        const responseContent = completion.data.choices[0].message.content;
        stepData = JSON.parse(responseContent);
      } catch (error) {
        console.error('Failed to parse JSON:', completion.data.choices[0].message.content);
        stepData = {
          title: `Step ${i + 1}`,
          content: completion.data.choices[0].message.content,
          next_action: 'continue'
        };
      }

      totalTime += (endTime - startTime) / 1000;

      steps.push({
        title: stepData.title,
        content: stepData.content,
      });

      messages.push({ role: "assistant", content: JSON.stringify(stepData) });

      if (stepData.next_action === "final_answer") break;
    }

    res.status(200).json({ steps, totalTime });
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ 
      message: 'Failed to generate response', 
      error: error.response?.data || error.message,
      stack: error.stack
    });
  }
}
