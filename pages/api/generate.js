const parseStepContent = (stepContent) => {
  try {
    if (typeof stepContent !== 'string') {
      console.error('步骤内容不是字符串:', typeof stepContent);
      return {
        title: "类型错误",
        content: `步骤内容类型错误: ${typeof stepContent}`,
        next_action: 'continue'
      };
    }

    // 尝试解析整个字符串为单个 JSON 对象
    try {
      const parsedContent = JSON.parse(stepContent);
      if (parsedContent.title && parsedContent.content && parsedContent.next_action) {
        return parsedContent;
      }
    } catch (e) {
      // 如果整个字符串解析失败，尝试提取和解析最后一个 JSON 对象
      const jsonRegex = /{[^{}]*}(?!.*{)/;
      const match = stepContent.match(jsonRegex);
      if (match) {
        const parsedContent = JSON.parse(match[0]);
        if (parsedContent.title && parsedContent.content && parsedContent.next_action) {
          return parsedContent;
        }
      }
    }

    // 如果没有找到有效对象，返回基本结构
    console.log('无法提取有效的JSON或JSON结构不正确，使用基本结构');
    return {
      title: "解析失败",
      content: stepContent,
      next_action: 'continue'
    };
  } catch (error) {
    console.error('JSON解析失败:', error);
    return {
      title: "解析错误",
      content: String(stepContent),
      next_action: 'continue'
    };
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: '方法不允许' });
  }

  const { query, apiKey, model, baseUrl } = req.query;

  if (!query || !apiKey || !model || !baseUrl) {
    return res.status(400).json({ message: '缺少必要参数' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const systemPrompt = `你是一位专家级AI助手，用中文一步步解释你的推理过程。对于每一步：
1. 提供一个标题，描述这一步的主要目的。
2. 详细解释这一步的推理或分析过程，包括使用的方法、考虑的因素和得出的结论。
3. 决定是否需要另一步，或是否准备好给出最终答案。
4. 将你的回复格式化为一个JSON对象，包含"title"、"content"和"next_action"键。"next_action"应该是"continue"或"final_answer"。

请遵循以下指导原则：
- 使用至少3个推理步骤，但不超过5个步骤，除非问题特别复杂。
- 在你的推理中，考虑并讨论替代答案或方法。
- 反思可能的错误或推理中的潜在缺陷。
- 使用不同的方法来验证你的结论。
- 考虑问题的实际应用和潜在的边界情况。

记住，你是一个AI助手，有一定的局限性。如果遇到无法确定的信息，请明确说明。
重要：请确保每次回复都只包含一个有效的JSON对象。`;

  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query }
  ];

  const startTime = Date.now();
  let totalTime = 0;

  try {
    let stepCount = 0;
    let continueReasoning = true;
    let consecutiveParseFailures = 0;

    while (continueReasoning && stepCount < 5) {
      stepCount++;
      const stepStartTime = Date.now();

      let response;
      try {
        response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
        }
      } catch (fetchError) {
        console.error('API请求失败:', fetchError);
        sendEvent('error', { message: 'API请求失败', error: fetchError.message });
        break;
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('解析API响应失败:', jsonError);
        sendEvent('error', { message: '解析API响应失败', error: jsonError.message });
        break;
      }

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('API响应格式不正确:', data);
        sendEvent('error', { message: 'API响应格式不正确', error: 'Missing expected data structure' });
        break;
      }

      const rawStepContent = data.choices[0].message.content;

      console.log(`第 ${stepCount} 步原始返回:`, rawStepContent);

      const stepData = parseStepContent(rawStepContent);

      if (stepData.title === "解析失败" || stepData.title === "解析错误") {
        consecutiveParseFailures++;
        if (consecutiveParseFailures >= 3) {
          console.error('连续3次解析失败，终止循环');
          continueReasoning = false;
        }
      } else {
        consecutiveParseFailures = 0;
      }

      sendEvent('step', stepData);
      sendEvent('rawStep', { content: rawStepContent });

      messages.push({ role: "assistant", content: JSON.stringify(stepData) });

      if (stepData.next_action === "final_answer" || stepCount >= 5) {
        continueReasoning = false;
      } else {
        messages.push({ role: "user", content: "请继续分析。" });
      }

      const stepEndTime = Date.now();
      totalTime += (stepEndTime - stepStartTime) / 1000;
    }

    sendEvent('totalTime', { time: totalTime });
    sendEvent('done', {});
  } catch (error) {
    console.error('错误:', error);
    sendEvent('error', { message: '生成响应失败', error: error.message });
  } finally {
    res.end();
  }
}
