// pages/api/generate.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: '方法不允许' });
  }

  const { query, apiKey, model, baseUrl } = req.query;

  if (!query || !apiKey || !model || !baseUrl) {
    return res.status(400).json({ message: '缺少必要参数' });
  }

  const systemPrompt = `你是一位专家级AI助手，用中文一步步解释你的推理过程。对于每一步：
1. 提供一个标题，描述你在这一步要做什么。
2. 解释这一步的推理或分析过程。
3. 决定是否需要另一步，或是否准备好给出最终答案。

在给出最终答案之前，至少使用3个步骤。要意识到你作为AI的局限性，明白你能做什么和不能做什么。在你的推理中，包括对替代答案的探索。考虑到你可能会出错，如果出错，你的推理可能在哪里有缺陷。充分测试所有其他可能性。当你说你要重新审视时，实际上要用不同的方法重新审视。在你的分析中使用最佳实践。`;

  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || '请求OpenAI API时出错');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;

    // 解析内容为步骤
    const steps = content.split('\n\n').map((step, index) => {
      const lines = step.split('\n');
      return {
        title: lines[0] || `第 ${index + 1} 步`,
        content: lines.slice(1).join('\n').trim(),
      };
    });

    res.status(200).json({ steps, totalTime });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: '生成响应失败', error: error.message });
  }
}
