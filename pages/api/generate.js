import { createParser } from 'eventsource-parser';

const parseStepContent = (stepContent) => {
  try {
    if (!stepContent || typeof stepContent !== 'string') {
      console.error('Invalid step content:', stepContent);
      return {
        title: "Invalid Content",
        content: "Unable to retrieve step content",
        next_action: 'continue'
      };
    }

    // Parse the entire response as JSON
    const parsedResponse = JSON.parse(stepContent);

    if (parsedResponse.choices && parsedResponse.choices[0] && parsedResponse.choices[0].message) {
      const messageContent = parsedResponse.choices[0].message.content;
      
      // Extract all JSON objects from the content
      const jsonObjects = messageContent.match(/\{[\s\S]*?\}/g);

      if (jsonObjects) {
        // Parse and return all valid JSON objects
        return jsonObjects.map(jsonStr => {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.title && parsed.content && parsed.next_action) {
              return parsed;
            }
          } catch (error) {
            console.error('Error parsing JSON object:', error);
          }
          return null;
        }).filter(obj => obj !== null);
      }
    }

    console.log('Unable to extract valid JSON objects, using basic structure');
    return [{
      title: "Parsing Failed",
      content: stepContent,
      next_action: 'continue'
    }];
  } catch (error) {
    console.error('JSON parsing failed:', error);
    return [{
      title: "Parsing Error",
      content: String(stepContent),
      next_action: 'continue'
    }];
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { query, apiKey, model, baseUrl } = req.query;

  if (!query || !apiKey || !model || !baseUrl) {
    return res.status(400).json({ message: 'Missing required parameters' });
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
          throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
        }
      } catch (fetchError) {
        console.error('API request failed:', fetchError);
        sendEvent('error', { message: 'API request failed', error: fetchError.message });
        break;
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse API response:', jsonError);
        sendEvent('error', { message: 'Failed to parse API response', error: jsonError.message });
        break;
      }

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('Invalid API response format:', data);
        sendEvent('error', { message: 'Invalid API response format', error: 'Missing expected data structure' });
        break;
      }

      const rawStepContent = JSON.stringify(data);

      console.log(`Step ${stepCount} raw return:`, rawStepContent);

      const stepData = parseStepContent(rawStepContent);

      if (stepData.length === 0 || (stepData.length === 1 && (stepData[0].title === "Parsing Failed" || stepData[0].title === "Parsing Error"))) {
        consecutiveParseFailures++;
        if (consecutiveParseFailures >= 3) {
          console.error('3 consecutive parse failures, terminating loop');
          continueReasoning = false;
        }
      } else {
        consecutiveParseFailures = 0;
      }

      stepData.forEach((step, index) => {
        sendEvent('step', step);
      });
      sendEvent('rawStep', { content: rawStepContent });

      messages.push({ role: "assistant", content: JSON.stringify(stepData) });

      if (stepData[stepData.length - 1].next_action === "final_answer") {
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
    console.error('Error:', error);
    sendEvent('error', { message: 'Failed to generate response', error: error.message });
  } finally {
    res.end();
  }
}
