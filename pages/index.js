// pages/index.js

import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [query, setQuery] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4'); // 修改默认模型名称
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com');
  const [response, setResponse] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalTime, setTotalTime] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setResponse([]);
    setTotalTime(null);
    setError(null);

    const eventSource = new EventSource(`/api/generate?query=${encodeURIComponent(query)}&apiKey=${encodeURIComponent(apiKey)}&model=${encodeURIComponent(model)}&baseUrl=${encodeURIComponent(baseUrl)}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setError(data.error);
        setIsLoading(false);
        eventSource.close();
      } else {
        setResponse((prevResponse) => [...prevResponse, data]);
        if (data.step === "Final Answer") {
          setTotalTime(data.total_thinking_time);
          setIsLoading(false);
          eventSource.close();
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      setError('Failed to connect to the server');
      setIsLoading(false);
      eventSource.close();
    };
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>OpenAI 推理链</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          OpenAI 推理链
        </h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入你的 API Key"
            className={styles.input}
            required
          />
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="输入模型名称（例如：gpt-4）"
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
            placeholder="输入你的问题"
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
            <h3>{step.step === "Final Answer" ? "最终答案" : `步骤 ${step.step}: ${step.title}`}</h3>
            <p>{step.content}</p>
            {step.thinking_time && <p className={styles.time}>思考时间：{step.thinking_time.toFixed(2)} 秒</p>}
          </div>
        ))}

        {totalTime !== null && (
          <p className={styles.time}>总思考时间：{totalTime.toFixed(2)} 秒</p>
        )}
      </main>
    </div>
  );
}
