export const logError = (context, err) => {
  console.error(`[${new Date().toISOString()}] [${context}]`, err);
};
