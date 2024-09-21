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
    const steps = [];
    let totalTime = 0;
    let messages = [
      { role: "system", content: `你是一个专业的AI助手，需要用中文逐步解释你的推理过程。对于每一步：
1. 提供一个描述你在这一步骤中做什么的标题。
2. 解释这一步骤的推理或分析过程。
3. 决定是否需要另一个步骤或是否已经准备好给出最终答案。
4. 将你的回应格式化为一个JSON对象，包含"title"、"content"和"next_action"键。"next_action"应该是"continue"或"final_answer"。

在得出最终答案之前，至少使用3个步骤。注意你作为AI的局限性，以及你能做什么和不能做什么。在你的推理中，包括对替代答案的探索。考虑你可能是错的，如果是这样，你的推理可能在哪里有缺陷。充分测试所有其他可能性。当你说你在重新审视时，实际上要使用不同的方法重新审视。在你的分析中使用最佳实践。

有效JSON响应的例子：
{
  "title": "查询的初步分析",
  "content": "为了开始解决这个问题，我们需要仔细检查给定的信息，并确定将指导我们解决过程的关键要素。[你的详细分析在这里]",
  "next_action": "continue"
}` },
      { role: "user", content: query },
    ];

    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      const completion = await apiClient.post('/v1/chat/completions', {
        model: model,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      });
      const endTime = Date.now();

      let stepData;
      try {
        const responseContent = completion.data.choices[0].message.content;
        console.log('Raw API response:', responseContent);  // 添加日志
        stepData = JSON.parse(responseContent);
      } catch (error) {
        console.error('Failed to parse JSON:', completion.data.choices[0].message.content);
        stepData = {
          title: `第 ${i + 1} 步`,
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
