// 文件路径: C:/Users/Administrator/Desktop/openai-o1-chain-main/pages/index.js

import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [query, setQuery] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('https://new1.588686.xyz');
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

    const eventSource = new EventSource(`/api/generate`);

    // 监听服务器发送的消息
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setError(data.error);
        setIsLoading(false);
        eventSource.close();
      } else if (data.step === "Final Answer") {
        setResponse((prevResponse) => [...prevResponse, data]);
        setTotalTime(data.total_thinking_time);
        setIsLoading(false);
        eventSource.close();
      } else {
        setResponse((prevResponse) => [...prevResponse, data]);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      setError('Failed to connect to the server');
      setIsLoading(false);
      eventSource.close();
    };

    // 发送 POST 请求到 API 端点
    fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, apiKey, model, baseUrl })
    }).catch((err) => {
      console.error('Fetch error:', err);
      setError('Failed to send the request');
      setIsLoading(false);
      eventSource.close();
    });
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
            placeholder="输入模型名称（例如：gpt-4o-mini）"
            className={styles.input}
            required
          />
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="输入 API 基础 URL（例如：https://new1.588686.xyz）"
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
            <h3>{step.title}</h3>
            <p>{step.content}</p>
          </div>
        ))}

        {totalTime !== null && (
          <p className={styles.time}>总思考时间：{totalTime.toFixed(2)} 秒</p>
        )}
      </main>
    </div>
  );
}
