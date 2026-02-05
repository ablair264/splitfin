import { logger } from '../utils/logger.js';

export class RateLimiter {
  constructor(options = {}) {
    // Environment-based configuration with safe defaults
    this.config = {
      // Basic throttling
      baseDelayMs: parseInt(process.env.ZOHO_BASE_DELAY_MS) || 500,
      batchSize: parseInt(process.env.ZOHO_BATCH_SIZE) || 25,
      maxRetries: parseInt(process.env.ZOHO_MAX_RETRIES) || 3,
      
      // Rate limiting
      requestsPerSecond: parseInt(process.env.ZOHO_REQUESTS_PER_SECOND) || 10,
      burstSize: parseInt(process.env.ZOHO_BURST_SIZE) || 5,
      
      // Safety limits
      maxRecordsPerSync: parseInt(process.env.ZOHO_MAX_RECORDS_PER_SYNC) || 1000,
      maxConcurrentRequests: parseInt(process.env.ZOHO_MAX_CONCURRENT) || 3,
      
      // Adaptive throttling
      enableAdaptiveThrottling: process.env.ZOHO_ADAPTIVE_THROTTLING === 'true',
      slowResponseThresholdMs: parseInt(process.env.ZOHO_SLOW_RESPONSE_MS) || 2000,
      
      // Circuit breaker
      enableCircuitBreaker: process.env.ZOHO_CIRCUIT_BREAKER === 'true',
      failureThreshold: parseInt(process.env.ZOHO_FAILURE_THRESHOLD) || 5,
      recoveryTimeMs: parseInt(process.env.ZOHO_RECOVERY_TIME_MS) || 60000,
      
      ...options
    };

    // Token bucket for rate limiting
    this.tokens = this.config.burstSize;
    this.lastRefill = Date.now();
    
    // Adaptive throttling state
    this.responseTimeHistory = [];
    this.currentDelayMultiplier = 1;
    
    // Circuit breaker state
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.lastFailureTime = null;
    
    // Request queue for concurrency control
    this.activeRequests = 0;
    this.requestQueue = [];
    
    logger.info('Rate limiter initialized:', this.config);
  }

  // Token bucket algorithm for rate limiting
  async acquireToken() {
    const now = Date.now();
    const timeSinceLastRefill = now - this.lastRefill;
    const tokensToAdd = Math.floor(timeSinceLastRefill / 1000 * this.config.requestsPerSecond);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.config.burstSize, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
    
    if (this.tokens < 1) {
      const waitTime = (1 / this.config.requestsPerSecond) * 1000;
      logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
      await this.delay(waitTime);
      return this.acquireToken();
    }
    
    this.tokens--;
    return true;
  }

  // Circuit breaker check
  checkCircuitBreaker() {
    if (!this.config.enableCircuitBreaker) return true;
    
    if (this.circuitOpen) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.config.recoveryTimeMs) {
        logger.info('Circuit breaker recovering, attempting request');
        this.circuitOpen = false;
        this.consecutiveFailures = 0;
        return true;
      }
      throw new Error('Circuit breaker is open - too many consecutive failures');
    }
    
    return true;
  }

  // Record success/failure for circuit breaker and adaptive throttling
  recordResponse(success, responseTimeMs) {
    if (success) {
      this.consecutiveFailures = 0;
      this.circuitOpen = false;
    } else {
      this.consecutiveFailures++;
      this.lastFailureTime = Date.now();
      
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.circuitOpen = true;
        logger.warn('Circuit breaker opened due to consecutive failures');
      }
    }
    
    // Adaptive throttling based on response times
    if (this.config.enableAdaptiveThrottling && success && responseTimeMs) {
      this.responseTimeHistory.push(responseTimeMs);
      if (this.responseTimeHistory.length > 10) {
        this.responseTimeHistory.shift();
      }
      
      const avgResponseTime = this.responseTimeHistory.reduce((a, b) => a + b, 0) / this.responseTimeHistory.length;
      
      if (avgResponseTime > this.config.slowResponseThresholdMs) {
        this.currentDelayMultiplier = Math.min(3, this.currentDelayMultiplier * 1.2);
        logger.debug(`Increasing delay multiplier to ${this.currentDelayMultiplier} due to slow responses`);
      } else if (avgResponseTime < this.config.slowResponseThresholdMs * 0.5) {
        this.currentDelayMultiplier = Math.max(0.5, this.currentDelayMultiplier * 0.9);
        logger.debug(`Decreasing delay multiplier to ${this.currentDelayMultiplier} due to fast responses`);
      }
    }
  }

  // Get current delay with adaptive adjustment
  getCurrentDelay() {
    return Math.round(this.config.baseDelayMs * this.currentDelayMultiplier);
  }

  // Concurrency control
  async acquireConcurrencySlot() {
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      return new Promise((resolve) => {
        this.requestQueue.push(resolve);
      });
    }
    
    this.activeRequests++;
    return Promise.resolve();
  }

  releaseConcurrencySlot() {
    this.activeRequests--;
    if (this.requestQueue.length > 0) {
      const nextRequest = this.requestQueue.shift();
      this.activeRequests++;
      nextRequest();
    }
  }

  // Main throttling method
  async throttle() {
    this.checkCircuitBreaker();
    await this.acquireToken();
    await this.acquireConcurrencySlot();
    
    const delay = this.getCurrentDelay();
    if (delay > 0) {
      await this.delay(delay);
    }
  }

  // Complete request (call after successful/failed request)
  completeRequest(success = true, responseTimeMs = null) {
    this.releaseConcurrencySlot();
    this.recordResponse(success, responseTimeMs);
  }

  // Utility delay function
  async delay(ms) {
    if (ms <= 0) return;
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current statistics
  getStats() {
    return {
      tokens: this.tokens,
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      delayMultiplier: this.currentDelayMultiplier,
      circuitOpen: this.circuitOpen,
      consecutiveFailures: this.consecutiveFailures,
      avgResponseTime: this.responseTimeHistory.length > 0 
        ? this.responseTimeHistory.reduce((a, b) => a + b, 0) / this.responseTimeHistory.length 
        : 0
    };
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

// Helper function for making rate-limited requests
export async function makeThrottledRequest(requestFn, context = 'unknown') {
  const startTime = Date.now();
  
  try {
    await rateLimiter.throttle();
    logger.debug(`Making throttled request for ${context}`);
    
    const result = await requestFn();
    const responseTime = Date.now() - startTime;
    
    rateLimiter.completeRequest(true, responseTime);
    logger.debug(`Request completed successfully in ${responseTime}ms for ${context}`);
    
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    rateLimiter.completeRequest(false, responseTime);
    
    logger.error(`Request failed after ${responseTime}ms for ${context}:`, error.message);
    throw error;
  }
}