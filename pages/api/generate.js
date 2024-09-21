import { createParser } from 'eventsource-parser';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: '方法不允许' });
  }

  const { query, apiKey, model, baseUrl } = req.query;

  if (!apiKey || !model || !baseUrl) {
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
4. 将你的回复格式化为一个JSON对象，包含"title"、"content"和"next_action"键。"next_action"应该是"continue"或"final_answer"，不要返回任何其它内容，你每次只需要返回一个json，不要返回"好的"之类表示明白的语句，这非常非常重要！！！！
使用尽可能多的推理步骤，至少3步。要意识到你作为AI的局限性，明白你能做什么和不能做什么。在你的推理中，包括对替代答案的探索。考虑到你可能会出错，如果出错，你的推理可能在哪里有缺陷。充分测试所有其他可能性。当你说你要重新审视时，实际用不同的方法重新审视。使用至少3种方法来得出答案。使用最佳实践。`;

  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
    { role: "assistant", content: "谢谢！我现在将按照指示，从问题分解开始，一步步进行思考。" }
  ];

  const startTime = Date.now();
  let totalTime = 0;

  const parseStepContent = (stepContent) => {
    try {
      // 移除可能存在的反引号和"json"标签
      let cleanedContent = stepContent.replace(/^```json\s*|\s*```$/g, '');
      
      // 如果内容已经是一个有效的JSON对象，直接解析
      if (/^\{.*\}$/.test(cleanedContent)) {
        return JSON.parse(cleanedContent);
      }
      
      // 尝试从内容中提取JSON对象
      const jsonMatch = cleanedContent.match(/\{(?:[^{}]|(\{(?:[^{}]|\1)*\}))*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // 如果无法提取有效的JSON，则创建一个基本结构
      console.log('无法提取有效的JSON，使用基本结构');
      return {
        title: "解析失败",
        content: stepContent,
        next_action: 'continue'
      };
    } catch (error) {
      console.error('JSON解析失败:', error);
      return {
        title: "解析错误",
        content: stepContent,
        next_action: 'continue'
      };
    }
  };

  try {
    let stepCount = 0;
    let continueReasoning = true;
    let consecutiveParseFailures = 0;

    while (continueReasoning && stepCount < 10) {
      stepCount++;
      const stepStartTime = Date.now();

      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
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
        throw new Error(errorData.error?.message || 'API请求失败');
      }

      const data = await response.json();
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
