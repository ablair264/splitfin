// src/services/zohoRateLimiter.js
let lastRequestTime = 0;
const minDelay = 1500; // 1.5 seconds between requests (adjust as needed)
const queue = [];
let active = false;

export async function zohoRateLimitedRequest(requestFn) {
  return new Promise((resolve, reject) => {
    queue.push({ requestFn, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (active || queue.length === 0) return;
  active = true;

  const { requestFn, resolve, reject } = queue.shift();
  const now = Date.now();
  const wait = Math.max(0, minDelay - (now - lastRequestTime));
  setTimeout(async () => {
    try {
      lastRequestTime = Date.now();
      const result = await requestFn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      active = false;
      processQueue();
    }
  }, wait);
} 