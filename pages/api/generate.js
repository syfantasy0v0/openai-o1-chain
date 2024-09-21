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
    timeout: 55000 // 55 seconds timeout
  });

  try {
    const startTime = Date.now();
    const completion = await apiClient.post('/v1/chat/completions', {
      model: model,
      messages: [
        { role: "system", content: "You are a helpful assistant. Please respond in Chinese." },
        { role: "user", content: query }
      ],
      max_tokens: 1000
    });
    const endTime = Date.now();

    const totalTime = (endTime - startTime) / 1000;
    const responseContent = completion.data.choices[0].message.content;

    // 尝试解析JSON响应
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (error) {
      console.error('Failed to parse JSON response:', responseContent);
      // 如果无法解析JSON，则直接返回原始响应
      parsedResponse = { content: responseContent };
    }

    res.status(200).json({ response: parsedResponse, totalTime });
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ 
      message: 'Failed to generate response', 
      error: error.response?.data || error.message,
      stack: error.stack
    });
  }
}
