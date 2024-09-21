import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [query, setQuery] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [totalTime, setTotalTime] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setResponse('');
    setTotalTime(null);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query, 
          apiKey, 
          model,
          baseUrl
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to generate response');
      }

      const data = await res.json();
      
      // 处理响应，无论是JSON还是纯文本
      if (typeof data.response === 'object' && data.response.content) {
        setResponse(data.response.content);
      } else if (typeof data.response === 'string') {
        setResponse(data.response);
      } else {
        setResponse(JSON.stringify(data.response));
      }
      
      setTotalTime(data.totalTime);
    } catch (error) {
      console.error('Error:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>AI 助手</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          AI 助手
        </h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入您的 API 密钥"
            className={styles.input}
            required
          />
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="输入模型名称 (例如: deepseek-chat)"
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
            placeholder="输入您的问题"
            className={styles.textarea}
            required
          />
          <button type="submit" disabled={isLoading} className={styles.button}>
            {isLoading ? '生成中...' : '生成'}
          </button>
        </form>

        {isLoading && <p className={styles.loading}>正在生成响应...</p>}

        {error && <p className={styles.error}>{error}</p>}

        {response && (
          <div className={styles.response}>
            <h3>响应：</h3>
            <p>{response}</p>
          </div>
        )}

        {totalTime !== null && (
          <p className={styles.time}>总思考时间: {totalTime.toFixed(2)} 秒</p>
        )}
      </main>
    </div>
  );
}
