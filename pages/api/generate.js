import { createParser } from 'eventsource-parser';

const parseStepContent = (stepContent) => {
  try {
    if (!stepContent || typeof stepContent !== 'string') {
      console.error('Invalid step content:', stepContent);
      return {
        title: "内容无效",
        content: "无法获取步骤内容",
        next_action: 'continue'
      };
    }

    // 解析整个响应为 JSON
    const parsedResponse = JSON.parse(stepContent);

    if (parsedResponse.choices && parsedResponse.choices[0] && parsedResponse.choices[0].message) {
      const messageContent = parsedResponse.choices[0].message.content;
      
      // 尝试解析消息内容为 JSON
      try {
        const parsedContent = JSON.parse(messageContent);
        if (parsedContent.title && parsedContent.content && parsedContent.next_action) {
          return parsedContent;
        }
      } catch (error) {
        // 如果解析失败，说明消息内容不是 JSON 格式
        console.log('消息内容不是 JSON 格式，尝试提取 JSON 对象');
      }

      // 如果消息内容不是 JSON 格式，尝试提取 JSON 对象
      const jsonMatch = messageContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonContent = jsonMatch[0];
        try {
          const parsedContent = JSON.parse(jsonContent);
          if (parsedContent.title && parsedContent.content && parsedContent.next_action) {
            return parsedContent;
          }
        } catch (error) {
          console.error('JSON 解析失败:', error);
        }
      }
    }

    console.log('无法提取有效的 JSON，使用基本结构');
    return {
      title: "解析失败",
      content: messageContent || stepContent,
      next_action: 'continue'
    };
  } catch (error) {
    console.error('JSON 解析失败:', error);
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

  const systemPrompt = `你是一位专家级AI助手，用中文一步步解释你的推理过程。请严格按照以下格式回复：

1. 为每一步提供一个标题，描述这一步的主要目标或内容。
2. 详细解释这一步的推理或分析过程。
3. 在每一步结束时，决定是继续下一步还是给出最终答案。
4. 将你的回复格式化为一个JSON对象，包含"title"、"content"和"next_action"键。"next_action"应该是"continue"或"final_answer"。

示例格式：
{
  "title": "步骤标题",
  "content": "详细的推理过程和分析...",
  "next_action": "continue"
}

请注意：
- 使用至少3个推理步骤，但不要超过10个步骤。
- 在你的推理中，考虑并分析多种可能性和替代方案。
- 如果你意识到之前的推理可能有误，请明确指出并重新审视。
- 使用不同的方法和角度来验证你的结论。
- 在给出最终答案之前，请确保你已经全面考虑了问题的各个方面。

请记住，你的回答应该既详细又结构化，每一步都应该推进我们对问题的理解。`;

  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  const startTime = Date.now();
  let totalTime = 0;

  try {
    let stepCount = 0;
    let continueReasoning = true;
    let consecutiveParseFailures = 0;

    while (continueReasoning && stepCount < 10) {
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

      const rawStepContent = JSON.stringify(data);

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

      if (stepData.next_action === "final_answer") {
        continueReasoning = false;
      } else if (stepCount < 10) {
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
