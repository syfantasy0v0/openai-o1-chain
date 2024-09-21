const handleSubmit = async (e) => {
  e.preventDefault();
  setIsLoading(true);
  setResponse([]);
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
        model: 'deepseek-chat',  // 或者让用户选择模型
        baseUrl: 'https://new1.588686.xyz'  // 您的 API 基础 URL
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Failed to generate response');
    }

    const data = await res.json();
    setResponse(data.steps);
    setTotalTime(data.totalTime);
  } catch (error) {
    console.error('Error:', error);
    setError(error.message);
  } finally {
    setIsLoading(false);
  }
};
