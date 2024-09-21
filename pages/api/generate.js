import axios from 'axios';

const MAX_STEPS = 25; // Maximum number of reasoning steps
const MAX_TOKENS_PER_STEP = 300; // Maximum tokens for each step
const MAX_TOKENS_FINAL_ANSWER = 200; // Maximum tokens for final answer

async function makeApiCall(apiClient, messages, max_tokens, is_final_answer = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await apiClient.post('/v1/chat/completions', {
        model: "gpt-3.5-turbo", // You can change this to the appropriate model
        messages: messages,
        max_tokens: max_tokens,
        temperature: 0.2,
      });
      return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      if (attempt === 2) {
        if (is_final_answer) {
          return { title: "Error", content: `Failed to generate final answer after 3 attempts. Error: ${error.message}` };
        } else {
          return { title: "Error", content: `Failed to generate step after 3 attempts. Error: ${error.message}`, next_action: "final_answer" };
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { query, apiKey, model, baseUrl } = req.body;

  if (!apiKey || !model || !baseUrl) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  // Remove trailing slash from baseUrl if present
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const apiClient = axios.create({
    baseURL: cleanBaseUrl,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 55000 // 55 seconds timeout
  });

  const systemPrompt = `You are an expert AI assistant that explains your reasoning step by step. For each step, provide a title that describes what you're doing in that step, along with the content. Decide if you need another step or if you're ready to give the final answer. Respond in JSON format with 'title', 'content', and 'next_action' (either 'continue' or 'final_answer') keys. USE AS MANY REASONING STEPS AS POSSIBLE. AT LEAST 3. BE AWARE OF YOUR LIMITATIONS AS AN LLM AND WHAT YOU CAN AND CANNOT DO. IN YOUR REASONING, INCLUDE EXPLORATION OF ALTERNATIVE ANSWERS. CONSIDER YOU MAY BE WRONG, AND IF YOU ARE WRONG IN YOUR REASONING, WHERE IT WOULD BE. FULLY TEST ALL OTHER POSSIBILITIES. YOU CAN BE WRONG. WHEN YOU SAY YOU ARE RE-EXAMINING, ACTUALLY RE-EXAMINE, AND USE ANOTHER APPROACH TO DO SO. DO NOT JUST SAY YOU ARE RE-EXAMINING. USE AT LEAST 3 METHODS TO DERIVE THE ANSWER. USE BEST PRACTICES.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
    { role: "assistant", content: "Thank you! I will now think step by step following my instructions, starting at the beginning after decomposing the problem." }
  ];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  let step_count = 1;
  let total_thinking_time = 0;

  try {
    while (step_count <= MAX_STEPS) {
      const start_time = Date.now();
      const step_data = await makeApiCall(apiClient, messages, MAX_TOKENS_PER_STEP);
      const end_time = Date.now();
      const thinking_time = (end_time - start_time) / 1000;
      total_thinking_time += thinking_time;

      messages.push({ role: "assistant", content: JSON.stringify(step_data) });

      res.write(`data: ${JSON.stringify({ ...step_data, step: step_count, thinking_time, total_thinking_time })}\n\n`);

      if (step_data.next_action === "final_answer") {
        break;
      }

      step_count++;
    }

    // Generate final answer
    messages.push({ role: "user", content: "Please provide the final answer based on your reasoning above." });
    
    const start_time = Date.now();
    const final_data = await makeApiCall(apiClient, messages, MAX_TOKENS_FINAL_ANSWER, true);
    const end_time = Date.now();
    const thinking_time = (end_time - start_time) / 1000;
    total_thinking_time += thinking_time;

    res.write(`data: ${JSON.stringify({ ...final_data, step: "Final Answer", thinking_time, total_thinking_time })}\n\n`);

  } catch (error) {
    console.error('Error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to generate response', message: error.message })}\n\n`);
  } finally {
    res.write('event: close\n');
    res.write(`data: ${JSON.stringify({ total_thinking_time })}\n\n`);
    res.end();
  }
}
