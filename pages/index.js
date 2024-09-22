import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

// 新增的解析函数
const parseResponse = (data) => {
  try {
    let parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    
    // 如果响应包含 choices 数组
    if (parsedData.choices && Array.isArray(parsedData.choices)) {
      const content = parsedData.choices[0].message.content;
      
      // 尝试解析 content 中的 JSON
      try {
        const jsonContent = JSON.parse(content);
        if (jsonContent.title && jsonContent.content) {
          return [jsonContent]; // 返回单个步骤的数组
        }
      } catch (e) {
        // content 不是 JSON，继续处理
      }
      
      // 检查是否包含多个 JSON 对象
      const jsonObjects = content.match(/```json\n([\s\S]*?)\n```/g);
      if (jsonObjects) {
        return jsonObjects.map(obj => {
          const cleanJson = obj.replace(/```json\n|\n```/g, '');
          return JSON.parse(cleanJson);
        });
      }
      
      // 如果没有找到 JSON 对象，将整个内容作为一个步骤返回
      return [{
        title: "响应",
        content: content,
        next_action: "final_answer"
      }];
    }
    
    // 如果响应本身就是我们期望的格式
    if (parsedData.title && parsedData.content) {
      return [parsedData];
    }
    
    // 如果都不匹配，返回一个错误步骤
    return [{
      title: "解析错误",
      content: "无法解析响应数据",
      next_action: "final_answer"
    }];
  } catch (error) {
    console.error('解析响应时出错:', error);
    return [{
      title: "解析错误",
      content: `解析响应时出错: ${error.message}`,
      next_action: "final_answer"
    }];
  }
};

export default function Home() {
  const [query, setQuery] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com');
  const [response, setResponse] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalTime, setTotalTime] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setResponse([]);
    setTotalTime(null);
    setError(null);

    const eventSource = new EventSource(`/api/generate?query=${encodeURIComponent(query)}&apiKey=${encodeURIComponent(apiKey)}&model=${encodeURIComponent(model)}&baseUrl=${encodeURIComponent(baseUrl.replace(/\/$/, ''))}`);

    eventSource.addEventListener('step', (event) => {
      const parsedSteps = parseResponse(event.data);
      setResponse(prevResponse => [...prevResponse, ...parsedSteps]);
    });

    eventSource.addEventListener('totalTime', (event) => {
      const data = JSON.parse(event.data);
      setTotalTime(data.time);
    });

    eventSource.addEventListener('error', (event) => {
      const data = JSON.parse(event.data);
      setError(data.message || '生成响应时发生错误');
      setIsLoading(false);
      eventSource.close();
    });

    eventSource.addEventListener('done', () => {
      setIsLoading(false);
      eventSource.close();
    });
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>OpenAI 高级推理链</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          OpenAI 高级推理链
        </h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入您的 OpenAI API 密钥"
            className={styles.input}
            required
          />
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="输入模型名称（如 gpt-4o）"
            className={styles.input}
            required
          />
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="输入 API 基础 URL"
            className={styles.input}
            required
          />
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入您的查询"
            className={styles.textarea}
            required
          />
          <button type="submit" disabled={isLoading} className={styles.button}>
            {isLoading ? '生成中...' : '生成'}
          </button>
        </form>

        {isLoading && <p className={styles.loading}>正在生成响应...</p>}

        {error && <p className={styles.error}>{error}</p>}

        {response.map((step, index) => (
          <div key={index} className={styles.step}>
            <h3>第 {index + 1} 步: {step.title}</h3>
            <p>{step.content}</p>
            {step.next_action === 'final_answer' && <p className={styles.finalAnswer}>这是最终答案</p>}
          </div>
        ))}

        {totalTime !== null && (
          <p className={styles.time}>总思考时间：{totalTime.toFixed(2)} 秒</p>
        )}
      </main>
    </div>
  );
}
