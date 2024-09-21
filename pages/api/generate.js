import { createHandler } from 'next-api-handler';  
import { json } from 'micro';  
import { Configuration, OpenAIApi } from 'openai';  

const configuration = new Configuration({  
  apiKey: process.env.OPENAI_API_KEY,  // 确保您设置了环境变量  
});  
const openai = new OpenAIApi(configuration);  

async function apiHandler(req, res) {  
  if (req.method === 'POST') {  
    const { prompt } = await json(req);  

    const messages = [  
      { role: 'system', content: "您是一个AI助手，会逐步解释您的推理过程。" },  
      { role: 'user', content: prompt }  
    ];  

    const responseSteps = await generateResponse(messages);  
    res.status(200).json(responseSteps);  
  } else {  
    res.setHeader('Allow', ['POST']);  
    res.status(405).end(`不允许的方法 ${req.method}`);  
  }  
}  

async function generateResponse(messages) {  
  const steps = [];  
  let attemptCount = 0;  

  while (attemptCount < 3) {  
    try {  
      const response = await openai.createChatCompletion({  
        model: "gpt-3.5-turbo", // 或适合的其他模型  
        messages: messages,  
        max_tokens: 300,  
        temperature: 0.2,  
      });  

      const content = response.data.choices[0].message.content;  
      steps.push(parseResponse(content));  

      // 检查返回的步骤是否指示最终答案  
      if (steps[steps.length - 1].next_action === 'final_answer') {  
        break;  
      }  

      messages.push(response.data.choices[0].message); // 将助手的回复加入消息数列中  

      attemptCount++;  
    } catch (error) {  
      if (attemptCount === 2) {  
        return { error: `多次尝试失败: ${error.message}` };  
      }  
      attemptCount++;  
    }  
  }  
  return steps;  
}  

function parseResponse(content) {  
  // 用于解析助手的响应  
  try {  
    const responseJson = JSON.parse(content);  
    return {  
      title: responseJson.title || "未指定步骤",  
      content: responseJson.content || "没有内容",  
      next_action: responseJson.next_action || "继续"  
    };  
  } catch (error) {  
    return {  
      title: "解析错误",  
      content: "无法解析助手的响应",  
      next_action: "final_answer"  
    };  
  }  
}  

export default createHandler(apiHandler);
