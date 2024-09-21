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

    // 查找第一个出现的 { 和最后一个出现的 }
    const startIndex = stepContent.indexOf('{');
    const endIndex = stepContent.lastIndexOf('}');

    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      const jsonContent = stepContent.substring(startIndex, endIndex + 1);
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
