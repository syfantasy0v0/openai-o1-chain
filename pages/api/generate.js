import { createParser } from 'eventsource-parser';

export default async function handler(req, res) {
  // ... [previous code remains the same] ...

  try {
    let stepCount = 0;
    let continueReasoning = true;

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
      const stepContent = data.choices[0].message.content;
      
      let stepData;
      try {
        // Remove any surrounding code block markers and extra backticks
        const cleanedContent = stepContent.replace(/^```[\w]*\n|```$|^`+|`+$/gm, '').trim();
        console.log('Cleaned content:', cleanedContent); // 添加日志输出
        stepData = JSON.parse(cleanedContent);
      } catch (error) {
        console.error('JSON解析失败:', stepContent);
        console.error('解析错误:', error);
        // If parsing fails, create a default structure
        stepData = {
          title: `第 ${stepCount} 步`,
          content: stepContent,
          next_action: 'continue'
        };
      }

      sendEvent('step', stepData);
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
