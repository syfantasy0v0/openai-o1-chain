import { createParser } from 'eventsource-parser';

const parseStepContent = (stepContent) => {
  try {
    if (stepContent === undefined || stepContent === null) {
      console.error('步骤内容为 undefined 或 null');
      return {
        title: "内容缺失",
        content: "无法获取步骤内容",
        next_action: 'continue'
      };
    }

    if (typeof stepContent !== 'string') {
      console.error('步骤内容不是字符串:', typeof stepContent);
      return {
        title: "类型错误",
        content: `步骤内容类型错误: ${typeof stepContent}`,
        next_action: 'continue'
      };
    }

    // 使用正则表达式匹配JSON对象，忽略前后的其他内容
    const jsonMatch = stepContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonContent = jsonMatch[0];
      // 解析JSON内容
      const parsedContent = JSON.parse(jsonContent);
      // 验证parsed对象是否包含必要的键
      if (parsedContent.title && parsedContent.content && parsedContent.next_action) {
        return parsedContent;
      }
    }

    // 如果无法提取有效的JSON或JSON不包含必要的键，则创建一个基本结构
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
1. 提供一个标题，描述你在这一步要做什么。
2. 解释这一步的推理或分析过程。
3. 决定是否需要另一步，或是否准备好给出最终答案。
4. 将你的回复格式化为一个JSON对象，包含"title"、"content"和"next_action"键。"next_action"应该是"continue"或"final_answer"。
使用尽可能多的推理步骤，至少3步。要意识到你作为AI的局限性，明白你能做什么和不能做什么。在你的推理中，包括对替代答案的探索。考虑到你可能会出错，如果出错，你的推理可能在哪里有缺陷。充分测试所有其他可能性。当你说你要重新审视时，实际用不同的方法重新审视。使用至少3种方法来得出答案。使用最佳实践。`;

  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
    { role: "assistant", content: "谢谢！我现在将按照指示，从问题分解开始，一步步进行思考。" }
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
